import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaymentSummaryStateService } from '../../services/payment-summary-state.service';
import { PaymentSummaryDataService } from '../../services/payment-summary-data.service';
import { PaymentSummaryCalculationService } from '../../services/payment-summary-calculation.service';
import { PaymentSummaryFormatService } from '../../services/payment-summary-format.service';
import { NotificationFormatService } from '../../services/notification-format.service';
import { PaymentSummaryCsvService } from '../../services/payment-summary-csv.service';
import { PaymentSummaryAggregationUiService } from '../../services/payment-summary-aggregation-ui.service';
import { AnnualWarningPanelComponent } from './components/annual-warning-panel/annual-warning-panel.component';
import { AnnualBonusSummaryComponent } from './components/annual-bonus-summary/annual-bonus-summary.component';
import { CompanyMonthlyTotalTableComponent } from './components/company-monthly-total-table/company-monthly-total-table.component';
import { MonthlyPremiumTableComponent } from './components/monthly-premium-table/monthly-premium-table.component';
import { EmployeeNotificationPanelComponent } from './components/employee-notification-panel/employee-notification-panel.component';
import { PaymentSummaryHeaderComponent } from './components/payment-summary-header/payment-summary-header.component';
import { PaymentSummaryYearSelectorComponent } from './components/payment-summary-year-selector/payment-summary-year-selector.component';
import { PaymentSummaryEmployeeSelectorComponent } from './components/payment-summary-employee-selector/payment-summary-employee-selector.component';
import { ErrorPanelComponent } from './components/error-panel/error-panel.component';
import { LoadingIndicatorComponent } from './components/loading-indicator/loading-indicator.component';
import { ScrollToTopComponent } from './components/scroll-to-top/scroll-to-top.component';
import { ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';

/**
 * PaymentSummaryPageComponent
 * 
 * 保険料サマリー画面のコンポーネント
 * UI制御のみを担当し、状態管理とデータロードはサービスに委譲
 */
@Component({
  selector: 'app-payment-summary-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AnnualWarningPanelComponent,
    AnnualBonusSummaryComponent,
    CompanyMonthlyTotalTableComponent,
    MonthlyPremiumTableComponent,
    EmployeeNotificationPanelComponent,
    PaymentSummaryHeaderComponent,
    PaymentSummaryYearSelectorComponent,
    ErrorPanelComponent,
    LoadingIndicatorComponent,
    ScrollToTopComponent,
  ],
  templateUrl: './payment-summary-page.component.html',
  styleUrl: './payment-summary-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentSummaryPageComponent implements OnInit {
  // 状態管理サービスへの参照（テンプレートで使用）
  get state() {
    return this.stateService;
  }

  constructor(
    private stateService: PaymentSummaryStateService,
    private dataService: PaymentSummaryDataService,
    private paymentSummaryCalculationService: PaymentSummaryCalculationService,
    private paymentSummaryFormatService: PaymentSummaryFormatService,
    private notificationFormatService: NotificationFormatService,
    private csvService: PaymentSummaryCsvService,
    private aggregationService: PaymentSummaryAggregationUiService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.dataService.loadInitialData();
    this.cdr.markForCheck();
  }

  async onYearChange(): Promise<void> {
    await this.dataService.onYearChange();
    this.cdr.markForCheck();
  }

  onMonthChange(): void {
    // 月変更時は再読み込み不要（フィルタリングのみ）
    this.stateService.setSelectedMonth(this.stateService.selectedMonth);
    this.cdr.markForCheck();
  }

  /**
   * 指定月の賞与情報をツールチップ用の文字列として返す
   */
  getBonusTooltip(month: number): string {
    return this.paymentSummaryFormatService.getBonusTooltip(
      month,
      this.stateService.bonusByMonth,
      this.stateService.employees
    );
  }

  hasNotesForEmployee(employeeId: string): boolean {
    return this.paymentSummaryCalculationService.hasNotesForEmployee(
      employeeId,
      this.stateService.monthlyPremiumsByEmployee
    );
  }

  /**
   * 届出種類の表示名を取得
   */
  getNotificationTypeLabel(type: 'teiji' | 'suiji' | 'bonus'): string {
    return this.notificationFormatService.getNotificationTypeLabel(type);
  }

  /**
   * CSV出力メソッド
   */
  exportCsv(): void {
    this.csvService.exportCsv();
  }

  /**
   * 印刷メソッド
   */
  print(): void {
    window.print();
  }

  /**
   * 指定月の月次報酬分の集計を取得
   */
  getMonthlyTotals(year: number, month: number | 'all' | string): {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    totalEmployee: number;
    totalEmployer: number;
    total: number;
  } {
    return this.aggregationService.getMonthlyTotals(year, month);
  }

  /**
   * 指定月の賞与保険料の集計を取得
   */
  getBonusTotals(year: number, month: number | 'all' | string): {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    totalEmployee: number;
    totalEmployer: number;
    total: number;
  } {
    return this.aggregationService.getBonusTotals(year, month);
  }

  /**
   * 最終総計を取得
   */
  getFinalTotals(): {
    companyTotal: number;
    employeeTotal: number;
    grandTotal: number;
  } {
    return this.aggregationService.getFinalTotals();
  }

  /**
   * 全従業員を返す（フィルターなし）
   */
  getFilteredEmployees() {
    return this.stateService.getFilteredEmployees();
  }
}
