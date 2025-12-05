import { Injectable } from '@angular/core';
import { InsuranceCalculationService } from './insurance-calculation.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { MonthlyTotal } from './payment-summary-calculation.service';

/**
 * MonthlyPremiumAggregationService
 * 
 * 月次保険料の集計を担当するサービス
 * 従業員ごとの月次会社負担を計算し、全従業員分を合計
 */
@Injectable({ providedIn: 'root' })
export class MonthlyPremiumAggregationService {
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
}




