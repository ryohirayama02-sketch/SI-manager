import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { MonthlyPremiumCalculationService } from './monthly-premium-calculation.service';
import { BonusPremiumCalculationService } from './bonus-premium-calculation.service';
import { PremiumAggregationService } from './premium-aggregation.service';
import { PremiumValidationService } from './premium-validation.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';

export interface MonthlyPremiumRow {
  month: number;
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  exempt: boolean;
  notes: string[];
  isAcquisitionMonth?: boolean;
  acquisitionGrade?: number;
  acquisitionStandard?: number;
  acquisitionReason?: string;
  shikakuReportRequired?: boolean;
  shikakuReportDeadline?: string;
  shikakuReportReason?: string;
}

export interface MonthlyTotal {
  health: number;
  care: number;
  pension: number;
  total: number;
  isPensionStopped?: boolean;
  isHealthStopped?: boolean;
  isMaternityLeave?: boolean;
  isChildcareLeave?: boolean;
  isRetired?: boolean;
}

export interface CompanyMonthlyTotal {
  month: number;
  healthTotal: number;
  careTotal: number;
  pensionTotal: number;
  total: number;
}

export interface BonusAnnualTotal {
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  totalEmployee: number;
  totalEmployer: number;
  total: number;
}

export interface CalculationResult {
  monthlyPremiumsByEmployee: {
    [employeeId: string]: MonthlyPremiumRow[];
  };
  monthlyTotals: {
    [month: number]: MonthlyTotal;
  };
  companyMonthlyTotals: CompanyMonthlyTotal[];
  bonusAnnualTotals: BonusAnnualTotal;
  bonusByMonth: { [month: number]: Bonus[] };
  errorMessages: { [employeeId: string]: string[] };
}

/**
 * PaymentSummaryCalculationService
 * 
 * 年間サマリー（payment-summary）の計算ロジックを担当するサービス（オーケストレーション）
 * 月次保険料計算、賞与保険料計算、集計、バリデーションの各サービスを統合して提供
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryCalculationService {
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private monthlyPremiumCalculationService: MonthlyPremiumCalculationService,
    private bonusPremiumCalculationService: BonusPremiumCalculationService,
    private premiumAggregationService: PremiumAggregationService,
    private premiumValidationService: PremiumValidationService
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
    // 月ごとの賞与データを初期化
    const bonusByMonth: { [month: number]: Bonus[] } = {};
    for (const bonus of bonuses) {
      const month = bonus.month;
      if (month >= 1 && month <= 12) {
        if (!bonusByMonth[month]) {
          bonusByMonth[month] = [];
        }
        bonusByMonth[month].push(bonus);
      }
    }

    // 賞与データを従業員ごとにグループ化
    const bonusesByEmployee: { [employeeId: string]: Bonus[] } = {};
    for (const bonus of bonuses) {
      if (!bonusesByEmployee[bonus.employeeId]) {
        bonusesByEmployee[bonus.employeeId] = [];
      }
      bonusesByEmployee[bonus.employeeId].push(bonus);
    }

    const errorMessages: { [employeeId: string]: string[] } = {};

    if (!employees || employees.length === 0) {
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
      return {
        monthlyPremiumsByEmployee: {},
        monthlyTotals: {},
        companyMonthlyTotals: [],
        bonusAnnualTotals,
        bonusByMonth,
        errorMessages,
      };
    }

    const monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    } = {};

    const monthlyPremiums: {
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
    } = {};

    // 年齢キャッシュを事前計算
    const ageCacheByEmployee: { [employeeId: string]: { [month: number]: number } } = {};
    for (const emp of employees) {
      const birthDate = new Date(emp.birthDate);
      ageCacheByEmployee[emp.id] = {};
      for (let m = 1; m <= 12; m++) {
        ageCacheByEmployee[emp.id][m] = 
          this.employeeLifecycleService.getAgeAtMonth(birthDate, year, m);
      }
    }

    // 全従業員をループ
    for (const emp of employees) {
      const ageCache = ageCacheByEmployee[emp.id];
      
      // 給与データを取得
      const salaryData = salaryDataByEmployeeId?.[emp.id] || 
        await this.monthlySalaryService.getEmployeeSalary(emp.id, year);
      console.log(`[payment-summary-calculation] 従業員=${emp.name}, 給与データ=`, salaryData);

      // 月次保険料一覧を計算
      const monthlyPremiumRows: MonthlyPremiumRow[] = [];
      const monthlyPremiumsForEmp: {
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
        monthlyPremiumsForEmp[month] = {
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
          monthlyPremiumsForEmp,
          errorMessages,
          year,
          ageCache
        );
      }

      // 賞与保険料を月次給与の保険料に加算
      const employeeBonuses = bonusesByEmployee[emp.id] || [];
      this.bonusPremiumCalculationService.addBonusPremiumsToMonthly(
        emp,
        year,
        employeeBonuses,
        monthlyPremiumRows,
        monthlyPremiumsForEmp,
        ageCache
      );

      // 月次保険料一覧を保存
      monthlyPremiumsByEmployee[emp.id] = monthlyPremiumRows;
      monthlyPremiums[emp.id] = monthlyPremiumsForEmp;
    }

    // 月ごとの集計を計算
    const allMonthlyTotals = this.premiumAggregationService.aggregateMonthlyTotals(
      employees,
      year,
      monthlyPremiumsByEmployee,
      monthlyPremiums,
      bonusesByEmployee,
      ageCacheByEmployee
    );

    // 賞与保険料を支給月の月別合計に加算
    this.premiumAggregationService.addBonusToMonthlyTotals(
      bonuses,
      employees,
      year,
      allMonthlyTotals,
      ageCacheByEmployee
    );

    // 賞与保険料の年間合計を計算
    const bonusAnnualTotals = this.bonusPremiumCalculationService.calculateBonusAnnualTotals(
      bonuses,
      employees,
      year,
      ageCacheByEmployee
    );

    // 会社全体の月次保険料合計を計算
    const companyMonthlyTotals = this.premiumAggregationService.calculateCompanyMonthlyTotals(
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
    return this.premiumAggregationService.calculateAnnualTotals(companyMonthlyTotals);
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
