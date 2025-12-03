import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { NotificationDecisionResult } from './notification-decision.service';

/**
 * PaymentSummaryStateService
 * 
 * 保険料サマリー画面の状態管理を担当するサービス
 * 全プロパティの状態管理と状態の初期化・更新・取得メソッドを提供
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryStateService {
  // 基本情報
  employees: Employee[] = [];
  year: number = 2025;
  selectedMonth: number | 'all' | string = new Date().getMonth() + 1;
  availableYears: number[] = [];
  prefecture: string = 'tokyo';
  rates: any = null;
  gradeTable: any[] = [];

  // 月ごとの集計結果
  monthlyTotals: {
    [month: number]: {
      health: number;
      care: number;
      pension: number;
      total: number;
      isPensionStopped?: boolean;
      isHealthStopped?: boolean;
      isMaternityLeave?: boolean;
      isChildcareLeave?: boolean;
      isRetired?: boolean;
    };
  } = {};

  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};
  warnings: string[] = []; // 年間警告パネル用

  // 月次保険料一覧（従業員ごと）
  monthlyPremiumsByEmployee: {
    [employeeId: string]: {
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
    }[];
  } = {};

  // 会社全体の月次保険料合計
  companyMonthlyTotals: {
    month: number;
    healthTotal: number;
    careTotal: number;
    pensionTotal: number;
    total: number;
  }[] = [];

  // 届出要否判定結果（従業員ごと）
  notificationsByEmployee: {
    [employeeId: string]: NotificationDecisionResult[];
  } = {};

  // 賞与保険料の年間合計
  bonusAnnualTotals: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    totalEmployee: number;
    totalEmployer: number;
    total: number;
  } = {
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

  // 月ごとの賞与データ
  bonusByMonth: { [month: number]: Bonus[] } = {};

  // 会社全体の年間保険料合計
  annualTotals: {
    health: number;
    care: number;
    pension: number;
    total: number;
  } = {
    health: 0,
    care: 0,
    pension: 0,
    total: 0,
  };

  // 現在の年度の賞与データ（キャッシュ用）
  currentYearBonuses: Bonus[] = [];

  // 現在の年度の月次給与データ（キャッシュ用）
  salaryDataByEmployeeId: { [employeeId: string]: any } = {};

  // 現在の年度の賞与データ（従業員ごとにグループ化）
  bonusesByEmployeeId: { [employeeId: string]: Bonus[] } = {};

  // ローディング状態
  isLoading: boolean = false;

  constructor() {
    // 年度選択用のリストを初期化
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 5; i <= currentYear + 1; i++) {
      this.availableYears.push(i);
    }
  }

  /**
   * 年度を設定
   */
  setYear(year: number): void {
    this.year = year;
  }

  /**
   * 選択月を設定
   */
  setSelectedMonth(month: number | 'all' | string): void {
    if (month !== 'all' && typeof month === 'string') {
      this.selectedMonth = Number(month);
    } else {
      this.selectedMonth = month;
    }
  }

  /**
   * ローディング状態を設定
   */
  setIsLoading(isLoading: boolean): void {
    this.isLoading = isLoading;
  }

  /**
   * 従業員リストを設定
   */
  setEmployees(employees: Employee[]): void {
    this.employees = employees || [];
  }

  /**
   * 料率と等級表を設定
   */
  setRatesAndGradeTable(rates: any, gradeTable: any[]): void {
    this.rates = rates;
    this.gradeTable = gradeTable;
  }

  /**
   * 賞与データを設定
   */
  setBonuses(bonuses: Bonus[]): void {
    this.currentYearBonuses = bonuses;
    // 従業員ごとにグループ化
    this.bonusesByEmployeeId = {};
    for (const bonus of bonuses) {
      if (!this.bonusesByEmployeeId[bonus.employeeId]) {
        this.bonusesByEmployeeId[bonus.employeeId] = [];
      }
      this.bonusesByEmployeeId[bonus.employeeId].push(bonus);
    }
  }

  /**
   * 給与データを設定
   */
  setSalaryData(salaryDataByEmployeeId: { [employeeId: string]: any }): void {
    this.salaryDataByEmployeeId = salaryDataByEmployeeId;
  }

  /**
   * 計算結果を設定
   */
  setCalculationResults(result: {
    monthlyPremiumsByEmployee: {
      [employeeId: string]: {
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
      }[];
    };
    monthlyTotals: {
      [month: number]: {
        health: number;
        care: number;
        pension: number;
        total: number;
        isPensionStopped?: boolean;
        isHealthStopped?: boolean;
        isMaternityLeave?: boolean;
        isChildcareLeave?: boolean;
        isRetired?: boolean;
      };
    };
    companyMonthlyTotals: {
      month: number;
      healthTotal: number;
      careTotal: number;
      pensionTotal: number;
      total: number;
    }[];
    bonusAnnualTotals: {
      healthEmployee: number;
      healthEmployer: number;
      careEmployee: number;
      careEmployer: number;
      pensionEmployee: number;
      pensionEmployer: number;
      totalEmployee: number;
      totalEmployer: number;
      total: number;
    };
    bonusByMonth: { [month: number]: Bonus[] };
    errorMessages: { [employeeId: string]: string[] };
  }): void {
    this.monthlyPremiumsByEmployee = result.monthlyPremiumsByEmployee;
    this.monthlyTotals = result.monthlyTotals;
    this.companyMonthlyTotals = result.companyMonthlyTotals;
    this.bonusAnnualTotals = result.bonusAnnualTotals;
    this.bonusByMonth = result.bonusByMonth;
    this.errorMessages = result.errorMessages;
  }

  /**
   * 年間合計を設定
   */
  setAnnualTotals(annualTotals: {
    health: number;
    care: number;
    pension: number;
    total: number;
  }): void {
    this.annualTotals = annualTotals;
  }

  /**
   * 届出要否判定結果を設定
   */
  setNotifications(notificationsByEmployee: {
    [employeeId: string]: NotificationDecisionResult[];
  }): void {
    this.notificationsByEmployee = notificationsByEmployee;
  }

  /**
   * 年間警告を設定
   */
  setWarnings(warnings: string[]): void {
    this.warnings = warnings;
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.salaryDataByEmployeeId = {};
    this.bonusesByEmployeeId = {};
  }

  /**
   * 全従業員を返す（フィルターなし）
   */
  getFilteredEmployees(): Employee[] {
    return this.employees;
  }
}



