import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaymentSummaryStateService } from '../../services/payment-summary-state.service';
import { PaymentSummaryDataService } from '../../services/payment-summary-data.service';
import { PaymentSummaryCalculationService } from '../../services/payment-summary-calculation.service';
import { PaymentSummaryFormatService } from '../../services/payment-summary-format.service';
import { NotificationFormatService } from '../../services/notification-format.service';
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
    const csvContent = this.buildCsv();
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM付きUTF-8
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `社会保険料振込額_${this.stateService.year}年度.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * CSV構築メソッド
   */
  buildCsv(): string {
    const headers = [
      'month',
      'healthEmployee',
      'healthEmployer',
      'careEmployee',
      'careEmployer',
      'pensionEmployee',
      'pensionEmployer',
      'total'
    ];
    const rows: string[] = [headers.join(',')];

    // 会社全体の月次合計を計算（本人負担・会社負担を分けて）
    const monthlyTotalsByMonth: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
        total: number;
      };
    } = {};

    // 1〜12月を初期化
    for (let month = 1; month <= 12; month++) {
      monthlyTotalsByMonth[month] = {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        total: 0,
      };
    }

    // 全従業員の月次保険料を集計
    for (const emp of this.stateService.employees) {
      const employeeRows = this.stateService.monthlyPremiumsByEmployee[emp.id];
      if (!employeeRows || employeeRows.length === 0) {
        continue;
      }

      for (const row of employeeRows) {
        const month = row.month;
        if (month >= 1 && month <= 12) {
          monthlyTotalsByMonth[month].healthEmployee += row.healthEmployee || 0;
          monthlyTotalsByMonth[month].healthEmployer += row.healthEmployer || 0;
          monthlyTotalsByMonth[month].careEmployee += row.careEmployee || 0;
          monthlyTotalsByMonth[month].careEmployer += row.careEmployer || 0;
          monthlyTotalsByMonth[month].pensionEmployee += row.pensionEmployee || 0;
          monthlyTotalsByMonth[month].pensionEmployer += row.pensionEmployer || 0;
        }
      }
    }

    // 賞与保険料を月次合計に加算（全従業員）
    for (const bonus of this.stateService.currentYearBonuses) {
      const bonusMonth = bonus.month;
      if (bonusMonth >= 1 && bonusMonth <= 12) {
        monthlyTotalsByMonth[bonusMonth].healthEmployee += bonus.healthEmployee || 0;
        monthlyTotalsByMonth[bonusMonth].healthEmployer += bonus.healthEmployer || 0;
        monthlyTotalsByMonth[bonusMonth].careEmployee += bonus.careEmployee || 0;
        monthlyTotalsByMonth[bonusMonth].careEmployer += bonus.careEmployer || 0;
        monthlyTotalsByMonth[bonusMonth].pensionEmployee += bonus.pensionEmployee || 0;
        monthlyTotalsByMonth[bonusMonth].pensionEmployer += bonus.pensionEmployer || 0;
      }
    }

    // CSV行を生成
    for (let month = 1; month <= 12; month++) {
      const monthData = monthlyTotalsByMonth[month];
      const total =
        monthData.healthEmployee +
        monthData.healthEmployer +
        monthData.careEmployee +
        monthData.careEmployer +
        monthData.pensionEmployee +
        monthData.pensionEmployer;

      const row = [
        month.toString(),
        monthData.healthEmployee.toString(),
        monthData.healthEmployer.toString(),
        monthData.careEmployee.toString(),
        monthData.careEmployer.toString(),
        monthData.pensionEmployee.toString(),
        monthData.pensionEmployer.toString(),
        total.toString(),
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
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
    let healthEmployee = 0;
    let healthEmployer = 0;
    let careEmployee = 0;
    let careEmployer = 0;
    let pensionEmployee = 0;
    let pensionEmployer = 0;

    if (month === 'all') {
      // 全月の場合は年間合計を使用（全従業員）
      for (const emp of this.stateService.employees) {
        const rows = this.stateService.monthlyPremiumsByEmployee[emp.id] || [];
        for (const row of rows) {
          healthEmployee += row.healthEmployee || 0;
          healthEmployer += row.healthEmployer || 0;
          careEmployee += row.careEmployee || 0;
          careEmployer += row.careEmployer || 0;
          pensionEmployee += row.pensionEmployee || 0;
          pensionEmployer += row.pensionEmployer || 0;
        }
      }
    } else {
      // 特定月の集計（全従業員）
      const monthNum = typeof month === 'string' ? Number(month) : (month as number);
      for (const emp of this.stateService.employees) {
        const rows = this.stateService.monthlyPremiumsByEmployee[emp.id] || [];
        const monthRow = rows.find(r => r.month === monthNum);
        if (monthRow) {
          healthEmployee += monthRow.healthEmployee || 0;
          healthEmployer += monthRow.healthEmployer || 0;
          careEmployee += monthRow.careEmployee || 0;
          careEmployer += monthRow.careEmployer || 0;
          pensionEmployee += monthRow.pensionEmployee || 0;
          pensionEmployer += monthRow.pensionEmployer || 0;
        }
      }
    }

    const totalEmployee = healthEmployee + careEmployee + pensionEmployee;
    const totalEmployer = healthEmployer + careEmployer + pensionEmployer;
    const total = totalEmployee + totalEmployer;

    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      totalEmployee,
      totalEmployer,
      total,
    };
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
    let healthEmployee = 0;
    let healthEmployer = 0;
    let careEmployee = 0;
    let careEmployer = 0;
    let pensionEmployee = 0;
    let pensionEmployer = 0;

    if (month === 'all') {
      // 全月の場合は年間の賞与合計を使用（全従業員）
      for (const bonus of this.stateService.currentYearBonuses) {
        if (!bonus.isExempted && !bonus.isSalaryInsteadOfBonus) {
          healthEmployee += bonus.healthEmployee || 0;
          healthEmployer += bonus.healthEmployer || 0;
          careEmployee += bonus.careEmployee || 0;
          careEmployer += bonus.careEmployer || 0;
          pensionEmployee += bonus.pensionEmployee || 0;
          pensionEmployer += bonus.pensionEmployer || 0;
        }
      }
    } else {
      // 特定月の賞与を集計（全従業員）
      const monthNum = typeof month === 'string' ? Number(month) : (month as number);
      
      // bonusByMonthから該当月の賞与を取得（既に月ごとにグループ化済み）
      const monthBonuses = this.stateService.bonusByMonth[monthNum] || [];
      
      for (const bonus of monthBonuses) {
        if (bonus.isExempted || bonus.isSalaryInsteadOfBonus) {
          continue;
        }
        
        healthEmployee += bonus.healthEmployee || 0;
        healthEmployer += bonus.healthEmployer || 0;
        careEmployee += bonus.careEmployee || 0;
        careEmployer += bonus.careEmployer || 0;
        pensionEmployee += bonus.pensionEmployee || 0;
        pensionEmployer += bonus.pensionEmployer || 0;
      }
      
      // bonusByMonthにデータがない場合、currentYearBonusesから直接フィルタリング（フォールバック）
      if (monthBonuses.length === 0) {
        for (const bonus of this.stateService.currentYearBonuses) {
          if (bonus.isExempted || bonus.isSalaryInsteadOfBonus) continue;
          
          // 支給日から月を抽出（bonus.monthも確認）
          let bonusMonth: number | null = null;
          let bonusYear: number | null = null;
          
          // bonus.monthフィールドを優先的に使用
          if (bonus.month) {
            bonusMonth = bonus.month;
            bonusYear = bonus.year || year;
          } else if (bonus.payDate) {
            // payDateから抽出
            const payDateObj = new Date(bonus.payDate);
            bonusYear = payDateObj.getFullYear();
            bonusMonth = payDateObj.getMonth() + 1;
          } else {
            continue;
          }
          
          if (bonusMonth && bonusYear === year && bonusMonth === monthNum) {
            healthEmployee += bonus.healthEmployee || 0;
            healthEmployer += bonus.healthEmployer || 0;
            careEmployee += bonus.careEmployee || 0;
            careEmployer += bonus.careEmployer || 0;
            pensionEmployee += bonus.pensionEmployee || 0;
            pensionEmployer += bonus.pensionEmployer || 0;
          }
        }
      }
    }

    const totalEmployee = healthEmployee + careEmployee + pensionEmployee;
    const totalEmployer = healthEmployer + careEmployer + pensionEmployer;
    const total = totalEmployee + totalEmployer;

    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      totalEmployee,
      totalEmployer,
      total,
    };
  }

  /**
   * 最終総計を取得
   */
  getFinalTotals(): {
    companyTotal: number;
    employeeTotal: number;
    grandTotal: number;
  } {
    const monthlyTotals = this.getMonthlyTotals(this.stateService.year, this.stateService.selectedMonth);
    const bonusTotals = this.getBonusTotals(this.stateService.year, this.stateService.selectedMonth);

    const companyTotal = monthlyTotals.totalEmployer + bonusTotals.totalEmployer;
    const employeeTotal = monthlyTotals.totalEmployee + bonusTotals.totalEmployee;
    const grandTotal = companyTotal + employeeTotal;

    return {
      companyTotal,
      employeeTotal,
      grandTotal,
    };
  }

  /**
   * 全従業員を返す（フィルターなし）
   */
  getFilteredEmployees() {
    return this.stateService.getFilteredEmployees();
  }
}
