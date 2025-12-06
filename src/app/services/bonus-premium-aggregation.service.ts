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
    for (const bonus of bonuses) {
      const bonusMonth = bonus.month;
      if (bonusMonth < 1 || bonusMonth > 12) {
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
      const bonusEmployee = employees.find((e) => e.id === bonus.employeeId);
      if (!bonusEmployee) {
        continue;
      }

      const bonusAgeCache = ageCacheByEmployee[bonusEmployee.id];
      const age = bonusAgeCache[bonusMonth];

      let bonusHealthEmployee = bonus.healthEmployee || 0;
      let bonusHealthEmployer = bonus.healthEmployer || 0;
      let bonusCareEmployee = bonus.careEmployee || 0;
      let bonusCareEmployer = bonus.careEmployer || 0;
      let bonusPensionEmployee = bonus.pensionEmployee || 0;
      let bonusPensionEmployer = bonus.pensionEmployer || 0;

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
      allMonthlyTotals[bonusMonth] =
        this.premiumTotalAggregationService.addToMonthlyTotal(
          allMonthlyTotals[bonusMonth],
          {
            healthEmployee: bonusHealthEmployee,
            healthEmployer: bonusHealthEmployer,
            careEmployee: bonusCareEmployee,
            careEmployer: bonusCareEmployer,
            pensionEmployee: bonusPensionEmployee,
            pensionEmployer: bonusPensionEmployer,
          }
        );

      allMonthlyTotals[bonusMonth].isPensionStopped = stopping.isPensionStopped;
      allMonthlyTotals[bonusMonth].isHealthStopped = stopping.isHealthStopped;
      allMonthlyTotals[bonusMonth].isRetired = stopping.isRetired;
      allMonthlyTotals[bonusMonth].isMaternityLeave = stopping.isMaternityLeave;
      allMonthlyTotals[bonusMonth].isChildcareLeave = stopping.isChildcareLeave;
    }
  }
}
