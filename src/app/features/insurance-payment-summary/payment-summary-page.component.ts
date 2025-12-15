import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaymentSummaryStateService } from '../../services/payment-summary-state.service';
import { PaymentSummaryDataService } from '../../services/payment-summary-data.service';
import { PaymentSummaryOrchestratorService } from '../../services/payment-summary-orchestrator.service';
import { PaymentSummaryFormatService } from '../../services/payment-summary-format.service';
import { NotificationFormatService } from '../../services/notification-format.service';
import { PaymentSummaryAggregationUiService } from '../../services/payment-summary-aggregation-ui.service';
import { RoomIdService } from '../../services/room-id.service';
import { CompanyMonthlyTotalTableComponent } from './components/company-monthly-total-table/company-monthly-total-table.component';
import { PaymentSummaryHeaderComponent } from './components/payment-summary-header/payment-summary-header.component';
import { ErrorPanelComponent } from './components/error-panel/error-panel.component';
import { LoadingIndicatorComponent } from './components/loading-indicator/loading-indicator.component';
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
    CompanyMonthlyTotalTableComponent,
    PaymentSummaryHeaderComponent,
    ErrorPanelComponent,
    LoadingIndicatorComponent,
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

  activeTab: 'summary' | 'notice' = 'summary';
  noticeMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  noticeAmounts: { [month: number]: number } = {};
  noticeAmountInputs: { [month: number]: string } = {};
  private readonly numberFormatter = new Intl.NumberFormat('ja-JP');
  isSavingNotice = false;

  constructor(
    private stateService: PaymentSummaryStateService,
    private dataService: PaymentSummaryDataService,
    private paymentSummaryOrchestratorService: PaymentSummaryOrchestratorService,
    private paymentSummaryFormatService: PaymentSummaryFormatService,
    private notificationFormatService: NotificationFormatService,
    private aggregationService: PaymentSummaryAggregationUiService,
    private cdr: ChangeDetectorRef,
    private roomIdService: RoomIdService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.dataService.loadInitialData();
    this.loadNoticeAmounts(this.state.year);
    this.cdr.markForCheck();
  }

  async onYearChange(): Promise<void> {
    await this.dataService.onYearChange();
    this.loadNoticeAmounts(this.state.year);
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
    return this.paymentSummaryOrchestratorService.hasNotesForEmployee(
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
   * 年間振込額一覧（テーブル表示と同じ内容）をCSV出力する
   */
  exportAnnualTableCsv(): void {
    const headers = [
      '月',
      '従業員負担分',
      '会社負担分',
      '振込合計（納入告知額）',
    ];
    const rows: string[] = [headers.join(',')];

    for (let month = 1; month <= 12; month++) {
      const monthlyTotals = this.getMonthlyTotals(this.state.year, month);
      const bonusTotals = this.getBonusTotals(this.state.year, month);

      const employee =
        (monthlyTotals.totalEmployee || 0) + (bonusTotals.totalEmployee || 0);
      const notice = this.getNoticeAmountForMonth(month) || 0;
      const company = notice - employee;

      rows.push(
        [
          `${month}月`,
          employee.toString(),
          company.toString(),
          notice.toString(),
        ].join(',')
      );
    }

    const csvContent = rows.join('\n');
    this.downloadCsv(
      csvContent,
      `社会保険料振込額一覧_${this.state.year}年度.csv`
    );
  }

  private downloadCsv(content: string, filename: string): void {
    const bom = '\uFEFF';
    const blob = new Blob([bom + content], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * 印刷メソッド
   */
  print(): void {
    window.print();
  }

  setTab(tab: 'summary' | 'notice'): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  private getSelectedMonthNumber(): number | null {
    if (this.state.selectedMonth === 'all') return null;
    const num = Number(this.state.selectedMonth);
    return isNaN(num) ? null : num;
  }

  getNoticeAmountForSelectedMonth(): number {
    const month = this.getSelectedMonthNumber();
    if (!month) return 0;
    return this.noticeAmounts[month] ?? 0;
  }

  getNoticeAmountForMonth(month: number): number {
    return this.noticeAmounts[month] ?? 0;
  }

  onNoticeAmountInput(month: number, rawValue: string): void {
    const numeric = rawValue.replace(/,/g, '');
    const parsed = Number(numeric);
    if (isNaN(parsed) || parsed < 0) {
      this.noticeAmounts[month] = 0;
      this.noticeAmountInputs[month] = '';
      return;
    }
    this.noticeAmounts[month] = parsed;
    this.noticeAmountInputs[month] = this.numberFormatter.format(parsed);
  }

  private initializeNoticeAmountInputs(): void {
    this.noticeAmountInputs = {};
    this.noticeMonths.forEach((month) => {
      const amount = this.noticeAmounts[month] ?? 0;
      this.noticeAmountInputs[month] =
        amount === 0 ? '' : this.numberFormatter.format(amount);
    });
  }

  private getNoticeStorageKey(year: number | string): string {
    const roomId = this.getRoomIdSafe();
    return roomId ? `noticeAmounts_${roomId}_${year}` : `noticeAmounts_${year}`;
  }

  loadNoticeAmounts(year: number | string): void {
    const key = this.getNoticeStorageKey(year);
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        this.noticeAmounts = JSON.parse(stored);
      } else {
        this.noticeAmounts = {};
        this.noticeMonths.forEach((m) => (this.noticeAmounts[m] = 0));
      }
    } catch {
      this.noticeAmounts = {};
      this.noticeMonths.forEach((m) => (this.noticeAmounts[m] = 0));
    }
    this.initializeNoticeAmountInputs();
  }

  async saveNoticeAmounts(): Promise<void> {
    if (this.isSavingNotice) {
      return;
    }
    this.isSavingNotice = true;
    this.cdr.markForCheck();

    try {
      const key = this.getNoticeStorageKey(this.state.year);
      localStorage.setItem(key, JSON.stringify(this.noticeAmounts));
      // UI上の保存中インジケータが視認できるよう、ごく短い遅延を挿入
      await new Promise((resolve) => setTimeout(resolve, 150));
      alert('保存しました');
    } finally {
      this.isSavingNotice = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * 指定月の月次報酬分の集計を取得
   */
  getMonthlyTotals(
    year: number,
    month: number | 'all' | string
  ): {
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
  getBonusTotals(
    year: number,
    month: number | 'all' | string
  ): {
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

  private getRoomIdSafe(): string | null {
    try {
      return this.roomIdService.requireRoomId();
    } catch {
      return null;
    }
  }
}
