import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
import { NotificationDecisionResult } from '../../services/notification-decision.service';
import { AnnualWarningService } from '../../services/annual-warning.service';
import { PaymentSummaryCalculationService } from '../../services/payment-summary-calculation.service';
import { NotificationCalculationService } from '../../services/notification-calculation.service';
import { PaymentSummaryFormatService } from '../../services/payment-summary-format.service';
import { NotificationFormatService } from '../../services/notification-format.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';
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
    PaymentSummaryEmployeeSelectorComponent,
    ErrorPanelComponent,
    LoadingIndicatorComponent,
    ScrollToTopComponent,
  ],
  templateUrl: './payment-summary-page.component.html',
  styleUrl: './payment-summary-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentSummaryPageComponent implements OnInit {
  employees: Employee[] = [];
  year: number = 2025;
  selectedMonth: number | 'all' | string = new Date().getMonth() + 1;
  availableYears: number[] = [];
  selectedEmployeeIds: string[] = [];
  prefecture: string = 'tokyo';
  rates: any = null;
  gradeTable: any[] = [];

  // 月ごとの集計結果
  monthlyTotals: {
    [month: number]: {
      health: number;
      care: number;
      pension: number;
      total: number;
      isPensionStopped?: boolean;
      isHealthStopped?: boolean;
      isMaternityLeave?: boolean;
      isChildcareLeave?: boolean;
      isRetired?: boolean;
    };
  } = {};

  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};
  warnings: string[] = []; // 年間警告パネル用

  // 月次保険料一覧（従業員ごと）
  // MonthlyPremiumRow は calculateMonthlyPremiums の戻り値（MonthlyPremiums & { reasons: string[] }）をベースに変換
  monthlyPremiumsByEmployee: {
    [employeeId: string]: {
      month: number;
      healthEmployee: number; // health_employee から変換
      healthEmployer: number; // health_employer から変換
      careEmployee: number; // care_employee から変換
      careEmployer: number; // care_employer から変換
      pensionEmployee: number; // pension_employee から変換
      pensionEmployer: number; // pension_employer から変換
      exempt: boolean; // reasons から判定
      notes: string[]; // reasons から取得
      isAcquisitionMonth?: boolean; // 資格取得月フラグ
      acquisitionGrade?: number; // 資格取得時決定の等級
      acquisitionStandard?: number; // 資格取得時決定の標準報酬月額
      acquisitionReason?: string; // 資格取得時決定の理由文
      shikakuReportRequired?: boolean; // 資格取得届の提出要否
      shikakuReportDeadline?: string; // 資格取得届の提出期限
      shikakuReportReason?: string; // 資格取得届の理由
    }[];
  } = {};

  // 会社全体の月次保険料合計
  companyMonthlyTotals: {
    month: number;
    healthTotal: number;
    careTotal: number;
    pensionTotal: number;
    total: number;
  }[] = [];

  // 届出要否判定結果（従業員ごと）
  notificationsByEmployee: {
    [employeeId: string]: NotificationDecisionResult[];
  } = {};

  // 賞与保険料の年間合計
  bonusAnnualTotals: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    totalEmployee: number;
    totalEmployer: number;
    total: number;
  } = {
    healthEmployee: 0,
    healthEmployer: 0,
    careEmployee: 0,
    careEmployer: 0,
    pensionEmployee: 0,
    pensionEmployer: 0,
    totalEmployee: 0,
    totalEmployer: 0,
    total: 0,
  };

  // 月ごとの賞与データ
  bonusByMonth: { [month: number]: Bonus[] } = {};

  // 会社全体の年間保険料合計
  annualTotals: {
    health: number;
    care: number;
    pension: number;
    total: number;
  } = {
    health: 0,
    care: 0,
    pension: 0,
    total: 0,
  };

  // 現在の年度の賞与データ（キャッシュ用）
  private currentYearBonuses: Bonus[] = [];

  // 現在の年度の月次給与データ（キャッシュ用）
  private salaryDataByEmployeeId: { [employeeId: string]: any } = {};

  // 現在の年度の賞与データ（従業員ごとにグループ化）
  private bonusesByEmployeeId: { [employeeId: string]: Bonus[] } = {};

  // ローディング状態
  isLoading: boolean = false;

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private annualWarningService: AnnualWarningService,
    private paymentSummaryCalculationService: PaymentSummaryCalculationService,
    private notificationCalculationService: NotificationCalculationService,
    private paymentSummaryFormatService: PaymentSummaryFormatService,
    private notificationFormatService: NotificationFormatService,
    private cdr: ChangeDetectorRef
  ) {
    // 年度選択用のリストを初期化
    const currentYear = new Date().getFullYear();
    for (let i = currentYear - 5; i <= currentYear + 1; i++) {
      this.availableYears.push(i);
    }
  }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      const employeesData = await this.employeeService.getAllEmployees();
      this.employees = employeesData || [];
      this.selectedEmployeeIds = this.employees.map((emp) => emp.id);
      await this.loadData();
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  async onYearChange(): Promise<void> {
    this.year = Number(this.year);
    this.isLoading = true;
    this.cdr.markForCheck();
    try {
      // 年度変更時に選択状態を全従業員にリセット
      this.selectedEmployeeIds = this.employees.map((emp) => emp.id);
      // キャッシュをクリア
      this.salaryDataByEmployeeId = {};
      this.bonusesByEmployeeId = {};
      await this.loadData();
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  onMonthChange(): void {
    // 月変更時は再読み込み不要（フィルタリングのみ）
    if (this.selectedMonth !== 'all' && typeof this.selectedMonth === 'string') {
      this.selectedMonth = Number(this.selectedMonth);
    }
    this.cdr.markForCheck();
  }

  async onEmployeeSelectionChange(selectedIds: string[]): Promise<void> {
    this.isLoading = true;
    this.cdr.markForCheck();
    try {
      this.selectedEmployeeIds = selectedIds;
      // フィルタ変更時に再計算を実行（賞与データは既に読み込み済みのため再利用）
      await this.calculateMonthlyTotals(this.currentYearBonuses);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async loadData(): Promise<void> {
    this.rates = await this.settingsService.getRates(
      this.year.toString(),
      this.prefecture
    );
    this.gradeTable = await this.settingsService.getStandardTable(this.year);

    // 賞与データを読み込む（年度変更時のみ）
    // 全従業員の賞与データを取得
    this.currentYearBonuses = [];
    for (const emp of this.employees) {
      const bonuses = await this.bonusService.getBonusesForResult(emp.id, this.year);
      this.currentYearBonuses.push(...bonuses);
      console.log(`[payment-summary] 賞与データ取得: 従業員=${emp.name}, 年度=${this.year}, 賞与件数=${bonuses.length}`, bonuses);
    }
    console.log(`[payment-summary] 全賞与データ: 年度=${this.year}, 総件数=${this.currentYearBonuses.length}`, this.currentYearBonuses);

    // 月次給与データを一括読み込み（年度変更時のみ）
    this.salaryDataByEmployeeId = {};
    for (const emp of this.employees) {
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(emp.id, this.year);
      this.salaryDataByEmployeeId[emp.id] = salaryData;
      console.log(`[payment-summary] 給与データ取得: 従業員=${emp.name}, 年度=${this.year}, データ=`, salaryData);
    }

    // 賞与データを従業員ごとにグループ化
    this.bonusesByEmployeeId = {};
    for (const bonus of this.currentYearBonuses) {
      if (!this.bonusesByEmployeeId[bonus.employeeId]) {
        this.bonusesByEmployeeId[bonus.employeeId] = [];
      }
      this.bonusesByEmployeeId[bonus.employeeId].push(bonus);
    }

    if (this.employees.length > 0) {
      await this.calculateMonthlyTotals(this.currentYearBonuses);
    }
  }

  async calculateMonthlyTotals(bonuses: Bonus[] = []): Promise<void> {
    // 選択された従業員のみを取得
    const filteredEmployees = this.getFilteredEmployees();

    // サービスを使用して計算（選択された従業員のみ）
    const result =
      await this.paymentSummaryCalculationService.calculateMonthlyTotals(
        filteredEmployees,
        bonuses,
        this.year,
        this.gradeTable,
        this.rates,
        this.salaryDataByEmployeeId,
        this.prefecture
      );

    // 結果をコンポーネントのプロパティに反映
    this.monthlyPremiumsByEmployee = result.monthlyPremiumsByEmployee;
    this.monthlyTotals = result.monthlyTotals;
    this.companyMonthlyTotals = result.companyMonthlyTotals;
    this.bonusAnnualTotals = result.bonusAnnualTotals;
    this.bonusByMonth = result.bonusByMonth;
    this.errorMessages = result.errorMessages;

    // 年間合計を計算
    this.annualTotals =
      this.paymentSummaryCalculationService.calculateAnnualTotals(
        result.companyMonthlyTotals
      );

    // 届出要否判定を一括取得（選択された従業員のみ）
    this.notificationsByEmployee =
      await this.notificationCalculationService.calculateNotificationsBatch(
        filteredEmployees,
        this.year,
        this.gradeTable,
        this.bonusesByEmployeeId,
        this.salaryDataByEmployeeId
      );

    // 年間警告を収集（選択された従業員のみ）
    this.warnings = await this.annualWarningService.collectAnnualWarnings(
      filteredEmployees,
      bonuses,
      this.year,
      this.monthlyPremiumsByEmployee,
      this.salaryDataByEmployeeId
    );

    // ChangeDetectionStrategy.OnPush の場合、変更を明示的に通知
    this.cdr.markForCheck();
  }

  /**
   * 選択された従業員のみを返す
   */
  getFilteredEmployees(): Employee[] {
    return this.employees.filter((emp) =>
      this.selectedEmployeeIds.includes(emp.id)
    );
  }

  /**
   * 指定月の賞与情報をツールチップ用の文字列として返す
   * @param month 月（1-12）
   * @returns ツールチップ用の文字列
   */
  getBonusTooltip(month: number): string {
    return this.paymentSummaryFormatService.getBonusTooltip(
      month,
      this.bonusByMonth,
      this.employees
    );
  }

  hasNotesForEmployee(employeeId: string): boolean {
    return this.paymentSummaryCalculationService.hasNotesForEmployee(
      employeeId,
      this.monthlyPremiumsByEmployee
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
    link.setAttribute('download', `社会保険料振込額_${this.year}年度.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * CSV構築メソッド
   * monthlyPremiumsByEmployeeから会社全体の本人負担・会社負担を集計してCSV形式で出力
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

    // 選択された従業員の月次保険料を集計
    const filteredEmployees = this.getFilteredEmployees();
    for (const emp of filteredEmployees) {
      const employeeRows = this.monthlyPremiumsByEmployee[emp.id];
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

    // 賞与保険料を月次合計に加算
    for (const bonus of this.currentYearBonuses) {
      const bonusMonth = bonus.month;
      if (bonusMonth >= 1 && bonusMonth <= 12) {
        // 選択された従業員の賞与のみを加算
        if (this.selectedEmployeeIds.includes(bonus.employeeId)) {
          monthlyTotalsByMonth[bonusMonth].healthEmployee += bonus.healthEmployee || 0;
          monthlyTotalsByMonth[bonusMonth].healthEmployer += bonus.healthEmployer || 0;
          monthlyTotalsByMonth[bonusMonth].careEmployee += bonus.careEmployee || 0;
          monthlyTotalsByMonth[bonusMonth].careEmployer += bonus.careEmployer || 0;
          monthlyTotalsByMonth[bonusMonth].pensionEmployee += bonus.pensionEmployee || 0;
          monthlyTotalsByMonth[bonusMonth].pensionEmployer += bonus.pensionEmployer || 0;
        }
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
    const filteredEmployees = this.getFilteredEmployees();
    let healthEmployee = 0;
    let healthEmployer = 0;
    let careEmployee = 0;
    let careEmployer = 0;
    let pensionEmployee = 0;
    let pensionEmployer = 0;

    if (month === 'all') {
      // 全月の場合は年間合計を使用
      for (const emp of filteredEmployees) {
        const rows = this.monthlyPremiumsByEmployee[emp.id] || [];
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
      // 特定月の集計
      const monthNum = typeof month === 'string' ? Number(month) : (month as number);
      for (const emp of filteredEmployees) {
        const rows = this.monthlyPremiumsByEmployee[emp.id] || [];
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
    const filteredEmployees = this.getFilteredEmployees();
    const filteredEmployeeIds = filteredEmployees.map(e => e.id);
    let healthEmployee = 0;
    let healthEmployer = 0;
    let careEmployee = 0;
    let careEmployer = 0;
    let pensionEmployee = 0;
    let pensionEmployer = 0;

    if (month === 'all') {
      // 全月の場合は年間の賞与合計を使用
      for (const bonus of this.currentYearBonuses) {
        if (filteredEmployeeIds.includes(bonus.employeeId) && !bonus.isExempted && !bonus.isSalaryInsteadOfBonus) {
          healthEmployee += bonus.healthEmployee || 0;
          healthEmployer += bonus.healthEmployer || 0;
          careEmployee += bonus.careEmployee || 0;
          careEmployer += bonus.careEmployer || 0;
          pensionEmployee += bonus.pensionEmployee || 0;
          pensionEmployer += bonus.pensionEmployer || 0;
        }
      }
    } else {
      // 特定月の賞与を集計
      const monthNum = typeof month === 'string' ? Number(month) : (month as number);
      console.log(`[getBonusTotals] 集計開始: year=${year}, month=${monthNum}`);
      console.log(`[getBonusTotals] bonusByMonth[${monthNum}]:`, this.bonusByMonth[monthNum]);
      console.log(`[getBonusTotals] currentYearBonuses.length:`, this.currentYearBonuses.length);
      console.log(`[getBonusTotals] filteredEmployeeIds:`, filteredEmployeeIds);
      
      // bonusByMonthから該当月の賞与を取得（既に月ごとにグループ化済み）
      const monthBonuses = this.bonusByMonth[monthNum] || [];
      console.log(`[getBonusTotals] 該当月の賞与件数: ${monthBonuses.length}`);
      
      for (const bonus of monthBonuses) {
        console.log(`[getBonusTotals] 賞与データ確認:`, {
          employeeId: bonus.employeeId,
          payDate: bonus.payDate,
          month: bonus.month,
          year: bonus.year,
          healthEmployee: bonus.healthEmployee,
          healthEmployer: bonus.healthEmployer,
          isExempted: bonus.isExempted,
          isSalaryInsteadOfBonus: bonus.isSalaryInsteadOfBonus
        });
        
        if (!filteredEmployeeIds.includes(bonus.employeeId)) {
          console.log(`[getBonusTotals] スキップ: 従業員ID不一致 employeeId=${bonus.employeeId}`);
          continue;
        }
        if (bonus.isExempted || bonus.isSalaryInsteadOfBonus) {
          console.log(`[getBonusTotals] スキップ: 免除または給与扱い employeeId=${bonus.employeeId}`);
          continue;
        }
        
        console.log(`[getBonusTotals] ★マッチ: 賞与を集計に追加 employeeId=${bonus.employeeId}, healthEmployee=${bonus.healthEmployee}, healthEmployer=${bonus.healthEmployer}`);
        healthEmployee += bonus.healthEmployee || 0;
        healthEmployer += bonus.healthEmployer || 0;
        careEmployee += bonus.careEmployee || 0;
        careEmployer += bonus.careEmployer || 0;
        pensionEmployee += bonus.pensionEmployee || 0;
        pensionEmployer += bonus.pensionEmployer || 0;
      }
      
      // bonusByMonthにデータがない場合、currentYearBonusesから直接フィルタリング（フォールバック）
      if (monthBonuses.length === 0) {
        console.log(`[getBonusTotals] bonusByMonthにデータがないため、currentYearBonusesから直接フィルタリング`);
        for (const bonus of this.currentYearBonuses) {
          if (!filteredEmployeeIds.includes(bonus.employeeId)) continue;
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
            console.log(`[getBonusTotals] ★フォールバック: 賞与を集計に追加 employeeId=${bonus.employeeId}`);
            healthEmployee += bonus.healthEmployee || 0;
            healthEmployer += bonus.healthEmployer || 0;
            careEmployee += bonus.careEmployee || 0;
            careEmployer += bonus.careEmployer || 0;
            pensionEmployee += bonus.pensionEmployee || 0;
            pensionEmployer += bonus.pensionEmployer || 0;
          }
        }
      }
      
      console.log(`[getBonusTotals] ★集計結果: healthEmployee=${healthEmployee}, healthEmployer=${healthEmployer}, careEmployee=${careEmployee}, careEmployer=${careEmployer}, pensionEmployee=${pensionEmployee}, pensionEmployer=${pensionEmployer}`);
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
    const monthlyTotals = this.getMonthlyTotals(this.year, this.selectedMonth);
    const bonusTotals = this.getBonusTotals(this.year, this.selectedMonth);

    const companyTotal = monthlyTotals.totalEmployer + bonusTotals.totalEmployer;
    const employeeTotal = monthlyTotals.totalEmployee + bonusTotals.totalEmployee;
    const grandTotal = companyTotal + employeeTotal;

    return {
      companyTotal,
      employeeTotal,
      grandTotal,
    };
  }
}
