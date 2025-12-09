/**
 * SalaryCalculationService（ラッパー）
 *
 * 役割：
 * 他の計算サービス群（Teiji / Suiji / Shikaku / Premium / Aggregation / Exemption / Grade）への
 * 統合フロントとしての公開 API を保持する
 *
 * 計算ロジック本体は各サービスへ移管済み
 */

import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { MonthlySalaryService } from './monthly-salary.service';
import { EmployeeService } from './employee.service';
import { GradeDeterminationService } from './grade-determination.service';
import { SalaryAggregationService } from './salary-aggregation.service';
import { ExemptionDeterminationService } from './exemption-determination.service';
import { ShikakuCalculationService } from './shikaku-calculation.service';
import { TeijiCalculationService } from './teiji-calculation.service';
import { SuijiCalculationService } from './suiji-calculation.service';
import { PremiumCalculationService } from './premium-calculation.service';
import { RoomIdService } from './room-id.service';
import {
  SalaryItemEntry,
  MonthlySalaryData,
} from '../models/monthly-salary.model';
import { SalaryItem } from '../models/salary-item.model';

export interface SalaryData {
  total: number;
  fixed: number;
  variable: number;
  workingDays?: number;
  deductionTotal?: number; // 欠勤控除合計（オプショナル）
}

export interface TeijiKetteiResult {
  averageSalary: number;
  excludedMonths: number[];
  usedMonths: number[];
  grade: number;
  standardMonthlyRemuneration: number;
  reasons: string[];
  average46?: number;
  startApplyYearMonth?: { year: number; month: number };
}

export interface SuijiCandidate {
  employeeId: string;
  name: string;
  changedMonth: number;
  avgFixed: number;
  currentGrade: number;
  newGrade: number;
  gradeDiff: number;
  applyMonth: number;
  excludedMonths: number[];
  fixedValues: number[];
}

export interface RehabSuijiCandidate {
  employeeId: string;
  name: string;
  changedMonth: number;
  fixedValues: number[];
  avgFixed: number;
  currentGrade: number;
  newGrade: number;
  gradeDiff: number;
  applyMonth: number;
}

export interface ExcludedSuijiReason {
  employeeId: string;
  name: string;
  reason: string;
}

export interface FixedSalaryChangeSuijiResult {
  changeMonth: number;
  averageSalary: number;
  currentGrade: number;
  newGrade: number;
  diff: number;
  willApply: boolean;
  applyMonth: number | null;
  reasons: string[];
}

export interface SuijiKouhoResult {
  employeeId: string;
  changeMonth: number;
  averageSalary: number;
  currentGrade: number;
  newGrade: number;
  diff: number;
  applyStartMonth: number;
  reasons: string[];
  isEligible: boolean;
}

export interface ShikakuShutokuResult {
  baseSalary: number;
  grade: number;
  standardMonthlyRemuneration: number;
  usedMonth: number;
  reasons: string[];
}

export interface MonthlyPremiums {
  health_employee: number;
  health_employer: number;
  care_employee: number;
  care_employer: number;
  pension_employee: number;
  pension_employer: number;
}

