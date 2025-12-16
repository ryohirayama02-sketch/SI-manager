import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { MonthlyTotal } from './payment-summary-types';
import { PremiumStoppingRuleService } from './premium-stopping-rule.service';
import { PremiumTotalAggregationService } from './premium-total-aggregation.service';

/**
 * BonusPremiumAggregationService
 *
 * 賞与保険料の集計を担当するサービス
 * 賞与保険料を支給月の月別合計に加算
 */
@Injectable({ providedIn: 'root' })
export class BonusPremiumAggregationService {
  constructor(
    private premiumStoppingRuleService: PremiumStoppingRuleService,
    private premiumTotalAggregationService: PremiumTotalAggregationService
  ) {}

  /**
   * 賞与保険料を支給月の月別合計に加算
   */
  addBonusToMonthlyTotals(
    bonuses: Bonus[],
    employees: Employee[],
    year: number,
    allMonthlyTotals: { [month: number]: MonthlyTotal },
    ageCacheByEmployee: { [employeeId: string]: { [month: number]: number } }
  ): void {
    if (!bonuses || !Array.isArray(bonuses)) {
      return;
    }
    if (!employees || !Array.isArray(employees)) {
      return;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return;
    }
    if (!allMonthlyTotals || typeof allMonthlyTotals !== 'object') {
      return;
    }
    if (!ageCacheByEmployee || typeof ageCacheByEmployee !== 'object') {
      return;
    }
    for (const bonus of bonuses) {
      if (!bonus || !bonus.employeeId) continue;
      // 免除された賞与や給与代替の賞与は除外
      if (bonus.isExempted || bonus.isSalaryInsteadOfBonus) {
        continue;
      }
      const bonusMonth = bonus.month;
      if (isNaN(bonusMonth) || bonusMonth < 1 || bonusMonth > 12) {
        continue;
      }

      // 該当月のオブジェクトが存在することを確認
      if (!allMonthlyTotals[bonusMonth]) {
        allMonthlyTotals[bonusMonth] = {
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

      // 賞与支給者の年齢と退職日を確認
      const bonusEmployee = employees.find((e) => e && e.id === bonus.employeeId);
      if (!bonusEmployee || !bonusEmployee.id) {
        continue;
      }

      const bonusAgeCache = ageCacheByEmployee[bonusEmployee.id];
      if (!bonusAgeCache || typeof bonusAgeCache !== 'object') {
        continue;
      }
      const age = bonusAgeCache[bonusMonth];
      if (age === undefined || age === null || isNaN(age) || age < 0 || age > 150) {
        continue;
      }

      let bonusHealthEmployee = bonus.healthEmployee ?? 0;
      let bonusHealthEmployer = bonus.healthEmployer ?? 0;
      let bonusCareEmployee = bonus.careEmployee ?? 0;
      let bonusCareEmployer = bonus.careEmployer ?? 0;
      let bonusPensionEmployee = bonus.pensionEmployee ?? 0;
      let bonusPensionEmployer = bonus.pensionEmployer ?? 0;

      // NaNチェック
      if (isNaN(bonusHealthEmployee) || bonusHealthEmployee < 0) bonusHealthEmployee = 0;
      if (isNaN(bonusHealthEmployer) || bonusHealthEmployer < 0) bonusHealthEmployer = 0;
      if (isNaN(bonusCareEmployee) || bonusCareEmployee < 0) bonusCareEmployee = 0;
      if (isNaN(bonusCareEmployer) || bonusCareEmployer < 0) bonusCareEmployer = 0;
      if (isNaN(bonusPensionEmployee) || bonusPensionEmployee < 0) bonusPensionEmployee = 0;
      if (isNaN(bonusPensionEmployer) || bonusPensionEmployer < 0) bonusPensionEmployer = 0;

      const stopping = this.premiumStoppingRuleService.applyStoppingRules(
        bonusEmployee,
        year,
        bonusMonth,
        age,
        {
          healthEmployee: bonusHealthEmployee,
          healthEmployer: bonusHealthEmployer,
          careEmployee: bonusCareEmployee,
          careEmployer: bonusCareEmployer,
          pensionEmployee: bonusPensionEmployee,
          pensionEmployer: bonusPensionEmployer,
        }
      );

      bonusHealthEmployee = stopping.healthEmployee;
      bonusHealthEmployer = stopping.healthEmployer;
      bonusCareEmployee = stopping.careEmployee;
      bonusCareEmployer = stopping.careEmployer;
      bonusPensionEmployee = stopping.pensionEmployee;
      bonusPensionEmployer = stopping.pensionEmployer;

      // 賞与保険料を月別合計に加算
      const monthlyTotal = allMonthlyTotals[bonusMonth];
      if (monthlyTotal) {
        allMonthlyTotals[bonusMonth] =
          this.premiumTotalAggregationService.addToMonthlyTotal(
            monthlyTotal,
            {
              healthEmployee: bonusHealthEmployee,
              healthEmployer: bonusHealthEmployer,
              careEmployee: bonusCareEmployee,
              careEmployer: bonusCareEmployer,
              pensionEmployee: bonusPensionEmployee,
              pensionEmployer: bonusPensionEmployer,
            }
          );

        const updatedTotal = allMonthlyTotals[bonusMonth];
        if (updatedTotal && stopping) {
          updatedTotal.isPensionStopped = stopping.isPensionStopped ?? false;
          updatedTotal.isHealthStopped = stopping.isHealthStopped ?? false;
          updatedTotal.isRetired = stopping.isRetired ?? false;
          updatedTotal.isMaternityLeave = stopping.isMaternityLeave ?? false;
          updatedTotal.isChildcareLeave = stopping.isChildcareLeave ?? false;
        }
      }
    }
  }
}
