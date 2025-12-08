import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlertItemListComponent } from './alert-item-list/alert-item-list.component';
import { AlertScheduleTabComponent } from './tabs/alert-schedule-tab/alert-schedule-tab.component';
import {
  AlertBonusTabComponent,
  BonusReportAlert,
} from './tabs/alert-bonus-tab/alert-bonus-tab.component';
import {
  AlertSuijiTabComponent,
  SuijiKouhoResultWithDiff,
} from './tabs/alert-suiji-tab/alert-suiji-tab.component';
import {
  AlertTeijiTabComponent,
  TeijiKetteiResultData,
} from './tabs/alert-teiji-tab/alert-teiji-tab.component';
import {
  AlertAgeTabComponent,
  AgeAlert,
  QualificationChangeAlert,
} from './tabs/alert-age-tab/alert-age-tab.component';
import {
  AlertLeaveTabComponent,
  MaternityChildcareAlert,
} from './tabs/alert-leave-tab/alert-leave-tab.component';
import { AlertFamilyTabComponent } from './tabs/alert-family-tab/alert-family-tab.component';
import { AlertUncollectedTabComponent } from './tabs/alert-uncollected-tab/alert-uncollected-tab.component';
import { SuijiService } from '../../services/suiji.service';
import { EmployeeService } from '../../services/employee.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { NotificationCalculationService } from '../../services/notification-calculation.service';
import { NotificationFormatService } from '../../services/notification-format.service';
import { SettingsService } from '../../services/settings.service';
import { BonusService } from '../../services/bonus.service';
import {
  SuijiKouhoResult,
  TeijiKetteiResult,
  SalaryCalculationService,
} from '../../services/salary-calculation.service';
import { NotificationDecisionResult } from '../../services/notification-decision.service';
import { EmployeeChangeHistoryService } from '../../services/employee-change-history.service';
import { QualificationChangeAlertService } from '../../services/qualification-change-alert.service';
import { AlertAggregationService } from '../../services/alert-aggregation.service';
import { AlertsDashboardUiService } from '../../services/alerts-dashboard-ui.service';
import { AlertsDashboardStateService } from '../../services/alerts-dashboard-state.service';
import { UncollectedPremiumService } from '../../services/uncollected-premium.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';
import { RoomIdService } from '../../services/room-id.service';

export interface AlertItem {
  id: string;
  employeeName: string;
  alertType: string;
  comment: string;
  targetMonth: string;
}

