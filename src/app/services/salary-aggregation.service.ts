import { Injectable } from '@angular/core';
import { SalaryData } from './salary-calculation.service';
import {
  SalaryItemEntry,
  MonthlySalaryData,
} from '../models/monthly-salary.model';
import { SalaryItem } from '../models/salary-item.model';

@Injectable({ providedIn: 'root' })
export class SalaryAggregationService {
  /**
   * 給与データから固定的賃金を取得（後方互換性対応）
   */
  private getFixedSalary(salaryData: SalaryData | undefined): number {
    if (!salaryData) return 0;
    return (salaryData as any).fixedSalary ?? salaryData.fixed ?? 0;
  }

  /**
   * 給与データから非固定的賃金を取得（後方互換性対応）
   */
  private getVariableSalary(salaryData: SalaryData | undefined): number {
    if (!salaryData) return 0;
    return (salaryData as any).variableSalary ?? salaryData.variable ?? 0;
  }

  /**
   * 給与データから総支給を取得（後方互換性対応）
   * 欠勤控除を引いた総支給額を返す
   */
  private getTotalSalary(salaryData: SalaryData | undefined): number {
    if (!salaryData) return 0;
    const fixed = this.getFixedSalary(salaryData);
    const variable = this.getVariableSalary(salaryData);
    const deduction = (salaryData as any).deductionTotal ?? 0;
    // totalSalaryまたはtotalが存在する場合はそれを使用（既に欠勤控除を引いた値の可能性がある）
    // ただし、deductionTotalが明示的に設定されている場合は、それを引く
    const baseTotal = (salaryData as any).totalSalary ?? salaryData.total ?? fixed + variable;
    // deductionTotalが設定されている場合は、それを引く
    return baseTotal - deduction;
  }

  /**
   * 給与項目マスタから固定/非固定/控除の合計を計算
   */
  calculateSalaryTotals(
    salaryItems: SalaryItemEntry[],
    salaryItemMaster: SalaryItem[]
  ): { fixedTotal: number; variableTotal: number; deductionTotal: number; total: number } {
    let fixedTotal = 0;
    let variableTotal = 0;
    let deductionTotal = 0;

    if (!salaryItems || !Array.isArray(salaryItems)) {
      return { fixedTotal: 0, variableTotal: 0, deductionTotal: 0, total: 0 };
    }
    if (!salaryItemMaster || !Array.isArray(salaryItemMaster)) {
      return { fixedTotal: 0, variableTotal: 0, deductionTotal: 0, total: 0 };
    }

    for (const entry of salaryItems) {
      if (!entry || !entry.itemId) {
        continue;
      }
      const amount = entry.amount ?? 0;
      if (isNaN(amount)) {
        continue;
      }
      const master = salaryItemMaster.find((item) => item && item.id === entry.itemId);
      if (master && master.type) {
        if (master.type === 'fixed') {
          fixedTotal += amount;
        } else if (master.type === 'variable') {
          variableTotal += amount;
        } else if (master.type === 'deduction') {
          deductionTotal += amount;
        }
      }
    }

    return {
      fixedTotal,
      variableTotal,
      deductionTotal,
      total: fixedTotal + variableTotal - deductionTotal, // 欠勤控除を引く
    };
  }

  /**
   * 給与データから固定/非固定/総支給を取得（後方互換性対応）
   */
  getSalaryFromData(data: MonthlySalaryData | SalaryData | undefined): {
    fixed: number;
    variable: number;
    total: number;
  } {
    if (!data) {
      return { fixed: 0, variable: 0, total: 0 };
    }

    // 新しい項目別形式を優先
    if ('salaryItems' in data && data.salaryItems) {
      return {
        fixed: data.fixedTotal ?? 0,
        variable: data.variableTotal ?? 0,
        total: data.total ?? 0,
      };
    }

    // 既存形式のフォールバック
    const fixed = (data as any).fixedSalary ?? (data as any).fixed ?? 0;
    const variable =
      (data as any).variableSalary ?? (data as any).variable ?? 0;
    const total =
      (data as any).totalSalary ?? (data as any).total ?? fixed + variable;

    return { fixed, variable, total };
  }

  /**
   * 4〜6月の平均報酬を計算
   * @param employeeId 従業員ID
   * @param salaries 給与データ（{ employeeId_month: { total, fixed, variable } }）
   * @param calculateAverage 平均計算関数（SalaryCalculationServiceから注入）
   * @returns 平均報酬（3ヶ月分すべて存在する場合のみ、それ以外はnull）
   */
  getAverageForAprToJun(
    employeeId: string,
    salaries: { [key: string]: SalaryData },
    calculateAverage: (
      values: { total: number; fixed: number; variable: number }[],
      excludedMonths: number[]
    ) => { averageSalary: number; usedMonths: number[]; reasons: string[] }
  ): number | null {
    if (!employeeId) {
      return null;
    }
    if (!salaries) {
      return null;
    }
    if (!calculateAverage) {
      return null;
    }
    const values: number[] = [];
    for (const month of [4, 5, 6]) {
      const key = `${employeeId}_${month}`;
      const salaryData = salaries[key];
      if (salaryData && salaryData.total && !isNaN(salaryData.total) && salaryData.total > 0) {
        values.push(salaryData.total);
      }
    }

    if (values.length !== 3) return null;

    // サービスメソッドを使用して平均を計算（除外月なし）
    const salaryDataArray = values.map((total) => ({
      total,
      fixed: total,
      variable: 0,
    }));
    const result = calculateAverage(salaryDataArray, []);
    if (!result || !result.averageSalary || isNaN(result.averageSalary)) {
      return null;
    }
    return result.averageSalary > 0 ? result.averageSalary : null;
  }

  // 内部メソッドをpublicに公開（SalaryCalculationServiceから使用するため）
  getFixedSalaryPublic(salaryData: SalaryData | undefined): number {
    return this.getFixedSalary(salaryData);
  }

  getVariableSalaryPublic(salaryData: SalaryData | undefined): number {
    return this.getVariableSalary(salaryData);
  }

  getTotalSalaryPublic(salaryData: SalaryData | undefined): number {
    return this.getTotalSalary(salaryData);
  }
}


