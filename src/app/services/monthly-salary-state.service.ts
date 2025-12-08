import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { SalaryItem } from '../models/salary-item.model';
import { TeijiKetteiResult } from './salary-calculation.service';

export interface MonthlySalaryUIState {
  employees: Employee[];
  salaryItems: SalaryItem[];
  salaryItemData: { [key: string]: { [itemId: string]: number } };
  workingDaysData: { [key: string]: number };
  salaries: { [key: string]: { total: number; fixed: number; variable: number } };
  year: number;
  rates: any;
  gradeTable: any[];
  results: { [employeeId: string]: TeijiKetteiResult };
  exemptMonths: { [employeeId: string]: number[] };
  exemptReasons: { [key: string]: string };
  rehabHighlightMonths: { [employeeId: string]: number[] };
  errorMessages: { [employeeId: string]: string[] };
  warningMessages: { [employeeId: string]: string[] };
  infoByEmployee: {
    [employeeId: string]: {
      avg: number | null;
      standard: number | null;
      rank: number | null;
      premiums: any;
    };
  };
}

/**
 * MonthlySalaryStateService
 * 
 * 月次給与画面の状態管理を担当するサービス
 * MonthlySalaryUIStateの状態管理と状態の初期化・更新・取得メソッドを提供
 */
@Injectable({ providedIn: 'root' })
export class MonthlySalaryStateService {
  employees: Employee[] = [];
  salaryItems: SalaryItem[] = [];
  salaryItemData: { [key: string]: { [itemId: string]: number } } = {};
  workingDaysData: { [key: string]: number } = {};
  salaries: { [key: string]: { total: number; fixed: number; variable: number } } = {};
  year: number = 2025;
  rates: any = null;
  gradeTable: any[] = [];
  results: { [employeeId: string]: TeijiKetteiResult } = {};
  exemptMonths: { [employeeId: string]: number[] } = {};
  exemptReasons: { [key: string]: string } = {};
  rehabHighlightMonths: { [employeeId: string]: number[] } = {};
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};
  infoByEmployee: {
    [employeeId: string]: {
      avg: number | null;
      standard: number | null;
      rank: number | null;
      premiums: any;
    };
  } = {};

  /**
   * 状態を初期化
   */
  initializeState(year: number, months: number[], employees: Employee[]): void {
    this.year = year;
    this.employees = employees;
    
    // エラー・警告メッセージを初期化
    this.errorMessages = {};
    this.warningMessages = {};
    for (const emp of employees) {
      this.errorMessages[emp.id] = [];
      this.warningMessages[emp.id] = [];
    }

    // 全従業員×全月のsalariesオブジェクトを初期化
    this.salaries = {};
    this.salaryItemData = {};
    this.workingDaysData = {};
    
    for (const emp of employees) {
      for (const month of months) {
        const key = this.getSalaryKey(emp.id, month);
        if (!this.salaries[key]) {
          this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
        }
        // 項目別データも初期化
        const itemKey = this.getSalaryItemKey(emp.id, month);
        if (!this.salaryItemData[itemKey]) {
          this.salaryItemData[itemKey] = {};
        }
        // 支払基礎日数も初期化（デフォルト値は月の日数に応じて設定）
        const workingDaysKey = this.getWorkingDaysKey(emp.id, month);
        if (this.workingDaysData[workingDaysKey] === undefined) {
          const daysInMonth = new Date(year, month, 0).getDate();
          this.workingDaysData[workingDaysKey] = daysInMonth;
        }
      }
    }
  }

  /**
   * 給与項目マスタを設定
   */
  setSalaryItems(salaryItems: SalaryItem[]): void {
    this.salaryItems = salaryItems;
  }

  /**
   * 料率と等級表を設定
   */
  setRatesAndGradeTable(rates: any, gradeTable: any[]): void {
    this.rates = rates;
    this.gradeTable = gradeTable;
  }

  /**
   * 給与データを設定
   */
  setSalaryData(data: {
    salaryItemData: { [key: string]: { [itemId: string]: number } };
    workingDaysData: { [key: string]: number };
    salaries: { [key: string]: { total: number; fixed: number; variable: number } };
  }): void {
    this.salaryItemData = data.salaryItemData;
    this.workingDaysData = data.workingDaysData;
    this.salaries = data.salaries;
  }

  /**
   * 定時決定結果を設定
   */
  setResults(results: { [employeeId: string]: TeijiKetteiResult }): void {
    this.results = results;
  }

  /**
   * 計算結果情報を設定
   */
  setCalculatedInfo(data: {
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
  }): void {
    this.infoByEmployee = data.infoByEmployee;
    this.exemptMonths = data.exemptMonths;
    this.exemptReasons = data.exemptReasons;
    
    // エラー・警告メッセージをマージ
    for (const empId in data.errorMessages) {
      this.errorMessages[empId] = data.errorMessages[empId];
    }
    for (const empId in data.warningMessages) {
      this.warningMessages[empId] = data.warningMessages[empId];
    }
  }

  /**
   * 復職ハイライト月を設定
   */
  setRehabHighlightMonths(rehabHighlightMonths: { [employeeId: string]: number[] }): void {
    this.rehabHighlightMonths = rehabHighlightMonths;
  }

  /**
   * システム警告を追加
   */
  addSystemWarning(message: string): void {
    if (!this.warningMessages['system']) {
      this.warningMessages['system'] = [];
    }
    this.warningMessages['system'].push(message);
  }

  /**
   * 給与キーを取得
   */
  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 給与項目キーを取得
   */
  getSalaryItemKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 勤務日数キーを取得
   */
  getWorkingDaysKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }
}







