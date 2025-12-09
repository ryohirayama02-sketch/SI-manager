import { Injectable } from '@angular/core';
import { SalaryCalculationService, TeijiKetteiResult } from './salary-calculation.service';
import { ValidationService } from './validation.service';
import { SuijiService } from './suiji.service';
import { Employee } from '../models/employee.model';
import { SalaryItem } from '../models/salary-item.model';
import { SalaryItemEntry } from '../models/monthly-salary.model';

export interface SalaryItemChangeEvent {
  employeeId: string;
  month: number;
  itemId: string;
  value: string | number;
}

export interface WorkingDaysChangeEvent {
  employeeId: string;
  month: number;
  value: number;
}

export interface SalaryEditResult {
  salaryItemData: { [key: string]: { [itemId: string]: number } };
  workingDaysData: { [key: string]: number };
  salaries: { [key: string]: { total: number; fixed: number; variable: number } };
  results: { [employeeId: string]: TeijiKetteiResult };
  validationErrors: { [employeeId: string]: string[] };
  validationWarnings: { [employeeId: string]: string[] };
  needsRecalculation: boolean;
  recalculateEmployeeId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SalaryEditHandlerService {

  constructor(
    private salaryCalculationService: SalaryCalculationService,
    private validationService: ValidationService,
    private suijiService: SuijiService
  ) {}

  /**
   * 給与項目変更時の処理
   */
  handleSalaryItemChange(
    event: SalaryItemChangeEvent,
    currentSalaryItemData: { [key: string]: { [itemId: string]: number } },
    currentSalaries: { [key: string]: { total: number; fixed: number; variable: number } },
    salaryItems: SalaryItem[],
    employees: Employee[],
    months: number[],
    gradeTable: any[],
    year: number,
    currentResults: { [employeeId: string]: TeijiKetteiResult },
    getStandardMonthlyRemuneration: (avg: number | null) => { rank: number; standard: number } | null
  ): SalaryEditResult {
    const { employeeId, month, itemId, value } = event;
    
    // データのコピーを作成
    const newSalaryItemData = { ...currentSalaryItemData };
    const newSalaries = { ...currentSalaries };
    const newResults = { ...currentResults };
    
    // 給与項目データを更新
    const key = this.getSalaryItemKey(employeeId, month);
    if (!newSalaryItemData[key]) {
      newSalaryItemData[key] = {};
    }
    newSalaryItemData[key] = { ...newSalaryItemData[key] };
    newSalaryItemData[key][itemId] = value ? Number(value) : 0;

    // 自動集計
    const totals = this.updateSalaryTotals(
      employeeId,
      month,
      newSalaryItemData,
      newSalaries,
      salaryItems
    );

    // バリデーション実行
    const validationResult = this.validateSalaryData(
      employeeId,
      employees,
      newSalaries,
      months,
      getStandardMonthlyRemuneration
    );

    // 4〜6月の入力が変更された場合は定時決定を再計算
    let needsRecalculation = false;
    let recalculateEmployeeId: string | undefined = undefined;
    if (month >= 4 && month <= 6) {
      const result = this.calculateTeijiKettei(
        employeeId,
        newSalaries,
        gradeTable,
        year,
        employees.find((e) => e.id === employeeId)
      );
      newResults[employeeId] = result;
      needsRecalculation = true;
      recalculateEmployeeId = employeeId;
    }

    // 随時改定の更新は親コンポーネント側で行う（rehabSuijiCandidatesの管理のため）

    return {
      salaryItemData: newSalaryItemData,
      workingDaysData: {}, // 変更なし
      salaries: newSalaries,
      results: newResults,
      validationErrors: validationResult.errors,
      validationWarnings: validationResult.warnings,
      needsRecalculation,
      recalculateEmployeeId
    };
  }

  /**
   * 勤務日数変更時の処理
   */
  handleWorkingDaysChange(
    event: WorkingDaysChangeEvent,
    currentWorkingDaysData: { [key: string]: number }
  ): { [key: string]: number } {
    const { employeeId, month, value } = event;
    const newWorkingDaysData = { ...currentWorkingDaysData };
    const key = this.getWorkingDaysKey(employeeId, month);
    newWorkingDaysData[key] = value;
    return newWorkingDaysData;
  }

  /**
   * 給与集計を更新
   */
  private updateSalaryTotals(
    employeeId: string,
    month: number,
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    salaryItems: SalaryItem[]
  ): { total: number; fixedTotal: number; variableTotal: number } {
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
    const salaryKey = this.salaryCalculationService.getSalaryKey(employeeId, month);
    salaries[salaryKey] = {
      total: totals.total,
      fixed: totals.fixedTotal,
      variable: totals.variableTotal,
    };

    return totals;
  }

  /**
   * 給与データのバリデーション
   */
  private validateSalaryData(
    employeeId: string,
    employees: Employee[],
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    months: number[],
    getStandardMonthlyRemuneration: (total: number) => { rank: number; standard: number } | null
  ): { errors: { [employeeId: string]: string[] }; warnings: { [employeeId: string]: string[] } } {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) {
      return { errors: {}, warnings: {} };
    }

    const result = this.validationService.validateSalaryData(
      employeeId,
      emp,
      salaries,
      months,
      getStandardMonthlyRemuneration
    );

    return {
      errors: { [employeeId]: result.errors },
      warnings: { [employeeId]: result.warnings }
    };
  }

  /**
   * 定時決定を計算
   */
  private calculateTeijiKettei(
    employeeId: string,
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    gradeTable: any[],
    year: number,
    employee?: Employee
  ): TeijiKetteiResult {
    return this.salaryCalculationService.calculateTeijiKettei(
      employeeId,
      salaries,
      gradeTable,
      year,
      undefined,
      employee
    );
  }


  /**
   * 給与項目キーを取得
   */
  private getSalaryItemKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 勤務日数キーを取得
   */
  private getWorkingDaysKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }
}

