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
   */
  private getTotalSalary(salaryData: SalaryData | undefined): number {
    if (!salaryData) return 0;
    const fixed = this.getFixedSalary(salaryData);
    const variable = this.getVariableSalary(salaryData);
    return (
      (salaryData as any).totalSalary ?? salaryData.total ?? fixed + variable
    );
  }

  /**
   * 給与項目マスタから固定/非固定の合計を計算
   */
  calculateSalaryTotals(
    salaryItems: SalaryItemEntry[],
    salaryItemMaster: SalaryItem[]
  ): { fixedTotal: number; variableTotal: number; total: number } {
    let fixedTotal = 0;
    let variableTotal = 0;

    for (const entry of salaryItems) {
      const master = salaryItemMaster.find((item) => item.id === entry.itemId);
      if (master) {
        if (master.type === 'fixed') {
          fixedTotal += entry.amount;
        } else if (master.type === 'variable') {
          variableTotal += entry.amount;
        }
      }
    }

    return {
      fixedTotal,
      variableTotal,
      total: fixedTotal + variableTotal,
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
    const values: number[] = [];
    for (const month of [4, 5, 6]) {
      const key = `${employeeId}_${month}`;
      const salaryData = salaries[key];
      if (salaryData && salaryData.total > 0) {
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


