import { Injectable } from '@angular/core';
import { InsuranceCalculationService } from './insurance-calculation.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { MonthlyPremiumRow, MonthlyTotal, CompanyMonthlyTotal } from './payment-summary-calculation.service';

/**
 * PremiumAggregationService
 * 
 * 会社全体の集計を担当するサービス
 * 月次合計、年間合計を計算
 */
@Injectable({ providedIn: 'root' })
export class PremiumAggregationService {
  constructor(
    private insuranceCalculationService: InsuranceCalculationService,
    private employeeLifecycleService: EmployeeLifecycleService
  ) {}

  /**
   * 従業員ごとの月次会社負担を計算し、全従業員分を合計
   */
  aggregateMonthlyTotals(
    employees: Employee[],
    year: number,
    monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    },
    monthlyPremiums: {
      [employeeId: string]: {
        [month: number]: {
          healthEmployee: number;
          healthEmployer: number;
          careEmployee: number;
          careEmployer: number;
          pensionEmployee: number;
          pensionEmployer: number;
        };
      };
    },
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
      const ageCache = ageCacheByEmployee[emp.id];
      const monthlyPremiumsForEmp = monthlyPremiums[emp.id] || {};
      const employeeBonuses = bonusesByEmployee[emp.id] || [];

      // サービスを使用して月次会社負担を計算
      const employeeMonthlyTotals =
        this.insuranceCalculationService.getMonthlyCompanyBurden(
          emp,
          monthlyPremiumsForEmp,
          employeeBonuses
        );

      // 全従業員分を合計（退職判定、産休・育休判定、年齢による停止判定を適用）
      for (let month = 1; month <= 12; month++) {
        const age = ageCache[month];
        const pensionStopped = age >= 70;
        const healthStopped = age >= 75;
        const maternityLeave = this.employeeLifecycleService.isMaternityLeave(emp, year, month);
        const childcareLeave = this.employeeLifecycleService.isChildcareLeave(emp, year, month);
        const retired = this.employeeLifecycleService.isRetiredInMonth(emp, year, month);

        let healthAmount = employeeMonthlyTotals[month]?.health || 0;
        let careAmount = employeeMonthlyTotals[month]?.care || 0;
        let pensionAmount = employeeMonthlyTotals[month]?.pension || 0;

        // 退職月判定（最優先：本人・会社とも保険料ゼロ）
        if (retired) {
          healthAmount = 0;
          careAmount = 0;
          pensionAmount = 0;
          allMonthlyTotals[month].isRetired = true;
        } else {
          // 産休・育休による本人負担免除処理
          if (maternityLeave || childcareLeave) {
            const premiums = monthlyPremiumsForEmp[month];
            if (premiums) {
              const employeeHealth = premiums.healthEmployee || 0;
              const employeeCare = premiums.careEmployee || 0;
              const employeePension = premiums.pensionEmployee || 0;

              healthAmount -= employeeHealth;
              careAmount -= employeeCare;
              pensionAmount -= employeePension;

              if (maternityLeave) {
                allMonthlyTotals[month].isMaternityLeave = true;
              }
              if (childcareLeave) {
                allMonthlyTotals[month].isChildcareLeave = true;
              }
            }
          }

          // 年齢による停止処理
          if (pensionStopped) {
            pensionAmount = 0;
            allMonthlyTotals[month].isPensionStopped = true;
          }
          if (healthStopped) {
            healthAmount = 0;
            careAmount = 0;
            allMonthlyTotals[month].isHealthStopped = true;
          }
        }

        allMonthlyTotals[month].health += healthAmount;
        allMonthlyTotals[month].care += careAmount;
        allMonthlyTotals[month].pension += pensionAmount;
        allMonthlyTotals[month].total +=
          healthAmount + careAmount + pensionAmount;
      }
    }

    return allMonthlyTotals;
  }

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

  /**
   * monthlyPremiumsByEmployee を元に会社全体の月次合計を計算
   */
  calculateCompanyMonthlyTotals(
    employees: Employee[],
    monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    }
  ): CompanyMonthlyTotal[] {
    const totals: {
      [month: number]: {
        healthTotal: number;
        careTotal: number;
        pensionTotal: number;
        total: number;
      };
    } = {};

    // 1〜12月を初期化
    for (let month = 1; month <= 12; month++) {
      totals[month] = {
        healthTotal: 0,
        careTotal: 0,
        pensionTotal: 0,
        total: 0,
      };
    }

    // 全従業員分を合算
    for (const emp of employees) {
      const employeeRows = monthlyPremiumsByEmployee[emp.id];
      if (!employeeRows || employeeRows.length === 0) {
        continue;
      }

      for (const row of employeeRows) {
        const month = row.month;
        const healthSum = row.healthEmployee + row.healthEmployer;
        const careSum = row.careEmployee + row.careEmployer;
        const pensionSum = row.pensionEmployee + row.pensionEmployer;

        totals[month].healthTotal += healthSum;
        totals[month].careTotal += careSum;
        totals[month].pensionTotal += pensionSum;
      }
    }

    // 配列形式に変換
    const companyMonthlyTotals: CompanyMonthlyTotal[] = [];
    for (let month = 1; month <= 12; month++) {
      const healthTotal = totals[month].healthTotal;
      const careTotal = totals[month].careTotal;
      const pensionTotal = totals[month].pensionTotal;
      const total = healthTotal + careTotal + pensionTotal;

      companyMonthlyTotals.push({
        month,
        healthTotal,
        careTotal,
        pensionTotal,
        total,
      });
    }

    return companyMonthlyTotals;
  }

  /**
   * 会社全体の年間保険料合計を計算する
   */
  calculateAnnualTotals(companyMonthlyTotals: CompanyMonthlyTotal[]): {
    health: number;
    care: number;
    pension: number;
    total: number;
  } {
    let health = 0;
    let care = 0;
    let pension = 0;
    let total = 0;

    for (const monthlyTotal of companyMonthlyTotals) {
      health += monthlyTotal.healthTotal;
      care += monthlyTotal.careTotal;
      pension += monthlyTotal.pensionTotal;
      total += monthlyTotal.total;
    }

    return { health, care, pension, total };
  }
}

