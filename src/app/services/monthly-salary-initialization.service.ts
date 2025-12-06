import { Injectable } from '@angular/core';
import { EmployeeService } from './employee.service';
import { MonthlySalaryStateService, MonthlySalaryUIState } from './monthly-salary-state.service';
import { MonthlySalaryDataService } from './monthly-salary-data.service';
import { MonthlySalaryCalculationService } from './monthly-salary-calculation.service';
import { Employee } from '../models/employee.model';
import { SalaryItem } from '../models/salary-item.model';
import { TeijiKetteiResult } from './salary-calculation.service';

/**
 * MonthlySalaryInitializationService
 * 
 * 月次給与画面の初期化ロジックを担当するサービス
 * 初期データロードと年度変更処理を提供
 */
@Injectable({ providedIn: 'root' })
export class MonthlySalaryInitializationService {
  constructor(
    private employeeService: EmployeeService,
    private state: MonthlySalaryStateService,
    private dataService: MonthlySalaryDataService,
    private calculationService: MonthlySalaryCalculationService
  ) {}

  /**
   * 初期データをロード
   */
  async loadAllData(year: number, months: number[]): Promise<MonthlySalaryUIState> {
    const employees = await this.employeeService.getAllEmployees();
    
    // 状態を初期化
    this.state.initializeState(year, months, employees);

    // 給与項目マスタを読み込む
    const salaryItems = await this.dataService.loadSalaryItems(year);
    this.state.setSalaryItems(salaryItems);
    if (salaryItems.length === 0) {
      this.state.addSystemWarning('先に給与項目マスタを設定してください');
    }

    // 料率と等級表を取得
    const { rates, gradeTable } = await this.dataService.loadRatesAndGradeTable(year, employees);
    this.state.setRatesAndGradeTable(rates, gradeTable);

    // 標準報酬等級表が空の場合の警告
    if (gradeTable.length === 0) {
      this.state.addSystemWarning('標準報酬等級表が設定されていません。設定画面で標準報酬等級表を設定してください。');
    }

    // 既存の給与データを読み込む
    const loadedData = await this.dataService.loadExistingSalaries(
      employees,
      months,
      year,
      this.state.salaryItemData,
      this.state.workingDaysData,
      this.state.salaries,
      salaryItems
    );
    this.state.setSalaryData(loadedData);

    // 全従業員の定時決定を計算
    const results: { [employeeId: string]: TeijiKetteiResult } = {};
    for (const emp of employees) {
      results[emp.id] = this.calculationService.calculateTeijiKettei(
        emp.id,
        loadedData.salaries,
        gradeTable,
        year
      );
    }
    this.state.setResults(results);

    // 全従業員の計算結果情報を取得
    const calculatedInfo = await this.calculationService.updateAllCalculatedInfo(
      employees,
      loadedData.salaries,
      months,
      gradeTable,
      year
    );
    this.state.setCalculatedInfo(calculatedInfo);

    // 復職後随時改定の強調月を取得
    const rehabHighlightMonths = this.calculationService.getRehabHighlightMonths(employees, year);
    this.state.setRehabHighlightMonths(rehabHighlightMonths);

    // UIStateを返す
    return {
      employees: this.state.employees,
      salaryItems: this.state.salaryItems,
      salaryItemData: this.state.salaryItemData,
      workingDaysData: this.state.workingDaysData,
      salaries: this.state.salaries,
      year: this.state.year,
      rates: this.state.rates,
      gradeTable: this.state.gradeTable,
      results: this.state.results,
      exemptMonths: this.state.exemptMonths,
      exemptReasons: this.state.exemptReasons,
      rehabHighlightMonths: this.state.rehabHighlightMonths,
      errorMessages: this.state.errorMessages,
      warningMessages: this.state.warningMessages,
      infoByEmployee: this.state.infoByEmployee
    };
  }

  /**
   * 年度変更時の処理
   */
  async onYearChange(
    year: number,
    employees: Employee[],
    months: number[],
    currentSalaryItems: SalaryItem[],
    currentSalaryItemData: { [key: string]: { [itemId: string]: number } },
    currentWorkingDaysData: { [key: string]: number },
    currentSalaries: { [key: string]: { total: number; fixed: number; variable: number } },
    currentResults: { [employeeId: string]: TeijiKetteiResult }
  ): Promise<{
    rates: any;
    gradeTable: any[];
    salaryItems: SalaryItem[];
    salaryItemData: { [key: string]: { [itemId: string]: number } };
    workingDaysData: { [key: string]: number };
    salaries: { [key: string]: { total: number; fixed: number; variable: number } };
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
    // 状態を初期化
    this.state.initializeState(year, months, employees);

    // 料率と等級表を取得
    const { rates, gradeTable } = await this.dataService.loadRatesAndGradeTable(year, employees);
    this.state.setRatesAndGradeTable(rates, gradeTable);
    
    // 給与項目マスタを読み込む
    const salaryItems = await this.dataService.loadSalaryItems(year);
    this.state.setSalaryItems(salaryItems);
    
    // 既存の給与データを読み込む
    const loadedData = await this.dataService.loadExistingSalaries(
      employees,
      months,
      year,
      currentSalaryItemData,
      currentWorkingDaysData,
      currentSalaries,
      salaryItems
    );
    this.state.setSalaryData(loadedData);

    // 全従業員の定時決定を計算
    const results: { [employeeId: string]: TeijiKetteiResult } = {};
    for (const emp of employees) {
      results[emp.id] = this.calculationService.calculateTeijiKettei(
        emp.id,
        loadedData.salaries,
        gradeTable,
        year
      );
    }
    this.state.setResults(results);

    // 全従業員の計算結果情報を取得
    const calculatedInfo = await this.calculationService.updateAllCalculatedInfo(
      employees,
      loadedData.salaries,
      months,
      gradeTable,
      year
    );
    this.state.setCalculatedInfo(calculatedInfo);

    // エラー・警告メッセージを初期化
    this.state.errorMessages = {};
    this.state.warningMessages = {};
    for (const emp of employees) {
      this.state.errorMessages[emp.id] = [];
      this.state.warningMessages[emp.id] = [];
    }

    // エラー・警告メッセージをマージ
    for (const empId in calculatedInfo.errorMessages) {
      this.state.errorMessages[empId] = calculatedInfo.errorMessages[empId];
    }
    for (const empId in calculatedInfo.warningMessages) {
      this.state.warningMessages[empId] = calculatedInfo.warningMessages[empId];
    }

    // 給与項目マスタが空の場合の警告を追加
    if (salaryItems.length === 0) {
      this.state.addSystemWarning('先に給与項目マスタを設定してください');
    }
    // 標準報酬等級表が空の場合の警告を追加
    if (gradeTable.length === 0) {
      this.state.addSystemWarning('標準報酬等級表が設定されていません。設定画面で標準報酬等級表を設定してください。');
    }

    return {
      rates: this.state.rates,
      gradeTable: this.state.gradeTable,
      salaryItems: this.state.salaryItems,
      salaryItemData: this.state.salaryItemData,
      workingDaysData: this.state.workingDaysData,
      salaries: this.state.salaries,
      results: this.state.results,
      infoByEmployee: this.state.infoByEmployee,
      exemptMonths: this.state.exemptMonths,
      exemptReasons: this.state.exemptReasons,
      errorMessages: this.state.errorMessages,
      warningMessages: this.state.warningMessages
    };
  }
}






