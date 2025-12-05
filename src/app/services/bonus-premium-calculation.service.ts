import { Injectable } from '@angular/core';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import {
  MonthlyPremiumRow,
  BonusAnnualTotal,
} from './payment-summary-calculation.service';

/**
 * BonusPremiumCalculationService
 *
 * 賞与保険料計算を担当するサービス
 * 賞与から保険料を計算し、月次給与の保険料に加算、年間合計を計算
 */
@Injectable({ providedIn: 'root' })
export class BonusPremiumCalculationService {
  constructor(private employeeLifecycleService: EmployeeLifecycleService) {}

  /**
   * 賞与保険料を月次給与の保険料に加算
   */
  addBonusPremiumsToMonthly(
    emp: Employee,
    year: number,
    employeeBonuses: Bonus[],
    monthlyPremiumRows: MonthlyPremiumRow[],
    monthlyPremiums: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      };
    },
    ageCache: { [month: number]: number }
  ): void {
    for (const bonus of employeeBonuses) {
      const bonusMonth = bonus.month;

      // 停止判定（優先順位：退職 > 産休/育休 > 年齢停止）
      const age = ageCache[bonusMonth];
      const pensionStopped = age >= 70;
      const healthStopped = age >= 75;
      const maternityLeave = this.employeeLifecycleService.isMaternityLeave(
        emp,
        year,
        bonusMonth
      );
      const childcareLeave = this.employeeLifecycleService.isChildcareLeave(
        emp,
        year,
        bonusMonth
      );
      const retired = this.employeeLifecycleService.isRetiredInMonth(
        emp,
        year,
        bonusMonth
      );

      let bonusHealthEmployee = bonus.healthEmployee || 0;
      let bonusHealthEmployer = bonus.healthEmployer || 0;
      let bonusCareEmployee = bonus.careEmployee || 0;
      let bonusCareEmployer = bonus.careEmployer || 0;
      let bonusPensionEmployee = bonus.pensionEmployee || 0;
      let bonusPensionEmployer = bonus.pensionEmployer || 0;

      // 退職月判定（最優先：本人・会社とも保険料ゼロ）
      if (retired) {
        bonusHealthEmployee = 0;
        bonusHealthEmployer = 0;
        bonusCareEmployee = 0;
        bonusCareEmployer = 0;
        bonusPensionEmployee = 0;
        bonusPensionEmployer = 0;
      } else {
        // 産休・育休による本人負担免除処理（事業主負担は維持）
        if (maternityLeave || childcareLeave) {
          bonusHealthEmployee = 0;
          bonusCareEmployee = 0;
          bonusPensionEmployee = 0;
        }

        // 年齢による停止処理
        if (pensionStopped) {
          bonusPensionEmployee = 0;
          bonusPensionEmployer = 0;
        }
        if (healthStopped) {
          bonusHealthEmployee = 0;
          bonusHealthEmployer = 0;
          bonusCareEmployee = 0;
          bonusCareEmployer = 0;
        }
      }

      // 月次給与の保険料に賞与分を加算（該当月の保険料に加算）
      if (monthlyPremiums[bonusMonth]) {
        monthlyPremiums[bonusMonth].healthEmployee += bonusHealthEmployee;
        monthlyPremiums[bonusMonth].healthEmployer += bonusHealthEmployer;
        monthlyPremiums[bonusMonth].careEmployee += bonusCareEmployee;
        monthlyPremiums[bonusMonth].careEmployer += bonusCareEmployer;
        monthlyPremiums[bonusMonth].pensionEmployee += bonusPensionEmployee;
        monthlyPremiums[bonusMonth].pensionEmployer += bonusPensionEmployer;
      }

      // 月次保険料一覧にも加算
      const premiumRow = monthlyPremiumRows.find((r) => r.month === bonusMonth);
      if (premiumRow) {
        premiumRow.healthEmployee += bonusHealthEmployee;
        premiumRow.healthEmployer += bonusHealthEmployer;
        premiumRow.careEmployee += bonusCareEmployee;
        premiumRow.careEmployer += bonusCareEmployer;
        premiumRow.pensionEmployee += bonusPensionEmployee;
        premiumRow.pensionEmployer += bonusPensionEmployer;
      }
    }
  }

  /**
   * 賞与保険料の年間合計を計算
   */
  calculateBonusAnnualTotals(
    bonuses: Bonus[],
    employees: Employee[],
    year: number,
    ageCacheByEmployee: { [employeeId: string]: { [month: number]: number } }
  ): BonusAnnualTotal {
    const bonusAnnualTotals: BonusAnnualTotal = {
      healthEmployee: 0,
      healthEmployer: 0,
      careEmployee: 0,
      careEmployer: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      totalEmployee: 0,
      totalEmployer: 0,
      total: 0,
    };

    for (const bonus of bonuses) {
      const bonusEmployee = employees.find((e) => e.id === bonus.employeeId);
      if (!bonusEmployee) continue;

      const bonusMonth = bonus.month;
      if (bonusMonth < 1 || bonusMonth > 12) continue;

      const bonusAgeCache = ageCacheByEmployee[bonusEmployee.id];
      const age = bonusAgeCache[bonusMonth];
      const pensionStopped = age >= 70;
      const healthStopped = age >= 75;
      const retired = this.employeeLifecycleService.isRetiredInMonth(
        bonusEmployee,
        year,
        bonusMonth
      );

      let bonusHealthEmployee = bonus.healthEmployee || 0;
      let bonusHealthEmployer = bonus.healthEmployer || 0;
      let bonusCareEmployee = bonus.careEmployee || 0;
      let bonusCareEmployer = bonus.careEmployer || 0;
      let bonusPensionEmployee = bonus.pensionEmployee || 0;
      let bonusPensionEmployer = bonus.pensionEmployer || 0;

      // 退職月判定（最優先）
      if (retired) {
        bonusHealthEmployee = 0;
        bonusHealthEmployer = 0;
        bonusCareEmployee = 0;
        bonusCareEmployer = 0;
        bonusPensionEmployee = 0;
        bonusPensionEmployer = 0;
      } else {
        // 年齢による停止処理
        if (pensionStopped) {
          bonusPensionEmployee = 0;
          bonusPensionEmployer = 0;
        }
        if (healthStopped) {
          bonusHealthEmployee = 0;
          bonusHealthEmployer = 0;
          bonusCareEmployee = 0;
          bonusCareEmployer = 0;
        }
      }

      // 賞与保険料の年間合計に加算
      bonusAnnualTotals.healthEmployee += bonusHealthEmployee;
      bonusAnnualTotals.healthEmployer += bonusHealthEmployer;
      bonusAnnualTotals.careEmployee += bonusCareEmployee;
      bonusAnnualTotals.careEmployer += bonusCareEmployer;
      bonusAnnualTotals.pensionEmployee += bonusPensionEmployee;
      bonusAnnualTotals.pensionEmployer += bonusPensionEmployer;
    }

    // 年間合計を計算
    bonusAnnualTotals.totalEmployee =
      bonusAnnualTotals.healthEmployee +
      bonusAnnualTotals.careEmployee +
      bonusAnnualTotals.pensionEmployee;
    bonusAnnualTotals.totalEmployer =
      bonusAnnualTotals.healthEmployer +
      bonusAnnualTotals.careEmployer +
      bonusAnnualTotals.pensionEmployer;
    bonusAnnualTotals.total =
      bonusAnnualTotals.totalEmployee + bonusAnnualTotals.totalEmployer;

    return bonusAnnualTotals;
  }
}



