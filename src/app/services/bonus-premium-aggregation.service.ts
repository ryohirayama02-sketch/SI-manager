import { Injectable } from '@angular/core';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { MonthlyTotal } from './payment-summary-calculation.service';

/**
 * BonusPremiumAggregationService
 * 
 * 賞与保険料の集計を担当するサービス
 * 賞与保険料を支給月の月別合計に加算
 */
@Injectable({ providedIn: 'root' })
export class BonusPremiumAggregationService {
  constructor(
    private employeeLifecycleService: EmployeeLifecycleService
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
      const bonusEmployee = employees.find(
        (e) => e.id === bonus.employeeId
      );
      if (!bonusEmployee) {
        continue;
      }

      // 退職月判定（最優先）
      const retired = this.employeeLifecycleService.isRetiredInMonth(
        bonusEmployee,
        year,
        bonusMonth
      );

      if (retired) {
        allMonthlyTotals[bonusMonth].isRetired = true;
        continue;
      }

      const bonusAgeCache = ageCacheByEmployee[bonusEmployee.id];
      const age = bonusAgeCache[bonusMonth];
      const pensionStopped = age >= 70;
      const healthStopped = age >= 75;

      let bonusHealthEmployee = bonus.healthEmployee || 0;
      let bonusHealthEmployer = bonus.healthEmployer || 0;
      let bonusCareEmployee = bonus.careEmployee || 0;
      let bonusCareEmployer = bonus.careEmployer || 0;
      let bonusPensionEmployee = bonus.pensionEmployee || 0;
      let bonusPensionEmployer = bonus.pensionEmployer || 0;

      // 年齢による停止処理
      if (pensionStopped) {
        bonusPensionEmployee = 0;
        bonusPensionEmployer = 0;
        allMonthlyTotals[bonusMonth].isPensionStopped = true;
      }
      if (healthStopped) {
        bonusHealthEmployee = 0;
        bonusHealthEmployer = 0;
        bonusCareEmployee = 0;
        bonusCareEmployer = 0;
        allMonthlyTotals[bonusMonth].isHealthStopped = true;
      }

      // 賞与保険料を月別合計に加算
      allMonthlyTotals[bonusMonth].health +=
        bonusHealthEmployee + bonusHealthEmployer;
      allMonthlyTotals[bonusMonth].care +=
        bonusCareEmployee + bonusCareEmployer;
      allMonthlyTotals[bonusMonth].pension +=
        bonusPensionEmployee + bonusPensionEmployer;
      allMonthlyTotals[bonusMonth].total +=
        bonusHealthEmployee +
        bonusHealthEmployer +
        (bonusCareEmployee + bonusCareEmployer) +
        (bonusPensionEmployee + bonusPensionEmployer);
    }
  }
}

