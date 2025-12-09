import { Injectable } from '@angular/core';
import { SalaryData } from './salary-calculation.service';
import { SalaryAggregationService } from './salary-aggregation.service';
import { SuijiFixedSalaryChangeService } from './suiji-fixed-salary-change.service';

/**
 * SuijiCalculationCoreService
 * 
 * 随時改定計算のコアロジックを担当するサービス
 * 固定給の取得、除外月判定、平均計算を提供
 */
@Injectable({ providedIn: 'root' })
export class SuijiCalculationCoreService {
  constructor(
    private salaryAggregationService: SalaryAggregationService,
    private suijiFixedSalaryChangeService: SuijiFixedSalaryChangeService
  ) {}

  /**
   * 給与データのキーを作成
   */
  private getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 変動月を含む3ヶ月の固定給を取得
   */
  getFixed3Months(
    employeeId: string,
    changedMonth: number,
    salaries: { [key: string]: SalaryData }
  ): number[] {
    const values: number[] = [];
    // changedMonthを含む3ヶ月を取得
    for (let i = 0; i < 3; i++) {
      const month = changedMonth + i;
      if (month > 12) break;
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const value = this.salaryAggregationService.getFixedSalaryPublic(salaryData); // fixedSalary を優先
      values.push(value);
    }
    return values;
  }

  /**
   * 随時改定の除外月を判定する
   */
  getExcludedMonthsForSuiji(
    employeeId: string,
    months: number[],
    salaries: { [key: string]: SalaryData }
  ): number[] {
    const excluded: number[] = [];

    for (const month of months) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const workingDays = salaryData?.workingDays;

      // 支払基礎日数が17日未満なら除外
      if (workingDays !== undefined && workingDays < 17) {
        excluded.push(month);
      }
    }

    return excluded;
  }

  /**
   * 随時改定（固定的賃金の変動）を判定する
   */
  calculateFixedSalaryChangeSuiji(
    employeeId: string,
    changeMonth: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    currentGrade: number
  ) {
    return this.suijiFixedSalaryChangeService.calculateFixedSalaryChangeSuiji(
      employeeId,
      changeMonth,
      salaries,
      gradeTable,
      currentGrade
    );
  }

}