@Component({
  selector: 'app-alerts-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AlertItemListComponent,
    AlertScheduleTabComponent,
    AlertBonusTabComponent,
    AlertSuijiTabComponent,
    AlertTeijiTabComponent,
    AlertAgeTabComponent,
    AlertLeaveTabComponent,
    AlertFamilyTabComponent,
    AlertUncollectedTabComponent,
  ],
  templateUrl: './alerts-dashboard-page.component.html',
  styleUrl: './alerts-dashboard-page.component.css',
})
export class AlertsDashboardPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  salaries: {
    [key: string]: { total: number; fixed: number; variable: number };
  } = {};
  salarySubscription: Subscription | null = null;
  eligibilitySubscription: Subscription | null = null;
  salariesByYear: {
    [year: number]: {
      [key: string]: { total: number; fixed: number; variable: number };
    };
  } = {};
  notificationsByEmployee: {
    [employeeId: string]: NotificationDecisionResult[];
  } = {};
  salaryDataByEmployeeId: { [employeeId: string]: any } = {};
  bonusesByEmployeeId: { [employeeId: string]: Bonus[] } = {};
  gradeTable: any[] = [];
  isLoadingTeijiKettei: boolean = false;

  constructor(
    private suijiService: SuijiService,
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private notificationCalculationService: NotificationCalculationService,
    private notificationFormatService: NotificationFormatService,
    private settingsService: SettingsService,
    private bonusService: BonusService,
    private salaryCalculationService: SalaryCalculationService,
    private employeeChangeHistoryService: EmployeeChangeHistoryService,
    private qualificationChangeAlertService: QualificationChangeAlertService,
    private alertAggregationService: AlertAggregationService,
    private alertsDashboardUiService: AlertsDashboardUiService,
    private uncollectedPremiumService: UncollectedPremiumService,
    private roomIdService: RoomIdService,
    public state: AlertsDashboardStateService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();

    // 年度選択肢を生成（現在年度から過去5年分）
    const currentYear = this.getJSTDate().getFullYear();
    this.state.availableYears = [];
    for (let i = 0; i < 6; i++) {
      this.state.availableYears.push(currentYear - i);
    }
    this.state.teijiYear = currentYear;

    // 全年度の給与データを読み込み
    await this.loadAllSalaries();

    // 全年度のアラートを読み込み
    await this.alertsDashboardUiService.loadAlertsAll(
      () => this.loadSuijiAlerts(),
      () => this.loadNotificationAlerts(),
      () => this.loadAgeAlerts(),
      () => this.loadQualificationChangeAlerts(),
      () => this.loadMaternityChildcareAlerts(),
      () => this.loadBonusReportAlerts()
    );

    // 扶養アラートコンポーネントの初期化を待つ（ngOnInitが実行されるまで少し待つ）
    // [hidden]を使うことでコンポーネントは常に初期化されるが、ngOnInitは非同期で実行される
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 届出スケジュールデータを読み込み
    await this.loadScheduleData();

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService
      .observeEligibility()
      .subscribe(() => {
        this.reloadEligibility();
      });
  }

  ngOnDestroy(): void {
    this.salarySubscription?.unsubscribe();
    this.eligibilitySubscription?.unsubscribe();
  }

  async reloadEligibility(): Promise<void> {
    await this.loadSuijiAlerts();
    await this.loadNotificationAlerts();
    await this.loadAgeAlerts();
    await this.loadQualificationChangeAlerts();
    // 算定決定データはタブがアクティブな場合のみ読み込む
    if (this.state.activeTab === 'teiji') {
      await this.loadTeijiKetteiData();
    }
    await this.loadScheduleData();
  }

  /**
   * 全年度の給与データを読み込む
   */
  async loadAllSalaries(): Promise<void> {
    this.salariesByYear = {};
    const years = [2023, 2024, 2025, 2026]; // 取得対象年度
    const roomId = this.roomIdService.requireRoomId();

    for (const year of years) {
      this.salariesByYear[year] = {};
      for (const emp of this.employees) {
        for (let month = 1; month <= 12; month++) {
          const monthData = await this.monthlySalaryService.getEmployeeSalary(
            roomId,
            emp.id,
            year,
            month
          );
          if (!monthData) continue;
          const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
          const variable = monthData.variableSalary ?? monthData.variable ?? 0;
          const total =
            monthData.totalSalary ?? monthData.total ?? fixed + variable;
          const key = this.getSalaryKey(emp.id, month);
          this.salariesByYear[year][key] = { total, fixed, variable };
        }
      }
    }

    // 後方互換性のため、最新年度のデータをsalariesにも設定
    const latestYear = Math.max(...years);
    this.salaries = this.salariesByYear[latestYear] || {};
  }

  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  async loadSuijiAlerts(): Promise<void> {
    const result = await this.alertsDashboardUiService.loadSuijiAlerts(
      this.employees,
      this.salariesByYear,
      (employeeId: string, month: number) =>
        this.getSalaryKey(employeeId, month),
      (employeeId: string, month: number, year: number) =>
        this.getPrevMonthDiff(employeeId, month, year),
      (alert: SuijiKouhoResultWithDiff) => this.getSuijiAlertId(alert)
    );
    this.state.suijiAlerts = result;
  }

  getPrevMonthDiff(
    employeeId: string,
    month: number,
    year: number
  ): number | null {
    const prevMonth = month - 1;
    if (prevMonth < 1) return null;

    const salaries = this.salariesByYear[year] || {};
    const prevKey = this.getSalaryKey(employeeId, prevMonth);
    const currKey = this.getSalaryKey(employeeId, month);

    const prev = salaries[prevKey];
    const curr = salaries[currKey];
    if (!prev || !curr) return null;

    const prevTotal = (prev.fixed || 0) + (prev.variable || 0);
    const currTotal = (curr.fixed || 0) + (curr.variable || 0);

    return currTotal - prevTotal;
  }

  getSuijiAlertId(alert: SuijiKouhoResultWithDiff): string {
    // FirestoreのドキュメントIDがあればそれを使用、なければ生成
    if (alert.id) {
      return alert.id;
    }
    return `${alert.employeeId}_${alert.changeMonth}_${alert.applyStartMonth}`;
  }

  async loadNotificationAlerts(): Promise<void> {
    const result = await this.alertsDashboardUiService.loadNotificationAlerts(
      this.employees,
      (type: 'teiji' | 'suiji' | 'bonus') => this.getNotificationTypeLabel(type)
    );
    this.gradeTable = result.gradeTable;
    this.salaryDataByEmployeeId = result.salaryDataByEmployeeId;
    this.bonusesByEmployeeId = result.bonusesByEmployeeId;
    this.notificationsByEmployee = result.notificationsByEmployee;
    this.state.notificationAlerts = result.notificationAlerts;
  }

  getNotificationTypeLabel(type: 'teiji' | 'suiji' | 'bonus'): string {
    return this.notificationFormatService.getNotificationTypeLabel(type);
  }

  /**
   * 日本時間（JST）の現在日時を取得
   */
  private getJSTDate(): Date {
    const now = new Date();
    // UTC+9時間（日本時間）に変換
    const jstOffset = 9 * 60; // 分単位
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const jst = new Date(utc + jstOffset * 60000);
    return jst;
  }

  /**
   * 年齢到達アラートを読み込む
   */
  async loadAgeAlerts(): Promise<void> {
    const result = await this.alertsDashboardUiService.loadAgeAlerts(
      this.employees
    );
    this.state.ageAlerts = result;
  }

  /**
   * 資格変更アラートを読み込む
   * 従業員データの変更履歴を確認してアラートを生成
   */
  async loadQualificationChangeAlerts(): Promise<void> {
    const result =
      await this.alertsDashboardUiService.loadQualificationChangeAlerts(
        this.employees
      );
    this.state.qualificationChangeAlerts = result;
  }

  /**
   * 産休育休アラートを読み込む
   */
  async loadMaternityChildcareAlerts(): Promise<void> {
    const result =
      await this.alertsDashboardUiService.loadMaternityChildcareAlerts(
        this.employees,
        (date: Date) => this.formatDate(date)
      );
    this.state.maternityChildcareAlerts = result;
  }

  /**
   * 賞与支払届アラートを読み込む
   */
  async loadBonusReportAlerts(): Promise<void> {
    const result = await this.alertsDashboardUiService.loadBonusReportAlerts(
      this.employees
    );
    this.state.bonusReportAlerts = result;
  }

  /**
   * 算定決定タブのデータを読み込む
   */
  async loadTeijiKetteiData(): Promise<void> {
    // 既にローディング中の場合はスキップ（重複実行を防ぐ）
    if (this.isLoadingTeijiKettei) {
      console.log(
        '[alerts-dashboard] loadTeijiKetteiData: 既にローディング中のためスキップ'
      );
      return;
    }

    try {
      this.isLoadingTeijiKettei = true;
      const targetYear = this.state.teijiYear;
      this.gradeTable = await this.settingsService.getStandardTable(targetYear);
      const roomId = this.roomIdService.requireRoomId();

      // 配列をクリア（重複を防ぐ）
      this.state.teijiKetteiResults = [];

      // 処理済みの従業員IDを追跡（重複を防ぐ）
      const processedEmployeeIds = new Set<string>();

      console.log(
        `[alerts-dashboard] loadTeijiKetteiData開始: 年度=${targetYear}, 従業員数=${this.employees.length}`
      );

      for (const emp of this.employees) {
        // 既に処理済みの従業員はスキップ
        if (processedEmployeeIds.has(emp.id)) {
          console.warn(
            `[alerts-dashboard] 重複した従業員をスキップ: ${emp.name} (${emp.id})`
          );
          continue;
        }
        processedEmployeeIds.add(emp.id);
        // 4-6月の給与所得と支払基礎日数を取得
        const aprilData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          emp.id,
          targetYear,
          4
        );
        const mayData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          emp.id,
          targetYear,
          5
        );
        const juneData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          emp.id,
          targetYear,
          6
        );

        // 支払基礎日数が17日以上の月のみを対象とする
        const aprilWorkingDays = aprilData?.workingDays ?? 0;
        const mayWorkingDays = mayData?.workingDays ?? 0;
        const juneWorkingDays = juneData?.workingDays ?? 0;

        // すべての月の支払基礎日数が17日以上かチェック
        const validMonths: number[] = [];
        if (aprilWorkingDays >= 17 && aprilData) {
          validMonths.push(4);
        }
        if (mayWorkingDays >= 17 && mayData) {
          validMonths.push(5);
        }
        if (juneWorkingDays >= 17 && juneData) {
          validMonths.push(6);
        }

        // 少なくとも1ヶ月は17日以上必要
        if (validMonths.length === 0) continue;

        // 給与所得を取得
        const aprilSalary = this.getTotalSalary(aprilData) ?? 0;
        const maySalary = this.getTotalSalary(mayData) ?? 0;
        const juneSalary = this.getTotalSalary(juneData) ?? 0;

        // 有効な月の給与所得のみを使用して平均を計算
        const validSalaries: number[] = [];
        if (validMonths.includes(4) && aprilSalary > 0) {
          validSalaries.push(aprilSalary);
        }
        if (validMonths.includes(5) && maySalary > 0) {
          validSalaries.push(maySalary);
        }
        if (validMonths.includes(6) && juneSalary > 0) {
          validSalaries.push(juneSalary);
        }

        if (validSalaries.length === 0) continue;

        // 平均額を計算
        const averageSalary = Math.round(
          validSalaries.reduce((sum, s) => sum + s, 0) / validSalaries.length
        );

        // 給与項目マスタを取得（欠勤控除を取得するため）
        const salaryItems = await this.settingsService.loadSalaryItems(
          targetYear
        );

        // 定時決定を計算（既存のロジックを使用）
        const salaries: { [key: string]: any } = {};
        for (let month = 1; month <= 12; month++) {
          const monthKey = this.getSalaryKey(emp.id, month);
          const monthData = await this.monthlySalaryService.getEmployeeSalary(
            roomId,
            emp.id,
            targetYear,
            month
          );
          if (monthData) {
            // 欠勤控除を取得（給与項目マスタから）
            let deductionTotal = 0;
            if (monthData.salaryItems && monthData.salaryItems.length > 0) {
              const deductionItems = salaryItems.filter(
                (item) => item.type === 'deduction'
              );
              for (const entry of monthData.salaryItems) {
                const deductionItem = deductionItems.find(
                  (item) => item.id === entry.itemId
                );
                if (deductionItem) {
                  deductionTotal += entry.amount || 0;
                }
              }
            }

            salaries[monthKey] = {
              fixedSalary: monthData.fixedSalary ?? monthData.fixed ?? 0,
              variableSalary:
                monthData.variableSalary ?? monthData.variable ?? 0,
              totalSalary:
                monthData.totalSalary ??
                monthData.total ??
                (monthData.fixedSalary ?? monthData.fixed ?? 0) +
                  (monthData.variableSalary ?? monthData.variable ?? 0),
              deductionTotal: deductionTotal,
              fixed: monthData.fixedSalary ?? monthData.fixed ?? 0,
              variable: monthData.variableSalary ?? monthData.variable ?? 0,
              total:
                (monthData.totalSalary ??
                  monthData.total ??
                  (monthData.fixedSalary ?? monthData.fixed ?? 0) +
                    (monthData.variableSalary ?? monthData.variable ?? 0)) -
                deductionTotal,
              workingDays: monthData.workingDays,
            };
          }
        }

        const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
          emp.id,
          salaries,
          this.gradeTable,
          targetYear,
          emp.currentStandardMonthlyRemuneration ?? undefined
        );

        // 平均額との差が10%以上の月を検出
        const exclusionCandidates: number[] = [];
        if (validMonths.includes(4) && aprilSalary > 0) {
          const diffRate = Math.abs(
            (aprilSalary - averageSalary) / averageSalary
          );
          if (diffRate >= 0.1) {
            exclusionCandidates.push(4);
          }
        }
        if (validMonths.includes(5) && maySalary > 0) {
          const diffRate = Math.abs(
            (maySalary - averageSalary) / averageSalary
          );
          if (diffRate >= 0.1) {
            exclusionCandidates.push(5);
          }
        }
        if (validMonths.includes(6) && juneSalary > 0) {
          const diffRate = Math.abs(
            (juneSalary - averageSalary) / averageSalary
          );
          if (diffRate >= 0.1) {
            exclusionCandidates.push(6);
          }
        }

        // 既に同じ従業員IDが結果に含まれていないか確認（二重チェック）
        const existingIndex = this.state.teijiKetteiResults.findIndex(
          (r) => r.employeeId === emp.id
        );
        if (existingIndex >= 0) {
          console.warn(
            `[alerts-dashboard] 既に結果に存在する従業員をスキップ: ${emp.name} (${emp.id})`
          );
          continue;
        }

        this.state.teijiKetteiResults.push({
          employeeId: emp.id,
          employeeName: emp.name,
          aprilSalary,
          aprilWorkingDays,
          maySalary,
          mayWorkingDays,
          juneSalary,
          juneWorkingDays,
          averageSalary,
          excludedMonths: teijiResult.excludedMonths,
          exclusionCandidates,
          teijiResult,
        });
      }

      console.log(
        `[alerts-dashboard] loadTeijiKetteiData完了: 結果数=${this.state.teijiKetteiResults.length}`
      );
    } catch (error) {
      console.error('[alerts-dashboard] loadTeijiKetteiDataエラー:', error);
    } finally {
      this.isLoadingTeijiKettei = false;
    }
  }

  /**
   * 給与データから総支給額を取得
   */
  private getTotalSalary(monthData: any): number | null {
    if (!monthData) return null;
    return (
      monthData.totalSalary ??
      monthData.total ??
      (monthData.fixedSalary ?? monthData.fixed ?? 0) +
        (monthData.variableSalary ?? monthData.variable ?? 0)
    );
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }

  /**
   * 届出スケジュールデータを読み込む
   */
  async loadScheduleData(): Promise<void> {
    // 徴収不能のデータを読み込む
    try {
      const uncollectedPremiums =
        await this.uncollectedPremiumService.getUncollectedPremiums(
          undefined,
          undefined, // 年度フィルタなし（すべての年度）
          false // 未対応のみ
        );
      this.state.uncollectedPremiums = uncollectedPremiums;
    } catch (error) {
      console.error('[AlertsDashboardPage] 徴収不能額の読み込みエラー:', error);
      this.state.uncollectedPremiums = [];
    }

    this.state.updateScheduleData();
  }

  async setActiveTab(
    tab:
      | 'schedule'
      | 'bonus'
      | 'suiji'
      | 'teiji'
      | 'age'
      | 'leave'
      | 'family'
      | 'uncollected'
  ): Promise<void> {
    this.state.activeTab = tab;
    // 算定決定タブが選択された場合のみデータを読み込む
    if (tab === 'teiji') {
      await this.loadTeijiKetteiData();
    } else if (tab === 'leave') {
      await this.loadMaternityChildcareAlerts();
    } else if (tab === 'bonus') {
      await this.loadBonusReportAlerts();
    }
    // スケジュールデータを再読み込み
    await this.loadScheduleData();
  }

  onBonusAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    this.state.onBonusAlertSelectionChange(event);
  }

  onBonusSelectAllChange(checked: boolean): void {
    this.state.onBonusSelectAllChange(checked);
  }

  deleteSelectedBonusReportAlerts(): void {
    this.state.deleteSelectedBonusReportAlerts();
    this.loadScheduleData();
  }

  onSuijiAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    this.state.onSuijiAlertSelectionChange(event);
  }

  onSuijiSelectAllChange(checked: boolean): void {
    this.state.onSuijiSelectAllChange(
      checked,
      (alert: SuijiKouhoResultWithDiff) => this.getSuijiAlertId(alert)
    );
  }

  async deleteSelectedSuijiAlerts(): Promise<void> {
    const selectedIds = Array.from(this.state.selectedSuijiAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の随時改定アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    for (const alertId of selectedIds) {
      const alert = this.state.suijiAlerts.find(
        (a) => this.getSuijiAlertId(a) === alertId
      );
      if (alert) {
        const docId = alert.id || `${alert.employeeId}_${alert.changeMonth}`;
        const parts = docId.split('_');
        const employeeId = parts[0];
        const changeMonth = parseInt(parts[1], 10);
        const year = alert.year || 2025;
        await this.suijiService.deleteAlert(year, employeeId, changeMonth);
      }
    }

    await this.loadSuijiAlerts();
    this.state.deleteSelectedSuijiAlerts((alert: SuijiKouhoResultWithDiff) =>
      this.getSuijiAlertId(alert)
    );
    await this.loadScheduleData();
  }

  async onTeijiYearChange(year: number): Promise<void> {
    this.state.teijiYear = year;
    await this.loadTeijiKetteiData();
    await this.loadScheduleData();
  }

  onTeijiAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    this.state.onTeijiAlertSelectionChange(event);
  }

  onTeijiSelectAllChange(checked: boolean): void {
    this.state.onTeijiSelectAllChange(
      checked,
      (result: TeijiKetteiResultData) => result.employeeId
    );
  }

  deleteSelectedTeijiAlerts(): void {
    this.state.deleteSelectedTeijiAlerts();
    this.loadScheduleData();
  }

  onAgeAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    this.state.onAgeAlertSelectionChange(event);
  }

  onAgeSelectAllChange(checked: boolean): void {
    this.state.onAgeSelectAllChange(checked);
  }

  deleteSelectedAgeAlerts(): void {
    this.state.deleteSelectedAgeAlerts();
    this.loadScheduleData();
  }

  onQualificationChangeAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    this.state.onQualificationChangeAlertSelectionChange(event);
  }

  onQualificationChangeSelectAllChange(checked: boolean): void {
    this.state.onQualificationChangeSelectAllChange(checked);
  }

  async deleteSelectedQualificationChangeAlerts(): Promise<void> {
    const selectedIds = Array.from(
      this.state.selectedQualificationChangeAlertIds
    );
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の資格変更アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    for (const alertId of selectedIds) {
      await this.qualificationChangeAlertService.markAsDeleted(alertId);
    }

    this.state.deleteSelectedQualificationChangeAlerts();
    await this.loadScheduleData();
  }

  onMaternityChildcareAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    this.state.onMaternityChildcareAlertSelectionChange(event);
  }

  onMaternityChildcareSelectAllChange(checked: boolean): void {
    this.state.onMaternityChildcareSelectAllChange(checked);
  }

  deleteSelectedMaternityChildcareAlerts(): void {
    this.state.deleteSelectedMaternityChildcareAlerts();
    this.loadScheduleData();
  }

  onSupportAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    this.state.onSupportAlertSelectionChange(event);
  }

  onSupportSelectAllChange(checked: boolean): void {
    this.state.onSupportSelectAllChange(checked);
  }

  deleteSelectedSupportAlerts(): void {
    this.state.deleteSelectedSupportAlerts();
    this.loadScheduleData();
  }

  onScheduleMonthChange(month: number): void {
    this.state.onScheduleMonthChange(month);
  }

  onScheduleYearChange(year: number): void {
    this.state.onScheduleYearChange(year);
  }

  onScheduleDateClick(tabId: string): void {
    this.setActiveTab(tabId as any);
  }
}
