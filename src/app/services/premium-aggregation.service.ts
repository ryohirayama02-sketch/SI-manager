import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { MonthlyPremiumRow, MonthlyTotal, CompanyMonthlyTotal } from './payment-summary-calculation.service';
import { MonthlyPremiumAggregationService } from './monthly-premium-aggregation.service';
import { BonusPremiumAggregationService } from './bonus-premium-aggregation.service';

/**
 * PremiumAggregationService
 * 
 * 会社全体の集計を担当するサービス（オーケストレーション）
 * 月次合計、年間合計を計算
 */
@Injectable({ providedIn: 'root' })
export class PremiumAggregationService {
  constructor(
    private monthlyPremiumAggregationService: MonthlyPremiumAggregationService,
    private bonusPremiumAggregationService: BonusPremiumAggregationService
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
    return this.monthlyPremiumAggregationService.aggregateMonthlyTotals(
      employees,
      year,
      monthlyPremiums,
      bonusesByEmployee,
      ageCacheByEmployee
    );
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
    this.bonusPremiumAggregationService.addBonusToMonthlyTotals(
      bonuses,
      employees,
      year,
      allMonthlyTotals,
      ageCacheByEmployee
    );
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

