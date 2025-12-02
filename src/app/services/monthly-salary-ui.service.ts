import { Injectable } from '@angular/core';
import { EmployeeService } from './employee.service';
import { MonthlySalaryService } from './monthly-salary.service';
import { SettingsService } from './settings.service';
import {
  SalaryCalculationService,
  TeijiKetteiResult,
  SuijiCandidate,
  ExcludedSuijiReason,
  SuijiKouhoResult,
} from './salary-calculation.service';
import { SuijiService } from './suiji.service';
import { ValidationService } from './validation.service';
import { Employee } from '../models/employee.model';
import { SalaryItem } from '../models/salary-item.model';
import { SalaryItemEntry, MonthlySalaryData } from '../models/monthly-salary.model';

export interface MonthlySalaryUIState {
  employees: Employee[];
  salaryItems: SalaryItem[];
  salaryItemData: { [key: string]: { [itemId: string]: number } };
  workingDaysData: { [key: string]: number };
  salaries: { [key: string]: { total: number; fixed: number; variable: number } };
  year: number;
  rates: any;
  gradeTable: any[];
  results: { [employeeId: string]: TeijiKetteiResult };
  exemptMonths: { [employeeId: string]: number[] };
  exemptReasons: { [key: string]: string };
  rehabHighlightMonths: { [employeeId: string]: number[] };
  errorMessages: { [employeeId: string]: string[] };
  warningMessages: { [employeeId: string]: string[] };
  infoByEmployee: {
    [employeeId: string]: {
      avg: number | null;
      standard: number | null;
      rank: number | null;
      premiums: any;
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class MonthlySalaryUIService {

  constructor(
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private salaryCalculationService: SalaryCalculationService,
    private suijiService: SuijiService,
    private validationService: ValidationService
  ) {}

  /**
   * 初期データをロード
   */
  async loadAllData(year: number, months: number[]): Promise<MonthlySalaryUIState> {
    const employees = await this.employeeService.getAllEmployees();
    
    // エラー・警告メッセージを初期化
    const errorMessages: { [employeeId: string]: string[] } = {};
    const warningMessages: { [employeeId: string]: string[] } = {};
    for (const emp of employees) {
      errorMessages[emp.id] = [];
      warningMessages[emp.id] = [];
    }

    // 給与項目マスタを読み込む
    let salaryItems = await this.settingsService.loadSalaryItems(year);
    if (salaryItems.length === 0) {
      warningMessages['system'] = ['先に給与項目マスタを設定してください'];
    }

    // 給与項目をソート（orderがない場合はname昇順）
    salaryItems.sort((a, b) => {
      const orderA = (a as any).order ?? 999;
      const orderB = (b as any).order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    // 料率と等級表を取得
    const { rates, gradeTable } = await this.loadRatesAndGradeTable(year, employees);

    // 標準報酬等級表が空の場合の警告
    if (gradeTable.length === 0) {
      warningMessages['system'] = [
        ...(warningMessages['system'] || []),
        '標準報酬等級表が設定されていません。設定画面で標準報酬等級表を設定してください。',
      ];
    }

    // 全従業員×全月のsalariesオブジェクトを初期化（後方互換性）
    const salaries: { [key: string]: { total: number; fixed: number; variable: number } } = {};
    const salaryItemData: { [key: string]: { [itemId: string]: number } } = {};
    const workingDaysData: { [key: string]: number } = {};
    
    for (const emp of employees) {
      for (const month of months) {
        const key = this.getSalaryKey(emp.id, month);
        if (!salaries[key]) {
          salaries[key] = { total: 0, fixed: 0, variable: 0 };
        }
        // 項目別データも初期化
        const itemKey = this.getSalaryItemKey(emp.id, month);
        if (!salaryItemData[itemKey]) {
          salaryItemData[itemKey] = {};
        }
        // 支払基礎日数も初期化（デフォルト値は月の日数に応じて設定、通常は月末日）
        const workingDaysKey = this.getWorkingDaysKey(emp.id, month);
        if (workingDaysData[workingDaysKey] === undefined) {
          // 月の日数をデフォルト値として設定
          const daysInMonth = new Date(year, month, 0).getDate();
          workingDaysData[workingDaysKey] = daysInMonth;
        }
      }
    }

    // 既存の給与データを読み込む
    const loadedData = await this.loadExistingSalaries(
      employees,
      months,
      year,
      salaryItemData,
      workingDaysData,
      salaries,
      salaryItems
    );

    // 全従業員の定時決定を計算
    const results: { [employeeId: string]: TeijiKetteiResult } = {};
    for (const emp of employees) {
      results[emp.id] = this.calculateTeijiKettei(
        emp.id,
        loadedData.salaries,
        gradeTable,
        year
      );
    }

    // 全従業員の計算結果情報を取得
    const { infoByEmployee, exemptMonths, exemptReasons, errorMessages: calcErrors, warningMessages: calcWarnings } = 
      await this.updateAllCalculatedInfo(
        employees,
        loadedData.salaries,
        months,
        gradeTable,
        year
      );

    // エラー・警告メッセージをマージ
    for (const empId in calcErrors) {
      errorMessages[empId] = calcErrors[empId];
    }
    for (const empId in calcWarnings) {
      warningMessages[empId] = calcWarnings[empId];
    }

    // 復職後随時改定の強調月を取得
    const rehabHighlightMonths = this.getRehabHighlightMonths(employees, year);

    return {
      employees,
      salaryItems,
      salaryItemData: loadedData.salaryItemData,
      workingDaysData: loadedData.workingDaysData,
      salaries: loadedData.salaries,
      year,
      rates,
      gradeTable,
      results,
      exemptMonths,
      exemptReasons,
      rehabHighlightMonths,
      errorMessages,
      warningMessages,
      infoByEmployee
    };
  }

  /**
   * 年度変更時の処理
   */
  async onYearChange(
    year: number,
    employees: Employee[],
    months: number[],
    currentSalaryItems: SalaryItem[],
    currentSalaryItemData: { [key: string]: { [itemId: string]: number } },
    currentWorkingDaysData: { [key: string]: number },
    currentSalaries: { [key: string]: { total: number; fixed: number; variable: number } },
    currentResults: { [employeeId: string]: TeijiKetteiResult }
  ): Promise<{
    rates: any;
    gradeTable: any[];
    salaryItems: SalaryItem[];
    salaryItemData: { [key: string]: { [itemId: string]: number } };
    workingDaysData: { [key: string]: number };
    salaries: { [key: string]: { total: number; fixed: number; variable: number } };
    results: { [employeeId: string]: TeijiKetteiResult };
    infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    };
    exemptMonths: { [employeeId: string]: number[] };
    exemptReasons: { [key: string]: string };
    errorMessages: { [employeeId: string]: string[] };
    warningMessages: { [employeeId: string]: string[] };
  }> {
    // 料率と等級表を取得
    const { rates, gradeTable } = await this.loadRatesAndGradeTable(year, employees);
    
    // 給与項目マスタを読み込む
    const salaryItems = await this.settingsService.loadSalaryItems(year);
    
    // 既存の給与データを読み込む
    const loadedData = await this.loadExistingSalaries(
      employees,
      months,
      year,
      currentSalaryItemData,
      currentWorkingDaysData,
      currentSalaries,
      salaryItems
    );

    // 全従業員の定時決定を計算
    const results: { [employeeId: string]: TeijiKetteiResult } = {};
    for (const emp of employees) {
      results[emp.id] = this.calculateTeijiKettei(
        emp.id,
        loadedData.salaries,
        gradeTable,
        year
      );
    }

    // 全従業員の計算結果情報を取得
    const { infoByEmployee, exemptMonths, exemptReasons, errorMessages: calcErrors, warningMessages: calcWarnings } = 
      await this.updateAllCalculatedInfo(
        employees,
        loadedData.salaries,
        months,
        gradeTable,
        year
      );

    // エラー・警告メッセージを初期化
    const errorMessages: { [employeeId: string]: string[] } = {};
    const warningMessages: { [employeeId: string]: string[] } = {};
    for (const emp of employees) {
      errorMessages[emp.id] = [];
      warningMessages[emp.id] = [];
    }

    // エラー・警告メッセージをマージ
    for (const empId in calcErrors) {
      errorMessages[empId] = calcErrors[empId];
    }
    for (const empId in calcWarnings) {
      warningMessages[empId] = calcWarnings[empId];
    }

    // 給与項目マスタが空の場合の警告を追加
    if (salaryItems.length === 0) {
      warningMessages['system'] = ['先に給与項目マスタを設定してください'];
    }
    // 標準報酬等級表が空の場合の警告を追加
    if (gradeTable.length === 0) {
      warningMessages['system'] = [
        ...(warningMessages['system'] || []),
        '標準報酬等級表が設定されていません。設定画面で標準報酬等級表を設定してください。',
      ];
    }

    return {
      rates,
      gradeTable,
      salaryItems,
      salaryItemData: loadedData.salaryItemData,
      workingDaysData: loadedData.workingDaysData,
      salaries: loadedData.salaries,
      results,
      infoByEmployee,
      exemptMonths,
      exemptReasons,
      errorMessages,
      warningMessages
    };
  }

  /**
   * 料率と等級表を読み込む
   */
  async loadRatesAndGradeTable(
    year: number,
    employees: Employee[]
  ): Promise<{ rates: any; gradeTable: any[] }> {
    // 従業員の都道府県を取得（最初の従業員の都道府県を使用、デフォルトはtokyo）
    const prefecture =
      employees.length > 0 && employees[0].prefecture
        ? employees[0].prefecture
        : 'tokyo';
    const rates = await this.settingsService.getRates(
      year.toString(),
      prefecture
    );
    const gradeTable = await this.settingsService.getStandardTable(year);
    console.log(
      `[monthly-salaries] 年度=${year}, 標準報酬等級表の件数=${gradeTable.length}`
    );
    if (gradeTable.length > 0) {
      console.log(
        `[monthly-salaries] 標準報酬等級表のサンプル:`,
        gradeTable.slice(0, 3)
      );
    }
    return { rates, gradeTable };
  }

  /**
   * 既存の給与データを読み込む
   */
  async loadExistingSalaries(
    employees: Employee[],
    months: number[],
    year: number,
    currentSalaryItemData: { [key: string]: { [itemId: string]: number } },
    currentWorkingDaysData: { [key: string]: number },
    currentSalaries: { [key: string]: { total: number; fixed: number; variable: number } },
    salaryItems: SalaryItem[]
  ): Promise<{
    salaryItemData: { [key: string]: { [itemId: string]: number } };
    workingDaysData: { [key: string]: number };
    salaries: { [key: string]: { total: number; fixed: number; variable: number } };
  }> {
    const salaryItemData = { ...currentSalaryItemData };
    const workingDaysData = { ...currentWorkingDaysData };
    const salaries = { ...currentSalaries };

    for (const emp of employees) {
      const data = await this.monthlySalaryService.getEmployeeSalary(
        emp.id,
        year
      );
      if (!data) continue;

      for (const month of months) {
        const monthKey = month.toString();
        const monthData = data[monthKey];

        if (monthData) {
          // 新しい項目別形式を優先
          if (monthData.salaryItems && Array.isArray(monthData.salaryItems)) {
            const itemKey = this.getSalaryItemKey(emp.id, month);
            salaryItemData[itemKey] = {};
            for (const entry of monthData.salaryItems) {
              salaryItemData[itemKey][entry.itemId] = entry.amount;
            }
            // 集計を更新
            this.updateSalaryTotals(
              emp.id,
              month,
              salaryItemData,
              salaries,
              salaryItems
            );
          } else {
            // 既存形式のフォールバック
            const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
            const variable =
              monthData.variableSalary ?? monthData.variable ?? 0;
            const total =
              monthData.totalSalary ?? monthData.total ?? fixed + variable;

            const salaryKey = this.getSalaryKey(emp.id, month);
            salaries[salaryKey] = { total, fixed, variable };
          }

          // 支払基礎日数を読み込む
          const workingDaysKey = this.getWorkingDaysKey(emp.id, month);
          if (
            monthData.workingDays !== undefined &&
            monthData.workingDays !== null
          ) {
            workingDaysData[workingDaysKey] = monthData.workingDays;
          } else {
            // デフォルト値として月の日数を設定（既存データがない場合のみ）
            if (workingDaysData[workingDaysKey] === undefined) {
              const daysInMonth = new Date(year, month, 0).getDate();
              workingDaysData[workingDaysKey] = daysInMonth;
            }
          }
        }
      }
    }

    return { salaryItemData, workingDaysData, salaries };
  }

  /**
   * 給与データを保存
   */
  async saveAllSalaries(
    employees: Employee[],
    months: number[],
    year: number,
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    workingDaysData: { [key: string]: number },
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    exemptMonths: { [employeeId: string]: number[] },
    salaryItems: SalaryItem[],
    gradeTable: any[]
  ): Promise<{
    suijiAlerts: SuijiKouhoResult[];
  }> {
    for (const emp of employees) {
      const payload: any = {};

      for (const month of months) {
        // 支払基礎日数を取得（免除月でも取得）
        const workingDaysKey = this.getWorkingDaysKey(emp.id, month);
        const workingDays =
          workingDaysData[workingDaysKey] ??
          new Date(year, month, 0).getDate();

        // 免除月の場合はスキップ（0として扱う）
        if (exemptMonths[emp.id]?.includes(month)) {
          continue;
        }

        const itemKey = this.getSalaryItemKey(emp.id, month);
        const itemEntries: SalaryItemEntry[] = [];

        for (const item of salaryItems) {
          const amount = salaryItemData[itemKey]?.[item.id] ?? 0;
          if (amount > 0) {
            itemEntries.push({ itemId: item.id, amount });
          }
        }

        // 項目別入力がある場合
        if (itemEntries.length > 0) {
          const totals = this.salaryCalculationService.calculateSalaryTotals(
            itemEntries,
            salaryItems
          );
          payload[month.toString()] = {
            salaryItems: itemEntries,
            fixedTotal: totals.fixedTotal,
            variableTotal: totals.variableTotal,
            total: totals.total,
            workingDays: workingDays,
            // 後方互換性
            fixed: totals.fixedTotal,
            variable: totals.variableTotal,
            totalSalary: totals.total,
            fixedSalary: totals.fixedTotal,
            variableSalary: totals.variableTotal,
          };
        } else {
          // 項目別入力がない場合、salariesオブジェクトから取得
          const salaryKey = this.getSalaryKey(emp.id, month);
          const salaryData = salaries[salaryKey];
          if (
            salaryData &&
            (salaryData.total > 0 ||
              salaryData.fixed > 0 ||
              salaryData.variable > 0)
          ) {
            const fixed = salaryData.fixed || 0;
            const variable = salaryData.variable || 0;
            const total = salaryData.total || fixed + variable;
            payload[month.toString()] = {
              fixedTotal: fixed,
              variableTotal: variable,
              total: total,
              workingDays: workingDays,
              // 後方互換性
              fixed: fixed,
              variable: variable,
              totalSalary: total,
              fixedSalary: fixed,
              variableSalary: variable,
            };
          }
        }
      }

      if (Object.keys(payload).length > 0) {
        await this.monthlySalaryService.saveEmployeeSalary(
          emp.id,
          year,
          payload
        );
      }
    }

    // 固定的賃金の変動検出
    const salaryDataForDetection: { [key: string]: MonthlySalaryData } = {};
    for (const emp of employees) {
      for (const month of months) {
        const key = this.getSalaryKey(emp.id, month);
        const salaryData = salaries[key];
        if (salaryData) {
          const detectionKey = `${emp.id}_${month}`;
          salaryDataForDetection[detectionKey] = {
            fixedTotal: salaryData.fixed,
            variableTotal: salaryData.variable,
            total: salaryData.total,
          };
        }
      }
    }

    const fixedChanges = this.suijiService.detectFixedSalaryChange(
      salaryDataForDetection,
      salaryItems
    );
    console.log('固定的賃金の変動検出結果:', fixedChanges);

    // 随時改定アラートをリセット
    const suijiAlerts: SuijiKouhoResult[] = [];

    // 各変動について3か月平均を計算
    for (const change of fixedChanges) {
      const average = this.suijiService.calculateThreeMonthAverage(
        salaryDataForDetection,
        change.employeeId,
        change.changeMonth
      );
      const newGrade =
        average !== null
          ? this.suijiService.getGradeFromAverage(average, gradeTable)
          : null;

      // 現行等級を取得（変動月の前月の給与から判定）
      let currentGrade: number | null = null;
      if (change.changeMonth > 1) {
        const prevMonthKey = `${change.employeeId}_${change.changeMonth - 1}`;
        const prevMonthData = salaryDataForDetection[prevMonthKey];
        if (prevMonthData) {
          const prevMonthTotal = prevMonthData.total ?? 0;
          if (prevMonthTotal > 0) {
            currentGrade = this.suijiService.getGradeFromAverage(
              prevMonthTotal,
              gradeTable
            );
          }
        }
      }

      console.log(
        `従業員ID: ${change.employeeId}, 変動月: ${
          change.changeMonth
        }月, 3か月平均: ${average?.toLocaleString() ?? 'null'}円 → 等級: ${
          newGrade ?? '該当なし'
        }`
      );

      // 随時改定の本判定
      const suijiResult = this.suijiService.judgeSuijiKouho(
        change,
        currentGrade,
        newGrade,
        average
      );
      if (suijiResult) {
        console.log('随時改定候補:', suijiResult);

        // isEligible=trueの場合のみFirestoreに保存し、アラートに追加
        if (suijiResult.isEligible) {
          await this.suijiService.saveSuijiKouho(year, suijiResult);
          suijiAlerts.push(suijiResult);
        }
      }
    }

    return { suijiAlerts };
  }

  /**
   * 給与集計を更新
   */
  updateSalaryTotals(
    employeeId: string,
    month: number,
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    salaryItems: SalaryItem[]
  ): void {
    const key = this.getSalaryItemKey(employeeId, month);
    const itemEntries: SalaryItemEntry[] = [];

    for (const item of salaryItems) {
      const amount = salaryItemData[key]?.[item.id] ?? 0;
      if (amount > 0) {
        itemEntries.push({ itemId: item.id, amount });
      }
    }

    // 集計メソッドを使用
    const totals = this.salaryCalculationService.calculateSalaryTotals(
      itemEntries,
      salaryItems
    );

    // 後方互換性のためsalariesにも設定
    const salaryKey = this.getSalaryKey(employeeId, month);
    salaries[salaryKey] = {
      total: totals.total,
      fixed: totals.fixedTotal,
      variable: totals.variableTotal,
    };
  }

  /**
   * 全従業員の計算結果情報を更新
   */
  async updateAllCalculatedInfo(
    employees: Employee[],
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    months: number[],
    gradeTable: any[],
    year: number
  ): Promise<{
    infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    };
    exemptMonths: { [employeeId: string]: number[] };
    exemptReasons: { [key: string]: string };
    errorMessages: { [employeeId: string]: string[] };
    warningMessages: { [employeeId: string]: string[] };
  }> {
    const infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    } = {};
    const errorMessages: { [employeeId: string]: string[] } = {};
    const warningMessages: { [employeeId: string]: string[] } = {};

    for (const emp of employees) {
      const { errors, warnings } = await this.updateCalculatedInfo(
        emp,
        salaries,
        months,
        gradeTable,
        year,
        infoByEmployee
      );
      errorMessages[emp.id] = errors;
      warningMessages[emp.id] = warnings;
    }

    // 免除月を構築
    const { exemptMonths, exemptReasons } = this.buildExemptMonths(
      employees,
      months,
      year
    );

    return { infoByEmployee, exemptMonths, exemptReasons, errorMessages, warningMessages };
  }

  /**
   * 従業員の計算結果情報を更新
   */
  private async updateCalculatedInfo(
    emp: Employee,
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    months: number[],
    gradeTable: any[],
    year: number,
    infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    }
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const avg = this.getAverageForAprToJun(emp.id, salaries);
    const stdResult =
      avg !== null ? this.getStandardMonthlyRemuneration(avg, gradeTable) : null;
    const standard = stdResult ? stdResult.standard : null;
    const rank = stdResult ? stdResult.rank : null;

    const age = this.calculateAge(emp.birthDate);
    // 4月の給与データを取得（定時決定の基準月）
    const aprilKey = this.getSalaryKey(emp.id, 4);
    const aprilSalary = salaries[aprilKey];
    const fixedSalary = aprilSalary?.fixed || 0;
    const variableSalary = aprilSalary?.variable || 0;

    const premiums =
      standard !== null
        ? await this.salaryCalculationService.calculateMonthlyPremiums(
            emp,
            year,
            4,
            fixedSalary,
            variableSalary,
            gradeTable
          )
        : null;

    // エラーチェック
    const result = this.validationService.checkEmployeeErrors(
      emp,
      age,
      premiums
    );

    // 結果を保存
    infoByEmployee[emp.id] = {
      avg,
      standard,
      rank,
      premiums,
    };

    return { errors: result.errors, warnings: result.warnings };
  }

  /**
   * 免除月を構築
   */
  buildExemptMonths(
    employees: Employee[],
    months: number[],
    year: number
  ): {
    exemptMonths: { [employeeId: string]: number[] };
    exemptReasons: { [key: string]: string };
  } {
    const exemptMonths: { [employeeId: string]: number[] } = {};
    const exemptReasons: { [key: string]: string } = {};
    
    for (const emp of employees) {
      exemptMonths[emp.id] = [];

      for (const month of months) {
        // 各月の免除判定（Service層のメソッドを使用）
        const exemptResult =
          this.salaryCalculationService.getExemptReasonForMonth(
            emp,
            year,
            month
          );
        if (exemptResult.exempt) {
          if (!exemptMonths[emp.id].includes(month)) {
            exemptMonths[emp.id].push(month);
          }
          // 免除理由を保存
          const key = `${emp.id}_${month}`;
          exemptReasons[key] = exemptResult.reason;
        }
      }
    }

    return { exemptMonths, exemptReasons };
  }

  /**
   * 免除理由を取得
   */
  getExemptReason(
    employeeId: string,
    month: number,
    exemptReasons: { [key: string]: string }
  ): string {
    const key = `${employeeId}_${month}`;
    const reason = exemptReasons[key] || '';
    // 理由から「産休中」「育休中」を判定
    if (reason.includes('産前産後休業')) {
      return '産休中';
    } else if (reason.includes('育児休業')) {
      return '育休中';
    }
    return '免除中'; // フォールバック
  }

  /**
   * 定時決定を計算
   */
  calculateTeijiKettei(
    employeeId: string,
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    gradeTable: any[],
    year: number
  ): TeijiKetteiResult {
    const result = this.salaryCalculationService.calculateTeijiKettei(
      employeeId,
      salaries,
      gradeTable,
      year
    );
    console.log(
      `[monthly-salaries] 定時決定計算: 従業員ID=${employeeId}, 年度=${year}, 等級=${result.grade}, 標準報酬=${result.standardMonthlyRemuneration}, 等級表件数=${gradeTable.length}`
    );
    return result;
  }

  /**
   * 復職後随時改定の強調月を取得
   */
  getRehabHighlightMonths(
    employees: Employee[],
    year: number
  ): { [employeeId: string]: number[] } {
    const result: { [employeeId: string]: number[] } = {};
    for (const emp of employees) {
      result[emp.id] = this.salaryCalculationService.getRehabHighlightMonths(
        emp,
        year.toString()
      );
    }
    return result;
  }

  /**
   * 給与キーを取得
   */
  getSalaryKey(employeeId: string, month: number): string {
    return this.salaryCalculationService.getSalaryKey(employeeId, month);
  }

  /**
   * 給与項目キーを取得
   */
  getSalaryItemKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 勤務日数キーを取得
   */
  getWorkingDaysKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 4〜6月の平均を取得
   */
  getAverageForAprToJun(
    employeeId: string,
    salaries: { [key: string]: { total: number; fixed: number; variable: number } }
  ): number | null {
    return this.salaryCalculationService.getAverageForAprToJun(
      employeeId,
      salaries
    );
  }

  /**
   * 標準報酬月額を取得
   */
  getStandardMonthlyRemuneration(
    avg: number | null,
    gradeTable: any[]
  ): { rank: number; standard: number } | null {
    if (avg === null) return null;
    const result = this.salaryCalculationService.findGrade(
      gradeTable,
      avg
    );
    if (!result) return null;
    return { rank: result.grade, standard: result.remuneration };
  }

  /**
   * 年齢を計算
   */
  calculateAge(birthDate: string): number {
    return this.salaryCalculationService.calculateAge(birthDate);
  }
}

