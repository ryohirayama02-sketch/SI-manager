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
    if (!employeeId) {
      return [];
    }
    if (!salaries || typeof salaries !== 'object') {
      return [];
    }
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
    if (!employeeId) {
      return [];
    }
    if (isNaN(changedMonth) || changedMonth < 1 || changedMonth > 12) {
      return [];
    }
    if (!salaries || typeof salaries !== 'object') {
      return [];
    }
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
    if (!employeeId) {
      return [];
    }
    if (!months || !Array.isArray(months)) {
      return [];
    }
    if (!salaries || typeof salaries !== 'object') {
      return [];
    }
    return this.suijiCalculationCoreService.getExcludedMonthsForSuiji(employeeId, months, salaries);
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
    if (!employeeId) {
      throw new Error('従業員IDが指定されていません');
    }
    if (isNaN(changeMonth) || changeMonth < 1 || changeMonth > 12) {
      throw new Error(`無効な変更月が指定されました: ${changeMonth}`);
    }
    if (!salaries || typeof salaries !== 'object') {
      throw new Error('給与データが指定されていません');
    }
    if (!gradeTable || !Array.isArray(gradeTable)) {
      throw new Error('標準報酬等級表が指定されていません');
    }
    if (isNaN(currentGrade) || currentGrade < 0) {
      throw new Error(`無効な現在等級が指定されました: ${currentGrade}`);
    }
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
    if (!employeeId) {
      return false;
    }
    if (isNaN(changedMonth) || changedMonth < 1 || changedMonth > 12) {
      return false;
    }
    if (!employees || !Array.isArray(employees)) {
      return false;
    }
    if (!year) {
      return false;
    }
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
    if (!employeeId) {
      throw new Error('従業員IDが指定されていません');
    }
    if (isNaN(changedMonth) || changedMonth < 1 || changedMonth > 12) {
      throw new Error(`無効な変更月が指定されました: ${changedMonth}`);
    }
    if (!salaries || typeof salaries !== 'object') {
      throw new Error('給与データが指定されていません');
    }
    if (!gradeTable || !Array.isArray(gradeTable)) {
      throw new Error('標準報酬等級表が指定されていません');
    }
    if (!employees || !Array.isArray(employees)) {
      throw new Error('従業員データが指定されていません');
    }
    if (!year) {
      throw new Error('年が指定されていません');
    }
    if (!currentResults || typeof currentResults !== 'object') {
      throw new Error('定時決定結果が指定されていません');
    }
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
    if (!employeeId) {
      return [];
    }
    if (!salaries || typeof salaries !== 'object') {
      return [];
    }
    if (!gradeTable || !Array.isArray(gradeTable)) {
      return [];
    }
    if (!employees || !Array.isArray(employees)) {
      return [];
    }
    if (!year) {
      return [];
    }
    if (!currentResults || typeof currentResults !== 'object') {
      return [];
    }
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
    if (!employee) {
      return [];
    }
    if (!year) {
      return [];
    }
    return this.suijiRehabService.getRehabHighlightMonths(employee, year);
  }
}

