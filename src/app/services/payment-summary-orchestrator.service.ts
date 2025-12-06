import { Injectable } from '@angular/core';
import {
  BonusAnnualTotal,
  CalculationResult,
  CompanyMonthlyTotal,
  MonthlyPremiumRow,
} from './payment-summary-types';
import { PaymentSummaryCalculationService } from './payment-summary-calculation.service';
import { PaymentSummaryDataPreparationService } from './payment-summary-data-preparation.service';
import { Bonus } from '../models/bonus.model';
import { Employee } from '../models/employee.model';

/**
 * PaymentSummaryOrchestratorService
 *
 * 将来的に payment-summary のオーケストレーションのみを切り出すためのラッパー。
 * ロジック本体は既存の分割サービスに委譲し、ここでは「呼び出し順序」だけを担う。
 *
 * 現状の動作を壊さないため、既存の PaymentSummaryCalculationService を引き続き使用し、
 * data.service からの呼び出しも従来どおり残す。
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryOrchestratorService {
  constructor(
    private calculationService: PaymentSummaryCalculationService,
    private dataPreparationService: PaymentSummaryDataPreparationService
  ) {}

  /**
   * 月次保険料の集計を実行（オーケストレーションのみ保持）
   */
  async calculateMonthlyTotals(
    employees: Employee[],
    bonuses: Bonus[],
    year: number,
    gradeTable: any[],
    rates: any,
    salaryDataByEmployeeId?: { [employeeId: string]: any },
    prefecture?: string
  ): Promise<CalculationResult> {
    // 従業員が0件の場合のデフォルト返却（元の calculation.service.ts と同じ挙動）
    if (!employees || employees.length === 0) {
      const bonusByMonth =
        this.dataPreparationService.groupBonusesByMonth(bonuses);
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
      const errorMessages: { [employeeId: string]: string[] } = {};
      return {
        monthlyPremiumsByEmployee: {},
        monthlyTotals: {},
        companyMonthlyTotals: [],
        bonusAnnualTotals,
        bonusByMonth,
        errorMessages,
      };
    }

    return this.calculationService.calculateMonthlyTotals(
      employees,
      bonuses,
      year,
      gradeTable,
      rates,
      salaryDataByEmployeeId,
      prefecture
    );
  }

  /**
   * 会社全体の年間保険料合計を計算
   */
  calculateAnnualTotals(companyMonthlyTotals: CompanyMonthlyTotal[]): {
    health: number;
    care: number;
    pension: number;
    total: number;
  } {
    return this.calculationService.calculateAnnualTotals(companyMonthlyTotals);
  }

  /**
   * 従業員に備考（notes）があるかを判定
   */
  hasNotesForEmployee(
    employeeId: string,
    monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    }
  ): boolean {
    return this.calculationService.hasNotesForEmployee(
      employeeId,
      monthlyPremiumsByEmployee
    );
  }
}
