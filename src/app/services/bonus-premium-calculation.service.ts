import { Injectable } from '@angular/core';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { MonthlyPremiumRow, BonusAnnualTotal } from './payment-summary-types';
import { PremiumStoppingRuleService } from './premium-stopping-rule.service';

/**
 * BonusPremiumCalculationService
 *
 * 賞与保険料計算を担当するサービス
 * 賞与から保険料を計算し、月次給与の保険料に加算、年間合計を計算
 */
@Injectable({ providedIn: 'root' })
export class BonusPremiumCalculationService {
  constructor(
    private employeeLifecycleService: EmployeeLifecycleService,
    private premiumStoppingRuleService: PremiumStoppingRuleService
  ) {}

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
    if (!emp || !emp.id) {
      return;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return;
    }
    if (!employeeBonuses || !Array.isArray(employeeBonuses)) {
      return;
    }
    if (!monthlyPremiumRows || !Array.isArray(monthlyPremiumRows)) {
      return;
    }
    if (!monthlyPremiums || typeof monthlyPremiums !== 'object') {
      return;
    }
    if (!ageCache || typeof ageCache !== 'object') {
      return;
    }
    for (const bonus of employeeBonuses) {
      if (!bonus) continue;
      // 免除された賞与や給与代替の賞与は除外
      if (bonus.isExempted || bonus.isSalaryInsteadOfBonus) {
        continue;
      }
      const bonusMonth = bonus.month;
      if (isNaN(bonusMonth) || bonusMonth < 1 || bonusMonth > 12) {
        continue;
      }

      const age = ageCache[bonusMonth];
      if (age === undefined || age === null || isNaN(age) || age < 0 || age > 150) {
        continue;
      }

      let bonusHealthEmployee = bonus.healthEmployee || 0;
      let bonusHealthEmployer = bonus.healthEmployer || 0;
      let bonusCareEmployee = bonus.careEmployee || 0;
      let bonusCareEmployer = bonus.careEmployer || 0;
      let bonusPensionEmployee = bonus.pensionEmployee || 0;
      let bonusPensionEmployer = bonus.pensionEmployer || 0;

      const stopping = this.premiumStoppingRuleService.applyStoppingRules(
        emp,
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

      // 月次給与の保険料に賞与分を加算（該当月の保険料に加算）
      if (monthlyPremiums[bonusMonth]) {
        const monthlyPremium = monthlyPremiums[bonusMonth];
        if (monthlyPremium) {
          monthlyPremium.healthEmployee = (monthlyPremium.healthEmployee ?? 0) + bonusHealthEmployee;
          monthlyPremium.healthEmployer = (monthlyPremium.healthEmployer ?? 0) + bonusHealthEmployer;
          monthlyPremium.careEmployee = (monthlyPremium.careEmployee ?? 0) + bonusCareEmployee;
          monthlyPremium.careEmployer = (monthlyPremium.careEmployer ?? 0) + bonusCareEmployer;
          monthlyPremium.pensionEmployee = (monthlyPremium.pensionEmployee ?? 0) + bonusPensionEmployee;
          monthlyPremium.pensionEmployer = (monthlyPremium.pensionEmployer ?? 0) + bonusPensionEmployer;
        }
      }

      // 月次保険料一覧にも加算
      const premiumRow = monthlyPremiumRows.find((r) => r && r.month === bonusMonth);
      if (premiumRow) {
        // 停止情報を反映
        premiumRow.isRetired = stopping.isRetired;
        premiumRow.isMaternityLeave = stopping.isMaternityLeave;
        premiumRow.isChildcareLeave = stopping.isChildcareLeave;
        premiumRow.isPensionStopped = stopping.isPensionStopped;
        premiumRow.isHealthStopped = stopping.isHealthStopped;

        premiumRow.healthEmployee = (premiumRow.healthEmployee ?? 0) + bonusHealthEmployee;
        premiumRow.healthEmployer = (premiumRow.healthEmployer ?? 0) + bonusHealthEmployer;
        premiumRow.careEmployee = (premiumRow.careEmployee ?? 0) + bonusCareEmployee;
        premiumRow.careEmployer = (premiumRow.careEmployer ?? 0) + bonusCareEmployer;
        premiumRow.pensionEmployee = (premiumRow.pensionEmployee ?? 0) + bonusPensionEmployee;
        premiumRow.pensionEmployer = (premiumRow.pensionEmployer ?? 0) + bonusPensionEmployer;
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

    if (!bonuses || !Array.isArray(bonuses)) {
      return bonusAnnualTotals;
    }
    if (!employees || !Array.isArray(employees)) {
      return bonusAnnualTotals;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return bonusAnnualTotals;
    }
    if (!ageCacheByEmployee || typeof ageCacheByEmployee !== 'object') {
      return bonusAnnualTotals;
    }

    for (const bonus of bonuses) {
      if (!bonus || !bonus.employeeId) continue;
      // 免除された賞与や給与代替の賞与は除外
      if (bonus.isExempted || bonus.isSalaryInsteadOfBonus) {
        continue;
      }
      const bonusEmployee = employees.find((e) => e && e.id === bonus.employeeId);
      if (!bonusEmployee || !bonusEmployee.id) continue;

      const bonusMonth = bonus.month;
      if (isNaN(bonusMonth) || bonusMonth < 1 || bonusMonth > 12) continue;

      const bonusAgeCache = ageCacheByEmployee[bonusEmployee.id];
      if (!bonusAgeCache || typeof bonusAgeCache !== 'object') continue;
      const age = bonusAgeCache[bonusMonth];
      if (age === undefined || age === null || isNaN(age) || age < 0 || age > 150) {
        continue;
      }
      const pensionStopped = age >= 70;
      const healthStopped = age >= 75;
      const retired = this.employeeLifecycleService.isRetiredInMonth(
        bonusEmployee,
        year,
        bonusMonth
      );

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
