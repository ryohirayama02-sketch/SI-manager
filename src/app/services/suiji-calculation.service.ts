import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import {
  SalaryData,
  TeijiKetteiResult,
  SuijiCandidate,
  ExcludedSuijiReason,
  SuijiKouhoResult,
  FixedSalaryChangeSuijiResult,
} from './salary-calculation.service';
import { SuijiDetectionService } from './suiji-detection.service';
import { SuijiCalculationCoreService } from './suiji-calculation-core.service';
import { SuijiKetteiCalculationService } from './suiji-kettei-calculation.service';
import { SuijiRehabService } from './suiji-rehab.service';

/**
 * SuijiCalculationService
 * 
 * 随時改定計算のオーケストレーションサービス
 * 検出、計算、リハビリの各サービスを統合して提供
 */
@Injectable({ providedIn: 'root' })
export class SuijiCalculationService {
  constructor(
    private suijiDetectionService: SuijiDetectionService,
    private suijiCalculationCoreService: SuijiCalculationCoreService,
    private suijiKetteiCalculationService: SuijiKetteiCalculationService,
    private suijiRehabService: SuijiRehabService
  ) {}

  /**
   * 固定的賃金の変動を検出する
   */
  detectFixedSalaryChanges(
    employeeId: string,
    salaries: { [key: string]: SalaryData }
  ): number[] {
    return this.suijiDetectionService.detectFixedSalaryChanges(employeeId, salaries);
  }

  /**
   * 変動月を含む3ヶ月の固定給を取得
   */
  getFixed3Months(
    employeeId: string,
    changedMonth: number,
    salaries: { [key: string]: SalaryData }
  ): number[] {
    return this.suijiCalculationCoreService.getFixed3Months(employeeId, changedMonth, salaries);
  }

  /**
   * 随時改定の除外月を判定する
   */
  getExcludedMonthsForSuiji(
    employeeId: string,
    months: number[],
    salaries: { [key: string]: SalaryData }
  ): number[] {
    return this.suijiCalculationCoreService.getExcludedMonthsForSuiji(employeeId, months, salaries);
  }

  /**
   * 随時改定用の平均を計算（特例対応）
   */
  calculateAverageForSuiji(
    fixedValues: number[],
    excludedMonths: number[],
    months: number[]
  ): number | null {
    return this.suijiCalculationCoreService.calculateAverageForSuiji(fixedValues, excludedMonths, months);
  }

  /**
   * 随時改定（固定的賃金の変動）を判定する
   */
  calculateFixedSalaryChangeSuiji(
    employeeId: string,
    changeMonth: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    currentGrade: number
  ): FixedSalaryChangeSuijiResult {
    return this.suijiCalculationCoreService.calculateFixedSalaryChangeSuiji(
      employeeId,
      changeMonth,
      salaries,
      gradeTable,
      currentGrade
    );
  }

  /**
   * 資格取得後3ヶ月以内かどうかを判定する
   */
  isWithin3MonthsAfterJoin(
    employeeId: string,
    changedMonth: number,
    employees: Employee[],
    year: string
  ): boolean {
    return this.suijiDetectionService.isWithin3MonthsAfterJoin(employeeId, changedMonth, employees, year);
  }

  /**
   * 随時改定のメイン処理
   */
  calculateSuijiKetteiCore(
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
    return this.suijiKetteiCalculationService.calculateSuijiKetteiCore(
      employeeId,
      changedMonth,
      salaries,
      gradeTable,
      employees,
      year,
      currentResults
    );
  }

  /**
   * 復職（産休・育休終了）に伴う固定的賃金の変動を検出し、随時改定候補を判定する
   */
  checkRehabSuiji(
    employeeId: string,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    employees: Employee[],
    year: string,
    currentResults: { [employeeId: string]: TeijiKetteiResult }
  ): SuijiKouhoResult[] {
    return this.suijiRehabService.checkRehabSuiji(
      employeeId,
      salaries,
      gradeTable,
      employees,
      year,
      currentResults
    );
  }

  /**
   * 復職月のハイライト月を取得する
   */
  getRehabHighlightMonths(employee: Employee, year: string): number[] {
    return this.suijiRehabService.getRehabHighlightMonths(employee, year);
  }
}