@Injectable({ providedIn: 'root' })
export class SalaryCalculationService {
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private employeeService: EmployeeService,
    private gradeDeterminationService: GradeDeterminationService,
    private salaryAggregationService: SalaryAggregationService,
    private exemptionDeterminationService: ExemptionDeterminationService,
    private shikakuCalculationService: ShikakuCalculationService,
    private teijiCalculationService: TeijiCalculationService,
    private suijiCalculationService: SuijiCalculationService,
    private premiumCalculationService: PremiumCalculationService,
    private roomIdService: RoomIdService
  ) {}

  /** 給与データのキーを作成（外部から呼ばれるため公開） */
  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /** 現在日時における年齢を計算（後方互換性のため残す） */
  calculateAge(birthDate: string): number {
    return this.exemptionDeterminationService.calculateAge(birthDate);
  }

  /** 指定年月が介護保険適用対象かどうかを判定する（後方互換性のため残す） */
  isCareInsuranceApplicable(
    birthDate: string,
    year: number,
    month: number
  ): boolean {
    return this.exemptionDeterminationService.isCareInsuranceApplicable(
      birthDate,
      year,
      month
    );
  }

  /** 指定年月における介護保険区分を取得する（後方互換性のため残す） */
  getCareInsuranceType(
    birthDate: string,
    year: number,
    month: number
  ): 'none' | 'type1' | 'type2' {
    return this.exemptionDeterminationService.getCareInsuranceType(
      birthDate,
      year,
      month
    );
  }

  /** 指定月が免除月（産前産後休業・育児休業）かどうかを判定する（後方互換性のため残す） */
  isExemptMonth(emp: Employee, year: number, month: number): boolean {
    return this.exemptionDeterminationService.isExemptMonth(emp, year, month);
  }

  /** 指定年月の免除理由を取得（産休・育休・休職）（後方互換性のため残す） */
  getExemptReasonForMonth(
    emp: Employee,
    year: number,
    month: number
  ): { exempt: boolean; reason: string } {
    return this.exemptionDeterminationService.getExemptReasonForMonth(
      emp,
      year,
      month
    );
  }

  /** 平均報酬から等級と標準報酬月額を検索（後方互換性のため残す） */
  findGrade(
    gradeTable: any[],
    average: number
  ): { grade: number; remuneration: number } | null {
    return this.gradeDeterminationService.findGrade(gradeTable, average);
  }

  /** 定時決定を計算する（後方互換性のため残す） */
  calculateTeijiKettei(
    employeeId: string,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    year: number,
    currentStandardMonthlyRemuneration?: number,
    employee?: Employee
  ): TeijiKetteiResult {
    return this.teijiCalculationService.calculateTeijiKetteiCore(
      employeeId,
      salaries,
      gradeTable,
      year,
      currentStandardMonthlyRemuneration,
      employee
    );
  }

  /** 固定的賃金の変動を検出する（後方互換性のため残す） */
  detectFixedSalaryChanges(
    employeeId: string,
    salaries: { [key: string]: SalaryData }
  ): number[] {
    return this.suijiCalculationService.detectFixedSalaryChanges(
      employeeId,
      salaries
    );
  }

  /** 随時改定（固定的賃金の変動）を判定する（後方互換性のため残す） */
  calculateFixedSalaryChangeSuiji(
    employeeId: string,
    changeMonth: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    currentGrade: number
  ): FixedSalaryChangeSuijiResult {
    return this.suijiCalculationService.calculateFixedSalaryChangeSuiji(
      employeeId,
      changeMonth,
      salaries,
      gradeTable,
      currentGrade
    );
  }

  /** 随時改定（固定的賃金の変動）を判定する（後方互換性のため残す） */
  calculateSuijiKettei(
    employeeId: string,
    changedMonth: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    employees: Employee[],
    year: string,
    currentResults: { [employeeId: string]: TeijiKetteiResult }
  ): {
    candidate: SuijiCandidate | null;
    excludedReason: ExcludedSuijiReason | null;
  } {
    return this.suijiCalculationService.calculateSuijiKetteiCore(
      employeeId,
      changedMonth,
      salaries,
      gradeTable,
      employees,
      year,
      currentResults
    );
  }

  /** 復職（産休・育休終了）に伴う固定的賃金の変動を検出し、随時改定候補を判定する（後方互換性のため残す） */
  checkRehabSuiji(
    employeeId: string,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    employees: Employee[],
    year: string,
    currentResults: { [employeeId: string]: TeijiKetteiResult }
  ): SuijiKouhoResult[] {
    return this.suijiCalculationService.checkRehabSuiji(
      employeeId,
      salaries,
      gradeTable,
      employees,
      year,
      currentResults
    );
  }

  /** 月次給与の保険料を計算（後方互換性のため残す） */
  async calculateMonthlyPremiums(
    employee: Employee,
    year: number,
    month: number,
    fixedSalary: number,
    variableSalary: number,
    gradeTable: any[],
    suijiAlerts?: SuijiKouhoResult[]
  ): Promise<MonthlyPremiums & { reasons: string[] }> {
    return this.premiumCalculationService.calculateMonthlyPremiumsCore(
      employee,
      year,
      month,
      fixedSalary,
      variableSalary,
      gradeTable,
      suijiAlerts
    );
  }

  /** 復職ハイライト月を取得（後方互換性のため残す） */
  getRehabHighlightMonths(employee: Employee, year: string): number[] {
    return this.suijiCalculationService.getRehabHighlightMonths(employee, year);
  }

  /** 給与扱いとなった賞与を標準報酬月額に合算する（外部から呼ばれるため公開） */
  async addBonusAsSalary(
    employeeId: string,
    year: number,
    month: number,
    standardBonus: number
  ): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const monthData =
      (await this.monthlySalaryService.getEmployeeSalary(
        roomId,
        employeeId,
        year,
        month
      )) || {
        fixedSalary: 0,
        variableSalary: 0,
        totalSalary: 0,
        fixed: 0,
        variable: 0,
        total: 0,
      };

    const currentFixed =
      (monthData as any).fixedSalary ?? (monthData as any).fixed ?? 0;
    const currentVariable =
      (monthData as any).variableSalary ?? (monthData as any).variable ?? 0;
    const newTotal = currentFixed + currentVariable + standardBonus;

    await this.monthlySalaryService.saveEmployeeSalary(
      roomId,
      employeeId,
      year,
      month,
      {
        fixedSalary: currentFixed,
        variableSalary: currentVariable + standardBonus,
        totalSalary: newTotal,
        fixed: currentFixed,
        variable: currentVariable + standardBonus,
        total: newTotal,
      }
    );
  }

  /** 資格取得時決定（入社月の標準報酬決定）を計算する（後方互換性のため残す） */
  async calculateShikakuShutoku(
    employee: Employee,
    year: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[]
  ): Promise<ShikakuShutokuResult | null> {
    return this.shikakuCalculationService.calculateShikakuShutokuCore(
      employee,
      year,
      salaries,
      gradeTable
    );
  }

  /** 給与項目マスタから固定/非固定の合計を計算 */
  calculateSalaryTotals(
    salaryItems: SalaryItemEntry[],
    salaryItemMaster: SalaryItem[]
  ): {
    fixedTotal: number;
    variableTotal: number;
    deductionTotal: number;
    total: number;
  } {
    return this.salaryAggregationService.calculateSalaryTotals(
      salaryItems,
      salaryItemMaster
    );
  }

  /** 給与データから固定/非固定/総支給を取得 */
  getSalaryFromData(data: MonthlySalaryData | SalaryData | undefined): {
    fixed: number;
    variable: number;
    total: number;
  } {
    return this.salaryAggregationService.getSalaryFromData(data);
  }

  /** 4〜6月の平均報酬を計算 */
  getAverageForAprToJun(
    employeeId: string,
    salaries: { [key: string]: SalaryData }
  ): number | null {
    return this.salaryAggregationService.getAverageForAprToJun(
      employeeId,
      salaries,
      (values, excludedMonths) =>
        this.teijiCalculationService.calculateAverage(values, excludedMonths)
    );
  }

  /** 標準報酬月額を取得 */
  getStandardMonthlyRemuneration(
    avg: number | null,
    gradeTable: any[]
  ): { rank: number; standard: number } | null {
    return this.gradeDeterminationService.getStandardMonthlyRemuneration(
      avg,
      gradeTable
    );
  }

  /** 月次保険料を計算（簡易版）（後方互換性のため残す） */
  calculateInsurancePremiums(
    standard: number,
    birthDate: string,
    year: number,
    month: number,
    rates: any
  ): {
    health_employee: number;
    health_employer: number;
    care_employee: number;
    care_employer: number;
    pension_employee: number;
    pension_employer: number;
  } | null {
    return this.premiumCalculationService.calculateInsurancePremiumsCore(
      standard,
      birthDate,
      year,
      month,
      rates
    );
  }
}
