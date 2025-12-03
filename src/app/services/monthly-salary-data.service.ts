import { Injectable } from '@angular/core';
import { EmployeeService } from './employee.service';
import { MonthlySalaryService } from './monthly-salary.service';
import { SettingsService } from './settings.service';
import { MonthlySalaryStateService } from './monthly-salary-state.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { Employee } from '../models/employee.model';
import { SalaryItem } from '../models/salary-item.model';

/**
 * MonthlySalaryDataService
 * 
 * 月次給与画面のデータロード処理を担当するサービス
 * 従業員、給与項目マスタ、料率・等級表、既存給与データの読み込みを提供
 */
@Injectable({ providedIn: 'root' })
export class MonthlySalaryDataService {
  constructor(
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private state: MonthlySalaryStateService,
    private salaryCalculationService: SalaryCalculationService
  ) {}

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
   * 給与項目マスタを読み込む
   */
  async loadSalaryItems(year: number): Promise<SalaryItem[]> {
    let salaryItems = await this.settingsService.loadSalaryItems(year);
    
    // 給与項目をソート（orderがない場合はname昇順）
    salaryItems.sort((a, b) => {
      const orderA = (a as any).order ?? 999;
      const orderB = (b as any).order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    return salaryItems;
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
            const itemKey = this.state.getSalaryItemKey(emp.id, month);
            salaryItemData[itemKey] = {};
            for (const entry of monthData.salaryItems) {
              // 0の値も読み込む（明示的に0が設定されている場合）
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

            const salaryKey = this.state.getSalaryKey(emp.id, month);
            salaries[salaryKey] = { total, fixed, variable };
          }

          // 支払基礎日数を読み込む
          const workingDaysKey = this.state.getWorkingDaysKey(emp.id, month);
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
   * 給与集計を更新
   */
  updateSalaryTotals(
    employeeId: string,
    month: number,
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    salaryItems: SalaryItem[]
  ): void {
    const key = this.state.getSalaryItemKey(employeeId, month);
    const itemEntries: { itemId: string; amount: number }[] = [];

    for (const item of salaryItems) {
      const amount = salaryItemData[key]?.[item.id];
      // 値が設定されている場合（0も含む）は含める
      // undefinedの場合はスキップ（デフォルト値として扱う）
      if (amount !== undefined && amount !== null) {
        itemEntries.push({ itemId: item.id, amount });
      }
    }

    // 集計メソッドを使用
    const totals = this.salaryCalculationService.calculateSalaryTotals(
      itemEntries,
      salaryItems
    );

    // 後方互換性のためsalariesにも設定
    const salaryKey = this.state.getSalaryKey(employeeId, month);
    salaries[salaryKey] = {
      total: totals.total,
      fixed: totals.fixedTotal,
      variable: totals.variableTotal,
    };
  }
}


