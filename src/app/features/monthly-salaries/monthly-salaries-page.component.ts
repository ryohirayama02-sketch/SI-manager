import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../services/employee.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
import {
  SalaryCalculationService,
  TeijiKetteiResult,
  SuijiCandidate,
  RehabSuijiCandidate,
  ExcludedSuijiReason,
  SuijiKouhoResult,
} from '../../services/salary-calculation.service';
import { SuijiService } from '../../services/suiji.service';
import { ValidationService } from '../../services/validation.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { Employee } from '../../models/employee.model';
import { SalaryItem } from '../../models/salary-item.model';
import {
  SalaryItemEntry,
  MonthlySalaryData,
} from '../../models/monthly-salary.model';
import { SalaryInputSectionComponent } from './components/salary-input-section/salary-input-section.component';
import { CalculationResultSectionComponent } from './components/calculation-result-section/calculation-result-section.component';
import { ErrorWarningSectionComponent } from './components/error-warning-section/error-warning-section.component';
import { SalaryCsvImportComponent } from './components/salary-csv-import/salary-csv-import.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-monthly-salaries-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SalaryInputSectionComponent,
    CalculationResultSectionComponent,
    ErrorWarningSectionComponent,
    SalaryCsvImportComponent,
  ],
  templateUrl: './monthly-salaries-page.component.html',
  styleUrl: './monthly-salaries-page.component.css',
})
export class MonthlySalariesPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  salaryItems: SalaryItem[] = [];
  // 項目別入力データ: { employeeId_month: { itemId: amount } }
  salaryItemData: { [key: string]: { [itemId: string]: number } } = {};
  // 後方互換性のため残す
  salaries: {
    [key: string]: { total: number; fixed: number; variable: number };
  } = {};
  year: number = new Date().getFullYear();
  availableYears: number[] = [];
  rates: any = null;
  gradeTable: any[] = [];
  results: { [employeeId: string]: TeijiKetteiResult } = {};
  suijiCandidates: SuijiCandidate[] = [];
  excludedSuijiReasons: ExcludedSuijiReason[] = [];
  rehabSuijiCandidates: SuijiKouhoResult[] = [];

  // エラー・警告メッセージ（従業員IDをキーとする）
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};

  // 随時改定アラート
  suijiAlerts: SuijiKouhoResult[] = [];
  showSuijiDialog: boolean = false;

  // 計算結果情報（従業員IDをキーとする）
  infoByEmployee: {
    [employeeId: string]: {
      avg: number | null;
      standard: number | null;
      rank: number | null;
      premiums: any;
    };
  } = {};

  // 免除月情報（従業員IDをキーとする）
  exemptMonths: { [employeeId: string]: number[] } = {};
  // 加入区分購読用
  eligibilitySubscription: Subscription | null = null;

  // CSVインポート関連
  csvImportText: string = '';
  csvImportResult: { type: 'success' | 'error'; message: string } | null = null;

  constructor(
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private salaryCalculationService: SalaryCalculationService,
    private suijiService: SuijiService,
    private validationService: ValidationService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private router: Router
  ) {
    // 年度選択用の年度リストを生成（2023〜2026）
    for (let y = 2023; y <= 2026; y++) {
      this.availableYears.push(y);
    }
  }

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();

    // エラー・警告メッセージを初期化
    for (const emp of this.employees) {
      this.errorMessages[emp.id] = [];
      this.warningMessages[emp.id] = [];
    }

    // 給与項目マスタを読み込む
    this.salaryItems = await this.settingsService.loadSalaryItems(this.year);
    if (this.salaryItems.length === 0) {
      this.warningMessages['system'] = ['先に給与項目マスタを設定してください'];
    }

    // 給与項目をソート（orderがない場合はname昇順）
    this.salaryItems.sort((a, b) => {
      const orderA = (a as any).order ?? 999;
      const orderB = (b as any).order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    // 料率と等級表を取得
    await this.loadRatesAndGradeTable();

    // 標準報酬等級表が空の場合の警告
    if (this.gradeTable.length === 0) {
      this.warningMessages['system'] = [
        ...(this.warningMessages['system'] || []),
        '標準報酬等級表が設定されていません。設定画面で標準報酬等級表を設定してください。',
      ];
    }

    // 全従業員×全月のsalariesオブジェクトを初期化（後方互換性）
    for (const emp of this.employees) {
      for (const month of this.months) {
        const key = this.getSalaryKey(emp.id, month);
        if (!this.salaries[key]) {
          this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
        }
        // 項目別データも初期化
        const itemKey = this.getSalaryItemKey(emp.id, month);
        if (!this.salaryItemData[itemKey]) {
          this.salaryItemData[itemKey] = {};
        }
      }
    }

    await this.loadExistingSalaries();

    // 全従業員の定時決定を計算
    for (const emp of this.employees) {
      this.calculateTeijiKettei(emp.id);
    }

    // 全従業員の計算結果情報を取得
    await this.updateAllCalculatedInfo();

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService
      .observeEligibility()
      .subscribe(() => {
        this.reloadEligibility();
      });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  async reloadEligibility(): Promise<void> {
    // 加入区分が変更された場合、計算結果を再計算
    await this.updateAllCalculatedInfo();
  }

  async reloadRates(): Promise<void> {
    await this.loadRatesAndGradeTable();
  }

  async loadRatesAndGradeTable(): Promise<void> {
    // 従業員の都道府県を取得（最初の従業員の都道府県を使用、デフォルトはtokyo）
    const prefecture = this.employees.length > 0 && this.employees[0].prefecture
      ? this.employees[0].prefecture
      : 'tokyo';
    this.rates = await this.settingsService.getRates(
      this.year.toString(),
      prefecture
    );
    this.gradeTable = await this.settingsService.getStandardTable(this.year);
    console.log(
      `[monthly-salaries] 年度=${this.year}, 標準報酬等級表の件数=${this.gradeTable.length}`
    );
    if (this.gradeTable.length > 0) {
      console.log(
        `[monthly-salaries] 標準報酬等級表のサンプル:`,
        this.gradeTable.slice(0, 3)
      );
    }
  }

  async onYearChange(): Promise<void> {
    // 年度変更時にデータを再読み込み
    await this.loadRatesAndGradeTable();
    this.salaryItems = await this.settingsService.loadSalaryItems(this.year);
    await this.loadExistingSalaries();
    // 全従業員の定時決定を計算
    for (const emp of this.employees) {
      this.calculateTeijiKettei(emp.id);
    }
    await this.updateAllCalculatedInfo();
  }

  getSalaryKey(employeeId: string, month: number): string {
    return this.salaryCalculationService.getSalaryKey(employeeId, month);
  }

  getSalaryItemKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  async onSalaryItemChange(event: {
    employeeId: string;
    month: number;
    itemId: string;
    value: string | number;
  }): Promise<void> {
    const { employeeId, month, itemId, value } = event;
    const key = this.getSalaryItemKey(employeeId, month);
    if (!this.salaryItemData[key]) {
      this.salaryItemData[key] = {};
    }
    this.salaryItemData[key][itemId] = value ? Number(value) : 0;

    // 自動集計
    this.updateSalaryTotals(employeeId, month);

    // バリデーション実行
    this.validateSalaryData(employeeId);

    // 4〜6月の入力が変更された場合は定時決定を再計算
    if (month >= 4 && month <= 6) {
      this.calculateTeijiKettei(employeeId);
      // 計算結果情報を更新
      const emp = this.employees.find((e) => e.id === employeeId);
      if (emp) {
        await this.updateCalculatedInfo(emp);
      }
    }

    this.updateRehabSuiji(employeeId);
  }

  updateSalaryTotals(employeeId: string, month: number): void {
    const key = this.getSalaryItemKey(employeeId, month);
    const itemEntries: SalaryItemEntry[] = [];

    for (const item of this.salaryItems) {
      const amount = this.salaryItemData[key]?.[item.id] ?? 0;
      if (amount > 0) {
        itemEntries.push({ itemId: item.id, amount });
      }
    }

    // 集計メソッドを使用
    const totals = this.salaryCalculationService.calculateSalaryTotals(
      itemEntries,
      this.salaryItems
    );

    // 後方互換性のためsalariesにも設定
    const salaryKey = this.getSalaryKey(employeeId, month);
    this.salaries[salaryKey] = {
      total: totals.total,
      fixed: totals.fixedTotal,
      variable: totals.variableTotal,
    };
  }

  getSalaryData(
    employeeId: string,
    month: number
  ): { total: number; fixed: number; variable: number } {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    return this.salaries[key];
  }

  async onSalaryChange(employeeId: string, month: number): Promise<void> {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }

    // バリデーション実行
    this.validateSalaryData(employeeId);

    // 4〜6月の入力が変更された場合は定時決定を再計算
    if (month >= 4 && month <= 6) {
      this.calculateTeijiKettei(employeeId);
      // 計算結果情報を更新
      const emp = this.employees.find((e) => e.id === employeeId);
      if (emp) {
        await this.updateCalculatedInfo(emp);
      }
    }

    this.updateRehabSuiji(employeeId);
  }

  onSalaryTotalChange(
    employeeId: string,
    month: number,
    value: string | number
  ): void {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    this.salaries[key].total = value ? Number(value) : 0;
    this.onSalaryChange(employeeId, month);
  }

  onSalaryFixedChange(
    employeeId: string,
    month: number,
    value: string | number
  ): void {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    this.salaries[key].fixed = value ? Number(value) : 0;
    this.onFixedChange(employeeId, month);
  }

  onSalaryVariableChange(
    employeeId: string,
    month: number,
    value: string | number
  ): void {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    this.salaries[key].variable = value ? Number(value) : 0;
    this.onSalaryChange(employeeId, month);
  }

  async onFixedChange(employeeId: string, month: number): Promise<void> {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }

    // バリデーション実行
    this.validateSalaryData(employeeId);

    // 固定的賃金の変動を検出（Service層に委譲）
    const emp = this.employees.find((e) => e.id === employeeId);
    const changeResult = await this.suijiService.detectFixedChangeForMonth(
      employeeId,
      month,
      this.salaries,
      this.year,
      emp || null,
      emp?.name || ''
    );

    if (changeResult.hasChange) {
      this.updateSuijiKettei(employeeId, month);
    }

    // 警告メッセージを追加
    if (changeResult.warningMessage) {
      if (!this.warningMessages[employeeId]) {
        this.warningMessages[employeeId] = [];
      }
      if (
        !this.warningMessages[employeeId].includes(changeResult.warningMessage)
      ) {
        this.warningMessages[employeeId].push(changeResult.warningMessage);
      }
    }

    this.updateRehabSuiji(employeeId);
  }

  calculateInsurancePremiumsForEmployee(
    employeeId: string,
    month: number
  ): void {
    // 仮実装：後で実装
    console.log('保険料計算', employeeId, month);
  }

  getAverageForAprToJun(employeeId: string): number | null {
    return this.salaryCalculationService.getAverageForAprToJun(
      employeeId,
      this.salaries
    );
  }

  getStandardMonthlyRemuneration(avg: number | null) {
    if (avg === null) return null;
    const result = this.salaryCalculationService.findGrade(
      this.gradeTable,
      avg
    );
    if (!result) return null;
    return { rank: result.grade, standard: result.remuneration };
  }

  calculateInsurancePremiums(standard: number, emp: Employee, month: number) {
    if (!this.rates) return null;
    const r = this.rates;
    const health_employee = r.health_employee;
    const health_employer = r.health_employer;

    // 介護保険判定（Service統一ロジックを使用）
    const careType = this.salaryCalculationService.getCareInsuranceType(
      emp.birthDate,
      this.year,
      month
    );
    const isCareApplicable = careType === 'type2';
    const care_employee = isCareApplicable ? r.care_employee : 0;
    const care_employer = isCareApplicable ? r.care_employer : 0;

    const pension_employee = r.pension_employee;
    const pension_employer = r.pension_employer;

    return {
      health_employee: Math.floor(standard * health_employee),
      health_employer: Math.floor(standard * health_employer),
      care_employee: Math.floor(standard * care_employee),
      care_employer: Math.floor(standard * care_employer),
      pension_employee: Math.floor(standard * pension_employee),
      pension_employer: Math.floor(standard * pension_employer),
    };
  }

  calculateAge(birthDate: string): number {
    return this.salaryCalculationService.calculateAge(birthDate);
  }

  async saveAllSalaries(): Promise<void> {
    for (const emp of this.employees) {
      const payload: any = {};

      for (const month of this.months) {
        // 免除月の場合はスキップ（0として扱う）
        if (this.exemptMonths[emp.id]?.includes(month)) {
          continue;
        }

        const itemKey = this.getSalaryItemKey(emp.id, month);
        const itemEntries: SalaryItemEntry[] = [];

        for (const item of this.salaryItems) {
          const amount = this.salaryItemData[itemKey]?.[item.id] ?? 0;
          if (amount > 0) {
            itemEntries.push({ itemId: item.id, amount });
          }
        }

        // 項目別入力がある場合
        if (itemEntries.length > 0) {
          const totals = this.salaryCalculationService.calculateSalaryTotals(
            itemEntries,
            this.salaryItems
          );
          payload[month.toString()] = {
            salaryItems: itemEntries,
            fixedTotal: totals.fixedTotal,
            variableTotal: totals.variableTotal,
            total: totals.total,
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
          const salaryData = this.salaries[salaryKey];
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
          this.year,
          payload
        );
      }
    }

    // 固定的賃金の変動検出
    const salaryDataForDetection: { [key: string]: MonthlySalaryData } = {};
    for (const emp of this.employees) {
      for (const month of this.months) {
        const key = this.getSalaryKey(emp.id, month);
        const salaryData = this.salaries[key];
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
      this.salaryItems
    );
    console.log('固定的賃金の変動検出結果:', fixedChanges);

    // 随時改定アラートをリセット
    this.suijiAlerts = [];

    // 各変動について3か月平均を計算
    for (const change of fixedChanges) {
      const average = this.suijiService.calculateThreeMonthAverage(
        salaryDataForDetection,
        change.employeeId,
        change.changeMonth
      );
      const newGrade =
        average !== null
          ? this.suijiService.getGradeFromAverage(average, this.gradeTable)
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
              this.gradeTable
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
          await this.suijiService.saveSuijiKouho(this.year, suijiResult);
          this.suijiAlerts.push(suijiResult);
        }
      }
    }

    alert('給与データを保存しました');

    // 随時改定候補が存在する場合、ダイアログを表示
    if (this.suijiAlerts.length > 0) {
      this.showSuijiDialog = true;
    }
  }

  closeSuijiDialog(): void {
    this.showSuijiDialog = false;
  }

  navigateToSuijiAlert(): void {
    this.router.navigate(['/monthly-change-alert']);
  }

  async loadExistingSalaries(): Promise<void> {
    for (const emp of this.employees) {
      const data = await this.monthlySalaryService.getEmployeeSalary(
        emp.id,
        this.year
      );
      if (!data) continue;

      for (const month of this.months) {
        const monthKey = month.toString();
        const monthData = data[monthKey];

        if (monthData) {
          // 新しい項目別形式を優先
          if (monthData.salaryItems && Array.isArray(monthData.salaryItems)) {
            const itemKey = this.getSalaryItemKey(emp.id, month);
            this.salaryItemData[itemKey] = {};
            for (const entry of monthData.salaryItems) {
              this.salaryItemData[itemKey][entry.itemId] = entry.amount;
            }
            // 集計を更新
            this.updateSalaryTotals(emp.id, month);
          } else {
            // 既存形式のフォールバック
            const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
            const variable =
              monthData.variableSalary ?? monthData.variable ?? 0;
            const total =
              monthData.totalSalary ?? monthData.total ?? fixed + variable;

            const salaryKey = this.getSalaryKey(emp.id, month);
            this.salaries[salaryKey] = { total, fixed, variable };
          }
        }
      }
    }
  }

  async updateCalculatedInfo(emp: any): Promise<void> {
    const avg = this.getAverageForAprToJun(emp.id);
    const stdResult =
      avg !== null ? this.getStandardMonthlyRemuneration(avg) : null;
    const standard = stdResult ? stdResult.standard : null;
    const rank = stdResult ? stdResult.rank : null;

    const age = this.calculateAge(emp.birthDate);
    // 4月の給与データを取得（定時決定の基準月）
    const aprilKey = this.getSalaryKey(emp.id, 4);
    const aprilSalary = this.salaries[aprilKey];
    const fixedSalary = aprilSalary?.fixed || 0;
    const variableSalary = aprilSalary?.variable || 0;

    const premiums =
      standard !== null
        ? await this.salaryCalculationService.calculateMonthlyPremiums(
            emp,
            this.year,
            4,
            fixedSalary,
            variableSalary,
            this.gradeTable
          )
        : null;

    // エラーチェック
    this.checkEmployeeErrors(emp, age, premiums);

    // 結果を保存
    this.infoByEmployee[emp.id] = {
      avg,
      standard,
      rank,
      premiums,
    };
  }

  async updateAllCalculatedInfo(): Promise<void> {
    for (const emp of this.employees) {
      await this.updateCalculatedInfo(emp);
    }
    // 免除月を構築
    this.buildExemptMonths();
  }

  buildExemptMonths(): void {
    this.exemptMonths = {};
    for (const emp of this.employees) {
      this.exemptMonths[emp.id] = [];

      for (const month of this.months) {
        // 各月の免除判定（Service層のメソッドを使用）
        const isExempt = this.salaryCalculationService.isExemptMonth(
          emp,
          this.year,
          month
        );
        if (isExempt) {
          if (!this.exemptMonths[emp.id].includes(month)) {
            this.exemptMonths[emp.id].push(month);
          }
        }
      }
    }
  }

  checkEmployeeErrors(emp: any, age: number, premiums: any): void {
    const result = this.validationService.checkEmployeeErrors(
      emp,
      age,
      premiums
    );
    if (!this.errorMessages[emp.id]) {
      this.errorMessages[emp.id] = [];
    }
    if (!this.warningMessages[emp.id]) {
      this.warningMessages[emp.id] = [];
    }
    this.errorMessages[emp.id].push(...result.errors);
    this.warningMessages[emp.id].push(...result.warnings);
  }

  validateSalaryData(employeeId: string): void {
    const emp = this.employees.find((e) => e.id === employeeId);
    if (!emp) return;

    const result = this.validationService.validateSalaryData(
      employeeId,
      emp,
      this.salaries,
      this.months,
      (total: number) => this.getStandardMonthlyRemuneration(total)
    );

    if (!this.errorMessages[employeeId]) {
      this.errorMessages[employeeId] = [];
    }
    if (!this.warningMessages[employeeId]) {
      this.warningMessages[employeeId] = [];
    }

    // 既存のバリデーション警告をクリア（システム警告は残す）
    const systemWarnings = this.warningMessages[employeeId].filter((w) =>
      w.includes('標準報酬等級表が設定されていません')
    );
    this.errorMessages[employeeId] = [];
    this.warningMessages[employeeId] = [...systemWarnings];

    // 新しいエラーと警告を追加
    this.errorMessages[employeeId].push(...result.errors);
    this.warningMessages[employeeId].push(...result.warnings);
  }

  // 定時決定ロジック
  calculateTeijiKettei(employeeId: string): void {
    const result = this.salaryCalculationService.calculateTeijiKettei(
      employeeId,
      this.salaries,
      this.gradeTable,
      this.year
    );
    console.log(
      `[monthly-salaries] 定時決定計算: 従業員ID=${employeeId}, 年度=${this.year}, 等級=${result.grade}, 標準報酬=${result.standardMonthlyRemuneration}, 等級表件数=${this.gradeTable.length}`
    );
    this.results[employeeId] = result;
  }

  // 随時改定ロジック
  updateSuijiKettei(employeeId: string, changedMonth: number): void {
    const result = this.salaryCalculationService.calculateSuijiKettei(
      employeeId,
      changedMonth,
      this.salaries,
      this.gradeTable,
      this.employees,
      this.year.toString(),
      this.results
    );

    if (result.excludedReason) {
      const exists = this.excludedSuijiReasons.find(
        (ex) =>
          ex.employeeId === employeeId &&
          ex.reason === result.excludedReason!.reason
      );
      if (!exists) {
        this.excludedSuijiReasons.push(result.excludedReason);
      }
      return;
    }

    if (result.candidate) {
      const exists = this.suijiCandidates.find(
        (c) => c.employeeId === employeeId && c.changedMonth === changedMonth
      );
      if (!exists) {
        this.suijiCandidates.push(result.candidate);
      }
    }
  }

  updateRehabSuiji(employeeId: string): void {
    const candidates = this.salaryCalculationService.checkRehabSuiji(
      employeeId,
      this.salaries,
      this.gradeTable,
      this.employees,
      this.year.toString(),
      this.results
    );

    this.rehabSuijiCandidates = this.rehabSuijiCandidates.filter(
      (c) => c.employeeId !== employeeId
    );

    for (const candidate of candidates) {
      const exists = this.rehabSuijiCandidates.find(
        (c) =>
          c.employeeId === candidate.employeeId &&
          c.changeMonth === candidate.changeMonth
      );
      if (!exists) {
        this.rehabSuijiCandidates.push(candidate);
      }
    }
  }

  getRehabHighlightMonths(): { [employeeId: string]: number[] } {
    const result: { [employeeId: string]: number[] } = {};
    for (const emp of this.employees) {
      result[emp.id] = this.salaryCalculationService.getRehabHighlightMonths(
        emp,
        this.year.toString()
      );
    }
    return result;
  }

  // CSVインポート処理
  async onCsvTextImport(csvText: string): Promise<void> {
    this.csvImportText = csvText;
    await this.importFromCsvText(csvText);
  }

  onCsvImportClose(): void {
    this.csvImportText = '';
    this.csvImportResult = null;
  }

  async importFromCsvText(csvText?: string): Promise<void> {
    // 引数が渡されていない場合は、プロパティから取得
    const textToImport = csvText || this.csvImportText;
    
    if (!textToImport.trim()) {
      this.csvImportResult = { type: 'error', message: 'CSVデータが入力されていません' };
      return;
    }
    try {
      const lines = textToImport.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        this.csvImportResult = { type: 'error', message: 'CSVデータが不正です（最低2行必要：ヘッダー＋データ行）' };
        return;
      }

      // ヘッダー行をパース
      const headerLine = lines[0];
      const headerParts = headerLine.split(',').map(p => p.trim());
      
      if (headerParts.length < 3) {
        this.csvImportResult = { type: 'error', message: 'ヘッダー行が不正です（最低3列必要：月,従業員,項目名...）' };
        return;
      }

      // ヘッダーから月と従業員の列インデックスを取得
      const monthIndex = headerParts.indexOf('月');
      const employeeIndex = headerParts.indexOf('従業員');
      
      if (monthIndex === -1 || employeeIndex === -1) {
        this.csvImportResult = { type: 'error', message: 'ヘッダーに「月」と「従業員」の列が必要です' };
        return;
      }

      // 給与項目名の列インデックスを取得（月と従業員以外）
      const salaryItemColumns: { index: number; name: string }[] = [];
      for (let i = 0; i < headerParts.length; i++) {
        if (i !== monthIndex && i !== employeeIndex) {
          salaryItemColumns.push({ index: i, name: headerParts[i] });
        }
      }

      if (salaryItemColumns.length === 0) {
        this.csvImportResult = { type: 'error', message: '給与項目が見つかりません' };
        return;
      }

      // データ行を処理
      const dataLines = lines.slice(1);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const line of dataLines) {
        const parts = line.split(',').map(p => p.trim());
        
        if (parts.length < headerParts.length) {
          errorCount++;
          errors.push(`行「${line}」: 列数が不足しています`);
          continue;
        }

        // 月を取得
        const monthStr = parts[monthIndex];
        const month = parseInt(monthStr, 10);
        
        if (isNaN(month) || month < 1 || month > 12) {
          errorCount++;
          errors.push(`行「${line}」: 月が不正です（1〜12の範囲）`);
          continue;
        }

        // 従業員名を取得
        const employeeName = parts[employeeIndex];
        const employee = this.employees.find(emp => emp.name === employeeName);
        
        if (!employee) {
          errorCount++;
          errors.push(`行「${line}」: 従業員「${employeeName}」が見つかりません`);
          continue;
        }

        // 各給与項目の金額を設定
        for (const itemColumn of salaryItemColumns) {
          const amountStr = parts[itemColumn.index];
          const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;

          // 給与項目名から給与項目IDを取得
          const salaryItem = this.salaryItems.find(item => item.name === itemColumn.name);
          
          if (!salaryItem) {
            errorCount++;
            errors.push(`行「${line}」: 給与項目「${itemColumn.name}」が見つかりません`);
            continue;
          }

          // salaryItemDataに値を設定
          const key = this.getSalaryItemKey(employee.id, month);
          if (!this.salaryItemData[key]) {
            this.salaryItemData[key] = {};
          }
          this.salaryItemData[key][salaryItem.id] = amount;

          // 集計・バリデーションを実行
          await this.onSalaryItemChange({
            employeeId: employee.id,
            month: month,
            itemId: salaryItem.id,
            value: amount
          });

          successCount++;
        }
      }

      // 結果メッセージ
      if (errorCount > 0) {
        this.csvImportResult = {
          type: 'error',
          message: `${successCount}件のインポートに成功しましたが、${errorCount}件のエラーがあります。${errors.slice(0, 5).join(' / ')}${errors.length > 5 ? ' ...' : ''}`
        };
      } else {
        this.csvImportResult = {
          type: 'success',
          message: `${successCount}件のデータをインポートしました`
        };
        this.csvImportText = '';
      }
    } catch (error) {
      console.error('CSVインポートエラー:', error);
      this.csvImportResult = { type: 'error', message: `インポート中にエラーが発生しました: ${error}` };
    }
  }

}
