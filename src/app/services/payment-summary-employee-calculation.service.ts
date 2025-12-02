import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import { MonthlyPremiumCalculationService } from './monthly-premium-calculation.service';
import { BonusPremiumCalculationService } from './bonus-premium-calculation.service';
import { PremiumValidationService } from './premium-validation.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { MonthlyPremiumRow } from './payment-summary-calculation.service';

/**
 * PaymentSummaryEmployeeCalculationService
 * 
 * 保険料サマリー計算の従業員ごとの計算を担当するサービス
 * 月次保険料計算、資格取得時決定情報追加、年齢関連バリデーション、賞与保険料加算を提供
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryEmployeeCalculationService {
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private monthlyPremiumCalculationService: MonthlyPremiumCalculationService,
    private bonusPremiumCalculationService: BonusPremiumCalculationService,
    private premiumValidationService: PremiumValidationService
  ) {}

  /**
   * 従業員の月次保険料を計算
   */
  async calculateEmployeePremiums(
    emp: Employee,
    year: number,
    gradeTable: any[],
    rates: any,
    salaryDataByEmployeeId: { [employeeId: string]: any } | undefined,
    employeeBonuses: Bonus[],
    ageCache: { [month: number]: number },
    errorMessages: { [employeeId: string]: string[] },
    prefecture?: string
  ): Promise<{
    monthlyPremiumRows: MonthlyPremiumRow[];
    monthlyPremiums: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      };
    };
  }> {
    // 給与データを取得
    const salaryData = salaryDataByEmployeeId?.[emp.id] || 
      await this.monthlySalaryService.getEmployeeSalary(emp.id, year);
    console.log(`[payment-summary-calculation] 従業員=${emp.name}, 給与データ=`, salaryData);

    // 月次保険料一覧を計算
    const monthlyPremiumRows: MonthlyPremiumRow[] = [];
    const monthlyPremiums: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      };
    } = {};

    // 1〜12月分の月次保険料を計算
    for (let month = 1; month <= 12; month++) {
      const premiumRow = await this.monthlyPremiumCalculationService.calculateEmployeeMonthlyPremiums(
        emp,
        year,
        month,
        salaryData,
        gradeTable,
        rates,
        prefecture
      );
      monthlyPremiumRows.push(premiumRow);
      monthlyPremiums[month] = {
        healthEmployee: premiumRow.healthEmployee,
        healthEmployer: premiumRow.healthEmployer,
        careEmployee: premiumRow.careEmployee,
        careEmployer: premiumRow.careEmployer,
        pensionEmployee: premiumRow.pensionEmployee,
        pensionEmployer: premiumRow.pensionEmployer,
      };
    }

    // 資格取得時決定の情報を追加
    if (salaryData) {
      await this.monthlyPremiumCalculationService.addAcquisitionInfo(
        emp,
        year,
        salaryData,
        gradeTable,
        monthlyPremiumRows
      );
    }

    // 年齢関連の矛盾チェック
    if (salaryData) {
      this.premiumValidationService.validateAgeRelatedErrors(
        emp,
        monthlyPremiums,
        errorMessages,
        year,
        ageCache
      );
    }

    // 賞与保険料を月次給与の保険料に加算
    this.bonusPremiumCalculationService.addBonusPremiumsToMonthly(
      emp,
      year,
      employeeBonuses,
      monthlyPremiumRows,
      monthlyPremiums,
      ageCache
    );

    return {
      monthlyPremiumRows,
      monthlyPremiums,
    };
  }
}

