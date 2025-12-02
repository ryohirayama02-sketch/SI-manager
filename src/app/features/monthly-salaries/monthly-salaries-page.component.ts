import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../services/employee.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
import {
  SalaryCalculationService,
  TeijiKetteiResult,
  SuijiCandidate,
  RehabSuijiCandidate,
  ExcludedSuijiReason,
  SuijiKouhoResult,
} from '../../services/salary-calculation.service';
import { SuijiService } from '../../services/suiji.service';
import { ValidationService } from '../../services/validation.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { Employee } from '../../models/employee.model';
import { SalaryItem } from '../../models/salary-item.model';
import {
  SalaryItemEntry,
  MonthlySalaryData,
} from '../../models/monthly-salary.model';
import { SalaryTableComponent } from './components/salary-table/salary-table.component';
import { ErrorWarningSectionComponent } from './components/error-warning-section/error-warning-section.component';
import { SalaryCsvImportComponent } from './components/salary-csv-import/salary-csv-import.component';
import { SalaryEditHandlerService } from '../../services/salary-edit-handler.service';
import { MonthlySalaryUIService } from '../../services/monthly-salary-ui.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-monthly-salaries-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SalaryTableComponent,
    ErrorWarningSectionComponent,
    SalaryCsvImportComponent,
  ],
  templateUrl: './monthly-salaries-page.component.html',
  styleUrl: './monthly-salaries-page.component.css',
})
export class MonthlySalariesPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  salaryItems: SalaryItem[] = [];
  // 項目別入力データ: { employeeId_month: { itemId: amount } }
  salaryItemData: { [key: string]: { [itemId: string]: number } } = {};
  // 支払基礎日数データ: { employeeId_month: days }
  workingDaysData: { [key: string]: number } = {};
  // 後方互換性のため残す
  salaries: {
    [key: string]: { total: number; fixed: number; variable: number };
  } = {};
  year: number = new Date().getFullYear();
  availableYears: number[] = [];
  rates: any = null;
  gradeTable: any[] = [];
  results: { [employeeId: string]: TeijiKetteiResult } = {};
  suijiCandidates: SuijiCandidate[] = [];
  excludedSuijiReasons: ExcludedSuijiReason[] = [];
  rehabSuijiCandidates: SuijiKouhoResult[] = [];

  // エラー・警告メッセージ（従業員IDをキーとする）
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};

  // 随時改定アラート
  suijiAlerts: SuijiKouhoResult[] = [];
  showSuijiDialog: boolean = false;

  // 計算結果情報（従業員IDをキーとする）
  infoByEmployee: {
    [employeeId: string]: {
      avg: number | null;
      standard: number | null;
      rank: number | null;
      premiums: any;
    };
  } = {};

  // 免除月情報（従業員IDをキーとする）
  exemptMonths: { [employeeId: string]: number[] } = {};
  // 免除理由情報（従業員ID_月をキーとする）
  exemptReasons: { [key: string]: string } = {};
  // 加入区分購読用
  eligibilitySubscription: Subscription | null = null;

  // CSVインポート関連
  csvImportText: string = '';
  csvImportResult: { type: 'success' | 'error'; message: string } | null = null;

  constructor(
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private salaryCalculationService: SalaryCalculationService,
    private suijiService: SuijiService,
    private validationService: ValidationService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private salaryEditHandlerService: SalaryEditHandlerService,
    private monthlySalaryUIService: MonthlySalaryUIService,
    private router: Router
  ) {
    // 年度選択用の年度リストを生成（2023〜2026）
    for (let y = 2023; y <= 2026; y++) {
      this.availableYears.push(y);
    }
  }

  async ngOnInit(): Promise<void> {
    // サービスに全データロードを委譲
    const state = await this.monthlySalaryUIService.loadAllData(
      this.year,
      this.months
    );

    // 結果をstateに反映
    this.employees = state.employees;
    this.salaryItems = state.salaryItems;
    this.salaryItemData = state.salaryItemData;
    this.workingDaysData = state.workingDaysData;
    this.salaries = state.salaries;
    this.rates = state.rates;
    this.gradeTable = state.gradeTable;
    this.results = state.results;
    this.exemptMonths = state.exemptMonths;
    this.exemptReasons = state.exemptReasons;
    this.errorMessages = state.errorMessages;
    this.warningMessages = state.warningMessages;
    this.infoByEmployee = state.infoByEmployee;

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService
      .observeEligibility()
      .subscribe(() => {
        this.reloadEligibility();
      });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  async reloadEligibility(): Promise<void> {
    // 加入区分が変更された場合、計算結果を再計算
    const {
      infoByEmployee,
      exemptMonths,
      exemptReasons,
      errorMessages,
      warningMessages,
    } = await this.monthlySalaryUIService.updateAllCalculatedInfo(
      this.employees,
      this.salaries,
      this.months,
      this.gradeTable,
      this.year
    );
    this.infoByEmployee = infoByEmployee;
    this.exemptMonths = exemptMonths;
    this.exemptReasons = exemptReasons;
    // エラー・警告メッセージをマージ（システム警告は残す）
    for (const empId in errorMessages) {
      this.errorMessages[empId] = errorMessages[empId];
    }
    for (const empId in warningMessages) {
      const systemWarnings =
        this.warningMessages[empId]?.filter((w) =>
          w.includes('標準報酬等級表が設定されていません')
        ) || [];
      this.warningMessages[empId] = [
        ...systemWarnings,
        ...warningMessages[empId],
      ];
    }
  }

  async onYearChange(): Promise<void> {
    // サービスに年度変更処理を委譲
    const result = await this.monthlySalaryUIService.onYearChange(
      this.year,
      this.employees,
      this.months,
      this.salaryItems,
      this.salaryItemData,
      this.workingDaysData,
      this.salaries,
      this.results
    );

    // 結果をstateに反映
    this.rates = result.rates;
    this.gradeTable = result.gradeTable;
    this.salaryItems = result.salaryItems;
    this.salaryItemData = result.salaryItemData;
    this.workingDaysData = result.workingDaysData;
    this.salaries = result.salaries;
    this.results = result.results;
    this.infoByEmployee = result.infoByEmployee;
    this.exemptMonths = result.exemptMonths;
    this.exemptReasons = result.exemptReasons;
    this.errorMessages = result.errorMessages;
    this.warningMessages = result.warningMessages;
  }

  getSalaryKey(employeeId: string, month: number): string {
    return this.monthlySalaryUIService.getSalaryKey(employeeId, month);
  }

  getSalaryItemKey(employeeId: string, month: number): string {
    return this.monthlySalaryUIService.getSalaryItemKey(employeeId, month);
  }

  getWorkingDaysKey(employeeId: string, month: number): string {
    return this.monthlySalaryUIService.getWorkingDaysKey(employeeId, month);
  }

  async onSalaryItemChange(event: {
    employeeId: string;
    month: number;
    itemId: string;
    value: string | number;
  }): Promise<void> {
    // サービスに処理を委譲
    const result = this.salaryEditHandlerService.handleSalaryItemChange(
      event,
      this.salaryItemData,
      this.salaries,
      this.salaryItems,
      this.employees,
      this.months,
      this.gradeTable,
      this.year,
      this.results,
      (avg: number | null) =>
        this.monthlySalaryUIService.getStandardMonthlyRemuneration(
          avg,
          this.gradeTable
        )
    );

    // 結果をstateに反映
    this.salaryItemData = result.salaryItemData;
    this.salaries = result.salaries;
    this.results = result.results;

    // バリデーション結果を反映
    if (result.validationErrors[event.employeeId]) {
      this.errorMessages[event.employeeId] =
        result.validationErrors[event.employeeId];
    }
    if (result.validationWarnings[event.employeeId]) {
      // システム警告は残す
      const systemWarnings =
        this.warningMessages[event.employeeId]?.filter((w) =>
          w.includes('標準報酬等級表が設定されていません')
        ) || [];
      this.warningMessages[event.employeeId] = [
        ...systemWarnings,
        ...result.validationWarnings[event.employeeId],
      ];
    }

    // 再計算が必要な場合
    if (result.needsRecalculation && result.recalculateEmployeeId) {
      const emp = this.employees.find(
        (e) => e.id === result.recalculateEmployeeId
      );
      if (emp) {
        const {
          infoByEmployee: updatedInfo,
          errorMessages: updatedErrors,
          warningMessages: updatedWarnings,
        } = await this.monthlySalaryUIService.updateAllCalculatedInfo(
          [emp],
          this.salaries,
          this.months,
          this.gradeTable,
          this.year
        );
        this.infoByEmployee[emp.id] = updatedInfo[emp.id];
        if (updatedErrors[emp.id]) {
          this.errorMessages[emp.id] = updatedErrors[emp.id];
        }
        if (updatedWarnings[emp.id]) {
          const systemWarnings =
            this.warningMessages[emp.id]?.filter((w) =>
              w.includes('標準報酬等級表が設定されていません')
            ) || [];
          this.warningMessages[emp.id] = [
            ...systemWarnings,
            ...updatedWarnings[emp.id],
          ];
        }
      }
    }

    // 随時改定の更新
    this.updateRehabSuiji(result.recalculateEmployeeId || event.employeeId);
  }

  async onWorkingDaysChange(event: {
    employeeId: string;
    month: number;
    value: number;
  }): Promise<void> {
    // サービスに処理を委譲
    this.workingDaysData =
      this.salaryEditHandlerService.handleWorkingDaysChange(
        event,
        this.workingDaysData
      );
  }

  async saveAllSalaries(): Promise<void> {
    // サービスに保存処理を委譲
    const { suijiAlerts } = await this.monthlySalaryUIService.saveAllSalaries(
      this.employees,
      this.months,
      this.year,
      this.salaryItemData,
      this.workingDaysData,
      this.salaries,
      this.exemptMonths,
      this.salaryItems,
      this.gradeTable
    );

    this.suijiAlerts = suijiAlerts;
    alert('給与データを保存しました');

    // 随時改定候補が存在する場合、ダイアログを表示
    if (this.suijiAlerts.length > 0) {
      this.showSuijiDialog = true;
    }
  }

  closeSuijiDialog(): void {
    this.showSuijiDialog = false;
  }

  navigateToSuijiAlert(): void {
    this.router.navigate(['/monthly-change-alert']);
  }

  updateRehabSuiji(employeeId: string): void {
    const candidates = this.salaryCalculationService.checkRehabSuiji(
      employeeId,
      this.salaries,
      this.gradeTable,
      this.employees,
      this.year.toString(),
      this.results
    );

    this.rehabSuijiCandidates = this.rehabSuijiCandidates.filter(
      (c) => c.employeeId !== employeeId
    );

    for (const candidate of candidates) {
      const exists = this.rehabSuijiCandidates.find(
        (c) =>
          c.employeeId === candidate.employeeId &&
          c.changeMonth === candidate.changeMonth
      );
      if (!exists) {
        this.rehabSuijiCandidates.push(candidate);
      }
    }
  }

  getRehabHighlightMonths(): { [employeeId: string]: number[] } {
    return this.monthlySalaryUIService.getRehabHighlightMonths(
      this.employees,
      this.year
    );
  }

  // CSVインポート処理
  async onCsvTextImport(csvText: string): Promise<void> {
    this.csvImportText = csvText;
    // CSVインポートコンポーネントが処理するため、ここでは何もしない
  }

  onCsvImportClose(): void {
    this.csvImportText = '';
    this.csvImportResult = null;
  }

  onCsvImportResult(result: {
    type: 'success' | 'error';
    message: string;
  }): void {
    this.csvImportResult = result;
    if (result.type === 'success') {
      this.csvImportText = '';
    }
  }
}
