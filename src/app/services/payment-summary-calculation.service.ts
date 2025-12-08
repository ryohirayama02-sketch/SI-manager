import { Injectable } from '@angular/core';
import { BonusPremiumCalculationService } from './bonus-premium-calculation.service';
import { PremiumAggregationService } from './premium-aggregation.service';
import { PaymentSummaryDataPreparationService } from './payment-summary-data-preparation.service';
import { PaymentSummaryEmployeeCalculationService } from './payment-summary-employee-calculation.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import {
  MonthlyPremiumRow,
  MonthlyTotal,
  CompanyMonthlyTotal,
  BonusAnnualTotal,
  CalculationResult,
} from './payment-summary-types';

/**
 * PaymentSummaryCalculationService
 *
 * 年間サマリー（payment-summary）の計算ロジックを担当するサービス（オーケストレーション）
 * 月次保険料計算、賞与保険料計算、集計、バリデーションの各サービスを統合して提供
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryCalculationService {
  constructor(
    private bonusPremiumCalculationService: BonusPremiumCalculationService,
    private premiumAggregationService: PremiumAggregationService,
    private dataPreparationService: PaymentSummaryDataPreparationService,
    private employeeCalculationService: PaymentSummaryEmployeeCalculationService
  ) {}

  async calculateMonthlyTotals(
    employees: Employee[],
    bonuses: Bonus[],
    year: number,
    gradeTable: any[],
    rates: any,
    salaryDataByEmployeeId?: { [employeeId: string]: any },
    prefecture?: string
  ): Promise<CalculationResult> {
    // データ準備
    const bonusByMonth =
      this.dataPreparationService.groupBonusesByMonth(bonuses);
    const bonusesByEmployee =
      this.dataPreparationService.groupBonusesByEmployee(bonuses);
    const ageCacheByEmployee = this.dataPreparationService.calculateAgeCache(
      employees,
      year
    );

    const errorMessages: { [employeeId: string]: string[] } = {};

    const monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    } = {};

    // 全従業員をループ
    for (const emp of employees) {
      const ageCache = ageCacheByEmployee[emp.id];
      const employeeBonuses = bonusesByEmployee[emp.id] || [];

      // 従業員の月次保険料を計算
      const result =
        await this.employeeCalculationService.calculateEmployeePremiums(
          emp,
          year,
          gradeTable,
          rates,
          salaryDataByEmployeeId,
          employeeBonuses,
          ageCache,
          errorMessages,
          prefecture
        );

      // 月次保険料一覧を保存
      monthlyPremiumsByEmployee[emp.id] = result.monthlyPremiumRows;
    }

    // 月ごとの集計を計算
    const allMonthlyTotals =
      this.premiumAggregationService.aggregateMonthlyTotals(
        employees,
        year,
        monthlyPremiumsByEmployee,
        bonusesByEmployee,
        ageCacheByEmployee
      );

    // 賞与保険料の年間合計を計算
    const bonusAnnualTotals =
      this.bonusPremiumCalculationService.calculateBonusAnnualTotals(
        bonuses,
        employees,
        year,
        ageCacheByEmployee
      );

    // 会社全体の月次保険料合計を計算
    const companyMonthlyTotals =
      this.premiumAggregationService.calculateCompanyMonthlyTotals(
        employees,
        monthlyPremiumsByEmployee
      );

    return {
      monthlyPremiumsByEmployee,
      monthlyTotals: allMonthlyTotals,
      companyMonthlyTotals,
      bonusAnnualTotals,
      bonusByMonth,
      errorMessages,
    };
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
    return this.premiumAggregationService.calculateAnnualTotals(
      companyMonthlyTotals
    );
  }

  /**
   * 従業員に備考（notes）があるかどうかを判定する
   */
  hasNotesForEmployee(
    employeeId: string,
    monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    }
  ): boolean {
    const rows = monthlyPremiumsByEmployee[employeeId];
    if (!rows || rows.length === 0) {
      return false;
    }
    return rows.some((r) => r.notes && r.notes.length > 0);
  }
}
