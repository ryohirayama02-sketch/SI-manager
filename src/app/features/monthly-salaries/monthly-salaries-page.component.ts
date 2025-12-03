import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
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
import { MonthlySalaryEditUiService } from '../../services/monthly-salary-edit-ui.service';
import { MonthlySalarySuijiUiService } from '../../services/monthly-salary-suiji-ui.service';
import { MonthlySalaryCsvImportUiService } from '../../services/monthly-salary-csv-import-ui.service';
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
  // ルーターイベント購読用
  routerSubscription: Subscription | null = null;

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
    private editUiService: MonthlySalaryEditUiService,
    private suijiUiService: MonthlySalarySuijiUiService,
    private csvImportUiService: MonthlySalaryCsvImportUiService,
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

    // ルーターイベントを購読（画面遷移後に再読み込み）
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(async (event: any) => {
        // 月次給与画面に戻ってきた場合、データを再読み込み
        if (
          event.url === '/monthly-salaries' ||
          event.urlAfterRedirects === '/monthly-salaries'
        ) {
          await this.reloadData();
        }
      });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
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
    const result = await this.editUiService.handleSalaryItemChange(
      event,
      this.salaryItemData,
      this.salaries,
      this.salaryItems,
      this.employees,
      this.months,
      this.gradeTable,
      this.year,
      this.results,
      this.errorMessages,
      this.warningMessages
    );

    // 結果をstateに反映
    this.salaryItemData = result.salaryItemData;
    this.salaries = result.salaries;
    this.results = result.results;
    this.errorMessages = result.errorMessages;
    this.warningMessages = result.warningMessages;
    if (
      result.infoByEmployee &&
      Object.keys(result.infoByEmployee).length > 0
    ) {
      this.infoByEmployee = {
        ...this.infoByEmployee,
        ...result.infoByEmployee,
      };
    }

    // 随時改定の更新
    this.updateRehabSuiji(event.employeeId);
  }

  /**
   * CSVインポート時のバッチ更新処理
   * すべてのイベントを一度に処理して、最後に一度だけ再計算を行う
   */
  async onSalaryItemBatchChange(
    events: Array<{
      employeeId: string;
      month: number;
      itemId: string;
      value: string | number;
    }>
  ): Promise<void> {
    console.log(`[MonthlySalariesPage] バッチ更新開始: ${events.length}件`);

    if (events.length === 0) {
      return;
    }

    // すべてのイベントを一度に処理
    let currentSalaryItemData = { ...this.salaryItemData };
    let currentSalaries = { ...this.salaries };
    const affectedEmployeeIds = new Set<string>();

    // 給与項目データを更新（salaryItemDataのキーはgetSalaryItemKeyを使用）
    for (const event of events) {
      const { employeeId, month, itemId, value } = event;
      affectedEmployeeIds.add(employeeId);

      // 給与項目データを更新（キー形式: employeeId_month）
      const itemKey = `${employeeId}_${month}`;
      if (!currentSalaryItemData[itemKey]) {
        currentSalaryItemData[itemKey] = {};
      }
      currentSalaryItemData[itemKey] = { ...currentSalaryItemData[itemKey] };
      // valueを数値に変換
      const numValue =
        typeof value === 'string'
          ? parseFloat(value.replace(/,/g, '')) || 0
          : value || 0;
      currentSalaryItemData[itemKey][itemId] = numValue;
    }

    // 給与合計を再計算（salariesのキーはgetSalaryKeyを使用）
    for (const employeeId of affectedEmployeeIds) {
      for (const month of this.months) {
        const salaryKey = this.salaryCalculationService.getSalaryKey(
          employeeId,
          month
        );
        const itemKey = `${employeeId}_${month}`;
        const itemData = currentSalaryItemData[itemKey];
        if (itemData) {
          const itemEntries = Object.keys(itemData).map((itemId) => ({
            itemId,
            amount: itemData[itemId] || 0,
          }));
          const totals = this.salaryCalculationService.calculateSalaryTotals(
            itemEntries,
            this.salaryItems
          );
          currentSalaries[salaryKey] = {
            total: totals.total,
            fixed: totals.fixedTotal,
            variable: totals.variableTotal,
          };
        }
      }
    }

    // stateを更新
    this.salaryItemData = currentSalaryItemData;
    this.salaries = currentSalaries;

    // 影響を受けた従業員の計算結果を更新
    const affectedEmployees = this.employees.filter((emp) =>
      affectedEmployeeIds.has(emp.id)
    );
    if (affectedEmployees.length > 0) {
      const { infoByEmployee, errorMessages, warningMessages } =
        await this.monthlySalaryUIService.updateAllCalculatedInfo(
          affectedEmployees,
          currentSalaries,
          this.months,
          this.gradeTable,
          this.year
        );

      this.infoByEmployee = { ...this.infoByEmployee, ...infoByEmployee };
      this.errorMessages = { ...this.errorMessages, ...errorMessages };
      this.warningMessages = { ...this.warningMessages, ...warningMessages };

      // 随時改定の更新
      for (const employeeId of affectedEmployeeIds) {
        this.updateRehabSuiji(employeeId);
      }
    }

    console.log(`[MonthlySalariesPage] バッチ更新完了`);
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

    // 保存後に画面の状態を再読み込み（データベースから最新データを取得）
    await this.reloadData();

    // 随時改定候補が存在する場合、ダイアログを表示
    if (this.suijiAlerts.length > 0) {
      this.showSuijiDialog = true;
    }
  }

  /**
   * 画面の状態を再読み込み
   */
  async reloadData(): Promise<void> {
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
  }

  closeSuijiDialog(): void {
    this.showSuijiDialog = false;
  }

  navigateToSuijiAlert(): void {
    this.router.navigate(['/monthly-change-alert']);
  }

  updateRehabSuiji(employeeId: string): void {
    this.rehabSuijiCandidates = this.suijiUiService.updateRehabSuiji(
      employeeId,
      this.salaries,
      this.gradeTable,
      this.employees,
      this.year,
      this.results,
      this.rehabSuijiCandidates
    );
  }

  getRehabHighlightMonths(): { [employeeId: string]: number[] } {
    return this.suijiUiService.getRehabHighlightMonths(
      this.employees,
      this.year
    );
  }

  // CSVインポート処理
  async onCsvTextImport(csvText: string): Promise<void> {
    this.csvImportUiService.setCsvImportText(csvText);
  }

  onCsvImportClose(): void {
    this.csvImportUiService.closeCsvImport();
  }

  onCsvImportResult(result: {
    type: 'success' | 'error';
    message: string;
  }): void {
    this.csvImportUiService.setCsvImportResult(result);
  }

  // CSVインポート状態のゲッター
  get csvImportText(): string {
    return this.csvImportUiService.csvImportText;
  }

  get csvImportResult(): { type: 'success' | 'error'; message: string } | null {
    return this.csvImportUiService.csvImportResult;
  }
}
