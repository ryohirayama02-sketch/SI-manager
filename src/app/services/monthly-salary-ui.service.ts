import { Injectable } from '@angular/core';
import {
  MonthlySalaryStateService,
  MonthlySalaryUIState,
} from './monthly-salary-state.service';
import { MonthlySalaryDataService } from './monthly-salary-data.service';
import { MonthlySalaryCalculationService } from './monthly-salary-calculation.service';
import { MonthlySalarySaveService } from './monthly-salary-save.service';
import { MonthlySalaryInitializationService } from './monthly-salary-initialization.service';
import { Employee } from '../models/employee.model';
import { SalaryItem } from '../models/salary-item.model';
import { TeijiKetteiResult } from './salary-calculation.service';
import { SuijiKouhoResult } from './salary-calculation.service';

/**
 * MonthlySalaryUIService
 *
 * 月次給与画面のUIロジックを担当するサービス（オーケストレーション）
 * 初期化、状態管理、データロード、計算、保存の各サービスを統合して提供
 */
@Injectable({
  providedIn: 'root',
})
export class MonthlySalaryUIService {
  constructor(
    private state: MonthlySalaryStateService,
    private dataService: MonthlySalaryDataService,
    private calculationService: MonthlySalaryCalculationService,
    private saveService: MonthlySalarySaveService,
    private initializationService: MonthlySalaryInitializationService
  ) {}

  /**
   * 初期データをロード
   */
  async loadAllData(
    roomId: string,
    year: number,
    months: number[]
  ): Promise<MonthlySalaryUIState> {
    return this.initializationService.loadAllData(roomId, year, months);
  }

  /**
   * 年度変更時の処理
   */
  async onYearChange(
    roomId: string,
    year: number,
    employees: Employee[],
    months: number[],
    currentSalaryItems: SalaryItem[],
    currentSalaryItemData: { [key: string]: { [itemId: string]: number } },
    currentWorkingDaysData: { [key: string]: number },
    currentSalaries: {
      [key: string]: { total: number; fixed: number; variable: number };
    },
    currentResults: { [employeeId: string]: TeijiKetteiResult }
  ): Promise<{
    rates: any;
    gradeTable: any[];
    salaryItems: SalaryItem[];
    salaryItemData: { [key: string]: { [itemId: string]: number } };
    workingDaysData: { [key: string]: number };
    salaries: {
      [key: string]: { total: number; fixed: number; variable: number };
    };
    results: { [employeeId: string]: TeijiKetteiResult };
    infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    };
    exemptMonths: { [employeeId: string]: number[] };
    exemptReasons: { [key: string]: string };
    errorMessages: { [employeeId: string]: string[] };
    warningMessages: { [employeeId: string]: string[] };
  }> {
    return this.initializationService.onYearChange(
      roomId,
      year,
      employees,
      months,
      currentSalaryItems,
      currentSalaryItemData,
      currentWorkingDaysData,
      currentSalaries,
      currentResults
    );
  }

  /**
   * 給与データを保存
   */
  async saveAllSalaries(
    employees: Employee[],
    months: number[],
    year: number,
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    workingDaysData: { [key: string]: number },
    salaries: {
      [key: string]: { total: number; fixed: number; variable: number };
    },
    exemptMonths: { [employeeId: string]: number[] },
    salaryItems: SalaryItem[],
    gradeTable: any[]
  ): Promise<{
    suijiAlerts: SuijiKouhoResult[];
  }> {
    return this.saveService.saveAllSalaries(
      employees,
      months,
      year,
      salaryItemData,
      workingDaysData,
      salaries,
      exemptMonths,
      salaryItems,
      gradeTable
    );
  }

  /**
   * 給与集計を更新
   */
  updateSalaryTotals(
    employeeId: string,
    month: number,
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    salaries: {
      [key: string]: { total: number; fixed: number; variable: number };
    },
    salaryItems: SalaryItem[]
  ): void {
    this.dataService.updateSalaryTotals(
      employeeId,
      month,
      salaryItemData,
      salaries,
      salaryItems
    );
  }

  /**
   * 給与キーを取得
   */
  getSalaryKey(employeeId: string, month: number): string {
    return this.state.getSalaryKey(employeeId, month);
  }

  /**
   * 給与項目キーを取得
   */
  getSalaryItemKey(employeeId: string, month: number): string {
    return this.state.getSalaryItemKey(employeeId, month);
  }

  /**
   * 勤務日数キーを取得
   */
  getWorkingDaysKey(employeeId: string, month: number): string {
    return this.state.getWorkingDaysKey(employeeId, month);
  }

  /**
   * 免除理由を取得
   */
  getExemptReason(
    employeeId: string,
    month: number,
    exemptReasons: { [key: string]: string }
  ): string {
    return this.calculationService.getExemptReason(
      employeeId,
      month,
      exemptReasons
    );
  }

  /**
   * 全従業員の計算結果情報を更新
   */
  async updateAllCalculatedInfo(
    employees: Employee[],
    salaries: {
      [key: string]: { total: number; fixed: number; variable: number };
    },
    months: number[],
    gradeTable: any[],
    year: number
  ): Promise<{
    infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    };
    exemptMonths: { [employeeId: string]: number[] };
    exemptReasons: { [key: string]: string };
    errorMessages: { [employeeId: string]: string[] };
    warningMessages: { [employeeId: string]: string[] };
  }> {
    return this.calculationService.updateAllCalculatedInfo(
      employees,
      salaries,
      months,
      gradeTable,
      year
    );
  }

  /**
   * 標準報酬月額を取得
   */
  getStandardMonthlyRemuneration(
    avg: number | null,
    gradeTable: any[]
  ): { rank: number; standard: number } | null {
    return this.calculationService.getStandardMonthlyRemuneration(
      avg,
      gradeTable
    );
  }

  /**
   * 復職後随時改定の強調月を取得
   */
  getRehabHighlightMonths(
    employees: Employee[],
    year: number
  ): { [employeeId: string]: number[] } {
    return this.calculationService.getRehabHighlightMonths(employees, year);
  }
}
