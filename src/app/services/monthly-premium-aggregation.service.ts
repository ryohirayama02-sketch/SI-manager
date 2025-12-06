import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { MonthlyTotal } from './payment-summary-types';
import { PremiumTotalAggregationService } from './premium-total-aggregation.service';

/**
 * MonthlyPremiumAggregationService
 *
 * 月次保険料の集計を担当するサービス
 * 従業員ごとの月次会社負担を計算し、全従業員分を合計
 */
@Injectable({ providedIn: 'root' })
export class MonthlyPremiumAggregationService {
  constructor(
    private premiumTotalAggregationService: PremiumTotalAggregationService
  ) {}

  /**
   * 従業員ごとの月次会社負担を計算し、全従業員分を合計
   */
  aggregateMonthlyTotals(
    employees: Employee[],
    year: number,
    monthlyPremiumsByEmployee: { [employeeId: string]: any[] },
    bonusesByEmployee: { [employeeId: string]: Bonus[] },
    ageCacheByEmployee: { [employeeId: string]: { [month: number]: number } }
  ): { [month: number]: MonthlyTotal } {
    const allMonthlyTotals: { [month: number]: MonthlyTotal } = {};

    // 1〜12月を初期化
    for (let month = 1; month <= 12; month++) {
      allMonthlyTotals[month] = {
        health: 0,
        care: 0,
        pension: 0,
        total: 0,
        isPensionStopped: false,
        isHealthStopped: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isRetired: false,
      };
    }

    // 全従業員をループ
    for (const emp of employees) {
      const rows = monthlyPremiumsByEmployee[emp.id] || [];
      for (const row of rows) {
        const month = row.month;
        allMonthlyTotals[month] =
          this.premiumTotalAggregationService.addToMonthlyTotal(
            allMonthlyTotals[month],
            {
              healthEmployee: row.healthEmployee,
              healthEmployer: row.healthEmployer,
              careEmployee: row.careEmployee,
              careEmployer: row.careEmployer,
              pensionEmployee: row.pensionEmployee,
              pensionEmployer: row.pensionEmployer,
            }
          );

        allMonthlyTotals[month].isPensionStopped =
          allMonthlyTotals[month].isPensionStopped || row.isPensionStopped;
        allMonthlyTotals[month].isHealthStopped =
          allMonthlyTotals[month].isHealthStopped || row.isHealthStopped;
        allMonthlyTotals[month].isMaternityLeave =
          allMonthlyTotals[month].isMaternityLeave || row.isMaternityLeave;
        allMonthlyTotals[month].isChildcareLeave =
          allMonthlyTotals[month].isChildcareLeave || row.isChildcareLeave;
        allMonthlyTotals[month].isRetired =
          allMonthlyTotals[month].isRetired || row.isRetired;
      }
    }

    return allMonthlyTotals;
  }
}
