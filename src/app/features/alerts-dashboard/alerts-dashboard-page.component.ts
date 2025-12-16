import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
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
import {
  AlertFamilyTabComponent,
  SupportAlert,
} from './tabs/alert-family-tab/alert-family-tab.component';
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
import { AlertDeletionService } from '../../services/alert-deletion.service';
import { AlertsDashboardStateService } from '../../services/alerts-dashboard-state.service';
import { UncollectedPremiumService } from '../../services/uncollected-premium.service';
import { FamilyMemberService } from '../../services/family-member.service';
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
  familyRefreshToken = 0;

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
    private alertDeletionService: AlertDeletionService,
    private familyMemberService: FamilyMemberService,
    public state: AlertsDashboardStateService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    // クエリパラメータからタブを読み取る（デフォルトはschedule）
    this.route.queryParams.subscribe((params) => {
      const tab = params['tab'];
      if (
        tab &&
        [
          'schedule',
          'bonus',
          'suiji',
          'teiji',
          'age',
          'leave',
          'family',
          'uncollected',
        ].includes(tab)
      ) {
        this.state.activeTab = tab;
      } else {
        // クエリパラメータがない場合はデフォルトでscheduleタブ
        this.state.activeTab = 'schedule';
      }
    });

    const roomId = this.roomIdService.requireRoomId();
    this.showFirstEntryGuideIfNeeded(roomId);

    // ルームIDが変更された場合、前のルームのアラートデータをクリア
    // シングルトンサービスのため、前のルームのデータが残っている可能性がある
    this.state.supportAlerts = [];

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

    // 扶養アラートを読み込み
    await this.loadSupportAlerts();

    // 定時決定データも初期ロード時に取得し、スケジュールへ反映する
    await this.loadTeijiKetteiData();
    await this.loadScheduleData();

    // 扶養アラートコンポーネントの初期化を待つ（ngOnInitが実行されるまで少し待つ）
    // [hidden]を使うことでコンポーネントは常に初期化されるが、ngOnInitは非同期で実行される
    await new Promise((resolve) => setTimeout(resolve, 100));
    // ここまでで全データが揃った状態でスケジュールを再計算
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
    await this.loadSupportAlerts(); // 扶養アラートも再読み込み
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
    const deletedIds = await this.alertDeletionService.getDeletedIds('suiji');
    const result = await this.alertsDashboardUiService.loadSuijiAlerts(
      this.employees,
      this.salariesByYear,
      (employeeId: string, month: number) =>
        this.getSalaryKey(employeeId, month),
      (employeeId: string, month: number, year: number) =>
        this.getPrevMonthDiff(employeeId, month, year),
      (alert: SuijiKouhoResultWithDiff) => this.getSuijiAlertId(alert)
    );
    this.state.suijiAlerts = result.filter(
      (a) => !deletedIds.has(this.getSuijiAlertId(a))
    );
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
    const deletedIds = await this.alertDeletionService.getDeletedIds('age');
    const result = await this.alertsDashboardUiService.loadAgeAlerts(
      this.employees
    );
    this.state.ageAlerts = result.filter((a) => !deletedIds.has(a.id));
  }

  /**
   * 資格変更アラートを読み込む
   * 従業員データの変更履歴を確認してアラートを生成
   */
  async loadQualificationChangeAlerts(): Promise<void> {
    const deletedIds = await this.alertDeletionService.getDeletedIds(
      'qualification'
    );
    const result =
      await this.alertsDashboardUiService.loadQualificationChangeAlerts(
        this.employees
      );
    this.state.qualificationChangeAlerts = result.filter(
      (a) => !deletedIds.has(a.id)
    );
  }

  /**
   * 産休育休アラートを読み込む
   */
  async loadMaternityChildcareAlerts(): Promise<void> {
    const deletedIds = await this.alertDeletionService.getDeletedIds('leave');
    const result =
      await this.alertsDashboardUiService.loadMaternityChildcareAlerts(
        this.employees,
        (date: Date) => this.formatDate(date)
      );
    this.state.maternityChildcareAlerts = result.filter(
      (a) => !deletedIds.has(a.id)
    );
  }

  /**
   * 賞与支払届アラートを読み込む
   */
  async loadBonusReportAlerts(): Promise<void> {
    try {
      const deletedIds = await this.alertDeletionService.getDeletedIds('bonus');
      const result = await this.alertsDashboardUiService.loadBonusReportAlerts(
        this.employees || []
      );
      if (result && Array.isArray(result)) {
        this.state.bonusReportAlerts = result.filter((a) => a && !deletedIds.has(a.id));
      } else {
        this.state.bonusReportAlerts = [];
      }
    } catch (error) {
      console.error('[AlertsDashboardPage] loadBonusReportAlertsエラー:', error);
      this.state.bonusReportAlerts = [];
    }
  }

  /**
   * 扶養情報変更アラートを読み込む
   */
  async loadSupportAlerts(): Promise<void> {
    const alerts: SupportAlert[] = [];
    const today = this.getJSTDate();
    today.setHours(0, 0, 0, 0);
    const deletedIds = await this.alertDeletionService.getDeletedIds('family');

    // 現在のルームの従業員IDセットを作成（他のルームのデータを除外するため）
    const currentRoomEmployeeIds = new Set(
      this.employees.map((emp) => emp.id).filter((id) => id)
    );

    try {
      for (const emp of this.employees) {
        // 従業員IDが有効でない場合はスキップ
        if (!emp.id) {
          continue;
        }

        const familyMembers =
          await this.familyMemberService.getFamilyMembersByEmployeeId(emp.id);

        // 取得した家族情報が現在のルームの従業員に属しているかを確認
        // （念のため、二重チェック）
        const validFamilyMembers = familyMembers.filter(
          (member) =>
            member.employeeId === emp.id &&
            currentRoomEmployeeIds.has(member.employeeId)
        );

        for (const member of validFamilyMembers) {
          const birthDate = new Date(member.birthDate);
          birthDate.setHours(0, 0, 0, 0);
          const age = this.familyMemberService.calculateAge(member.birthDate);
          const relationship = member.relationship || '';
          const income =
            member.expectedIncome !== null &&
            member.expectedIncome !== undefined
              ? member.expectedIncome
              : null;

          // 【1】配偶者に関するアラート
          if (
            relationship === '配偶者' ||
            relationship === '妻' ||
            relationship === '夫'
          ) {
            // ① 20歳到達（年金加入開始）
            const age20Date = new Date(
              birthDate.getFullYear() + 20,
              birthDate.getMonth(),
              birthDate.getDate()
            );
            age20Date.setHours(0, 0, 0, 0);
            const age20AlertStart = new Date(age20Date);
            age20AlertStart.setMonth(age20AlertStart.getMonth() - 1);
            if (today >= age20AlertStart && age >= 19 && age < 21) {
              const submitDeadline = new Date(age20Date);
              submitDeadline.setDate(submitDeadline.getDate() + 14);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_20_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者20歳到達',
                notificationName: '国民年金第3号被保険者関係届',
                alertDate: age20Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が20歳になります。国民年金第3号被保険者関係届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ② 60歳到達（第3号の終了）
            const age60Date = new Date(
              birthDate.getFullYear() + 60,
              birthDate.getMonth(),
              birthDate.getDate()
            );
            age60Date.setHours(0, 0, 0, 0);
            const age60AlertStart = new Date(age60Date);
            age60AlertStart.setMonth(age60AlertStart.getMonth() - 1);
            if (today >= age60AlertStart && age >= 59 && age < 61) {
              const submitDeadline = new Date(age60Date);
              submitDeadline.setDate(submitDeadline.getDate() + 14);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_60_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者60歳到達',
                notificationName: '国民年金第3号被保険者資格喪失届の確認',
                alertDate: age60Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が60歳に到達します。国民年金第3号被保険者資格喪失届の確認が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ③ 収入増加（130万円超または月108,333円超）
            if (member.expectedIncome && member.expectedIncome > 1300000) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_income_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者収入増加',
                notificationName:
                  '被扶養者（異動）削除届・国民年金第3号資格喪失届',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者の収入が扶養基準を超える可能性があります（収入見込: ${member.expectedIncome.toLocaleString(
                  'ja-JP'
                )}円）。配偶者の扶養基準を確認、必要に応じて届出を提出してください。`,
              });
            }

            // ④ 同居⇒別居の変更
            if (!member.livingTogether) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_separate_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者別居',
                notificationName: '被扶養者（異動）の仕送り状況確認',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が別居予定です。別居扶養の要件（仕送り証明）の確認が必要です。扶養継続不可と判断される場合は被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ⑤ 75歳到達（後期高齢者医療／扶養不可）
            const age75Date = new Date(
              birthDate.getFullYear() + 75,
              birthDate.getMonth(),
              birthDate.getDate()
            );
            age75Date.setHours(0, 0, 0, 0);
            const age75AlertStart = new Date(age75Date);
            age75AlertStart.setMonth(age75AlertStart.getMonth() - 1);
            if (today >= age75AlertStart && age >= 74 && age < 76) {
              const submitDeadline = new Date(age75Date);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_75_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者75歳到達',
                notificationName: '健康保険被扶養者異動届',
                alertDate: age75Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が75歳になります。後期高齢者医療制度へ移行するため、健康保険被扶養者異動届（削除）が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ⑥ 第3号取得（配偶者が第3号となった場合）※見込年収<1,060,000かつ20-59歳
            if (
              member.isThirdCategory &&
              income !== null &&
              income !== undefined &&
              income < 1060000 &&
              age >= 20 &&
              age < 60
            ) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 14);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `spouse_third_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者第3号取得',
                notificationName: '国民年金第3号被保険者関係届',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が第3号に該当しました（見込年収${income.toLocaleString(
                  'ja-JP'
                )}円）。国民年金第3号被保険者関係届を14日以内に提出してください（期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }
          }

          // 【2】子どもに関するアラート
          if (
            relationship === '子' ||
            relationship === '長男' ||
            relationship === '長女' ||
            relationship === '次男' ||
            relationship === '次女' ||
            relationship.includes('子')
          ) {
            // 0) 扶養追加（健康保険被扶養者（異動）届）: 75歳未満かつ見込年収106万円未満のみ
            if (
              age < 75 &&
              income !== null &&
              income !== undefined &&
              income < 1060000
            ) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `child_new_dependent_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子扶養追加',
                notificationName: '健康保険被扶養者異動届',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子が扶養条件（75歳未満・見込年収106万円未満）に該当しました。健康保険被扶養者異動届（扶養追加）を提出してください（期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ① 18歳到達（高校卒業）
            const age18Year = birthDate.getFullYear() + 18;
            const age18GraduationDate = new Date(age18Year, 2, 31);
            age18GraduationDate.setHours(0, 0, 0, 0);
            const age18AlertStart = new Date(age18Year, 2, 1);
            if (today >= age18AlertStart && age >= 17 && age < 19) {
              const submitDeadline = new Date(age18GraduationDate);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `child_18_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子18歳到達',
                notificationName: '扶養見直し（届出不要）',
                alertDate: age18GraduationDate,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子が18歳に到達します（高校卒業予定: ${age18Year}年3月31日）。進学・就労有無による扶養見直しが必要です（届出不要）。提出期限: ${this.formatDate(
                  submitDeadline
                )}。`,
              });
            }

            // ② 22歳到達（大学卒業＋収入増の可能性）
            const age22Year = birthDate.getFullYear() + 22;
            const age22GraduationDate = new Date(age22Year, 2, 31);
            age22GraduationDate.setHours(0, 0, 0, 0);
            const age22AlertStart = new Date(age22Year, 2, 1);
            if (today >= age22AlertStart && age >= 21 && age < 23) {
              const submitDeadline = new Date(age22GraduationDate);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `child_22_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子22歳到達',
                notificationName: '子の就職状況・収入を確認',
                alertDate: age22GraduationDate,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子が22歳に到達します（大学卒業予定: ${age22Year}年3月31日）。就職して厚生年金加入する場合、扶養外れるため被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ④ 同居→別居（実家・一人暮らし）
            if (!member.livingTogether) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `child_separate_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子別居',
                notificationName: '被扶養者（異動）削除届（仕送りがない場合）',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子が別居します。別居扶養の要件（仕送り）が必要です。仕送りがない場合は被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ⑤ アルバイト収入の増減（130万円基準）
            if (member.expectedIncome && member.expectedIncome > 1300000) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `child_income_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子収入増加',
                notificationName: '被扶養者（異動）削除届',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子の収入が扶養基準を超過する可能性があります（収入見込: ${member.expectedIncome.toLocaleString(
                  'ja-JP'
                )}円）。被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }
          }

          // 【3】自分の両親（高齢者扶養）に関するアラート
          if (
            relationship === '父' ||
            relationship === '母' ||
            relationship === '父母' ||
            relationship.includes('父') ||
            relationship.includes('母')
          ) {
            // ① 60歳以上の親の所得増減
            if (age >= 60) {
              if (member.expectedIncome && member.expectedIncome > 1800000) {
                alerts.push({
                  id: `parent_income_${emp.id}_${member.id}`,
                  employeeId: emp.id,
                  employeeName: emp.name,
                  familyMemberId: member.id || '',
                  familyMemberName: member.name,
                  relationship: relationship,
                  alertType: '親収入見直し',
                  notificationName: '扶養基準確認',
                  alertDate: today,
                  details: `親の収入見直しが必要です（収入見込: ${member.expectedIncome.toLocaleString(
                    'ja-JP'
                  )}円）。扶養基準に該当するか確認してください。`,
                });
              }
            }

            // ② 同居→別居
            if (!member.livingTogether) {
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `parent_separate_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '親別居',
                notificationName: '被扶養者（異動）の仕送り状況確認',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `親が別居します。別居扶養の条件（仕送り）が必要です。仕送りがない場合は被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }

            // ③ 75歳到達（後期高齢者医療へ切替）
            const age75Date = new Date(
              birthDate.getFullYear() + 75,
              birthDate.getMonth(),
              birthDate.getDate()
            );
            age75Date.setHours(0, 0, 0, 0);
            const age75AlertStart = new Date(age75Date);
            age75AlertStart.setMonth(age75AlertStart.getMonth() - 1);
            if (today >= age75AlertStart && age >= 74 && age < 76) {
              const submitDeadline = new Date(age75Date);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil(
                (submitDeadline.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              alerts.push({
                id: `parent_75_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '親75歳到達',
                notificationName: '被扶養者（異動）削除届',
                alertDate: age75Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `親が75歳になります。後期高齢者医療制度へ移行します。被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(
                  submitDeadline
                )}）。`,
              });
            }
          }
        }
      }

      alerts.sort((a, b) => {
        return b.alertDate.getTime() - a.alertDate.getTime();
      });

      const filteredAlerts = alerts.filter((a) => !deletedIds.has(a.id));

      // state.supportAlertsを更新（届出スケジュールで使用されるため）
      this.state.supportAlerts = filteredAlerts;
    } catch (error) {
      console.error('[alerts-dashboard-page] loadSupportAlertsエラー:', error);
      this.state.supportAlerts = [];
    }
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
      // 3月始まりの年度に合わせ、4月の月で標準報酬等級表を取得
      this.gradeTable = await this.settingsService.getStandardTableForMonth(
        targetYear,
        4
      );
      const roomId = this.roomIdService.requireRoomId();

      // 配列をクリア（重複を防ぐ）
      this.state.teijiKetteiResults = [];

      // 重複表示を防ぐため、従業員IDをキーに結果を保持
      const teijiResultsMap = new Map<string, TeijiKetteiResultData>();

      // 7月、8月、9月に随時改定の適用開始があるかチェック
      const suijiAlerts = await this.suijiService.loadAlerts(targetYear);

      console.log(
        `[alerts-dashboard] loadTeijiKetteiData開始: 年度=${targetYear}, 従業員数=${this.employees.length}`
      );

      for (const emp of this.employees) {
        // 従業員IDが無い場合はスキップ（重複/不正データ防止）
        if (!emp.id) {
          console.warn('[alerts-dashboard] 従業員ID未設定のためスキップ', emp);
          continue;
        }

        // 既に同じ従業員IDが追加済みなら上書きせずスキップ
        if (teijiResultsMap.has(emp.id)) {
          console.warn(
            `[alerts-dashboard] 重複した従業員IDを検出: ${emp.name} (${emp.id})`
          );
          continue;
        }

        // 7月、8月、9月に随時改定の適用開始があるかチェック
        const employeeSuijiAlerts = suijiAlerts.filter(
          (alert) => alert.employeeId === emp.id && alert.isEligible
        );

        // 随時改定の適用開始月が7月、8月、9月のいずれかであるかをチェック
        let hasSuijiIn789 = false;
        for (const suijiAlert of employeeSuijiAlerts) {
          const changeMonth = suijiAlert.changeMonth;
          const applyStartMonthRaw = changeMonth + 3;
          let applyStartYear = targetYear;
          let applyStartMonth = applyStartMonthRaw;

          // 変動月+3が適用開始月（変動月が10月以上なら翌年）
          if (applyStartMonthRaw > 12) {
            applyStartMonth = applyStartMonthRaw - 12;
            applyStartYear = targetYear + 1;
          }

          // 適用開始月が7月、8月、9月のいずれかで、かつ適用開始年がその年度の場合
          // 変動月が4、5、6月の場合、適用開始月は7、8、9月（同じ年度）
          if (
            applyStartYear === targetYear &&
            (applyStartMonth === 7 ||
              applyStartMonth === 8 ||
              applyStartMonth === 9)
          ) {
            hasSuijiIn789 = true;
            break;
          }
        }

        // 7月、8月、9月に随時改定の適用開始がある場合、算定基礎届アラートを生成しない
        if (hasSuijiIn789) {
          console.log(
            `[alerts-dashboard] 従業員${emp.name} (${emp.id})は${targetYear}年の7-9月に随時改定の適用開始があるため、算定基礎届アラートをスキップ`
          );
          continue;
        }

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
          emp.currentStandardMonthlyRemuneration ?? undefined,
          emp
        );

        // 基礎支払日数が17日未満（0日を含む）の月を算定除外月候補に追加
        const exclusionCandidates: number[] = [];
        if (aprilWorkingDays < 17) {
          if (!exclusionCandidates.includes(4)) {
            exclusionCandidates.push(4);
          }
        }
        if (mayWorkingDays < 17) {
          if (!exclusionCandidates.includes(5)) {
            exclusionCandidates.push(5);
          }
        }
        if (juneWorkingDays < 17) {
          if (!exclusionCandidates.includes(6)) {
            exclusionCandidates.push(6);
          }
        }

        teijiResultsMap.set(emp.id, {
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

      // 従業員ID単位で重複を排除した結果を反映（削除済みIDは除外）
      const deletedIds = await this.alertDeletionService.getDeletedIds('teiji');
      this.state.teijiKetteiResults = Array.from(
        teijiResultsMap.values()
      ).filter((r) => !deletedIds.has(r.employeeId));

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
      this.state.uncollectedPremiums = uncollectedPremiums || [];
    } catch (error) {
      console.error('[AlertsDashboardPage] 徴収不能額の読み込みエラー:', error);
      this.state.uncollectedPremiums = [];
    }

    // スケジュールデータを更新（エラーハンドリング付き）
    try {
      this.state.updateScheduleData();
    } catch (error) {
      console.error('[AlertsDashboardPage] スケジュールデータ更新エラー:', error);
      // エラーが発生してもアプリケーションを継続させるため、空のスケジュールデータを設定
      this.state.scheduleData = {};
    }
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
    } else if (tab === 'family') {
      // 扶養アラートタブが選択された場合、扶養アラートを再読み込み
      await this.loadSupportAlerts();
      this.familyRefreshToken++;
    } else if (tab === 'age') {
      // 従業員データを最新にしてから年齢・資格変更アラートを再読込
      this.employees = await this.employeeService.getAllEmployees();
      await this.loadAgeAlerts();
      await this.loadQualificationChangeAlerts();
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
    const selectedIds = Array.from(this.state.selectedBonusReportAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の賞与支払届アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    selectedIds.forEach((id) =>
      this.alertDeletionService.markAsDeleted('bonus', id)
    );

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

    for (const alertId of selectedIds) {
      await this.alertDeletionService.markAsDeleted('suiji', alertId);
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
    const selectedIds = Array.from(this.state.selectedTeijiAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の算定基礎届アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    selectedIds.forEach((id) =>
      this.alertDeletionService.markAsDeleted('teiji', id)
    );

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
    const selectedIds = Array.from(this.state.selectedAgeAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の年齢到達アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    selectedIds.forEach((id) =>
      this.alertDeletionService.markAsDeleted('age', id)
    );

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

  /**
   * 新規作成ルームの初回入室時に案内を表示
   */
  private showFirstEntryGuideIfNeeded(roomId: string): void {
    const key = `room_onboarding_${roomId}`;
    const flag = localStorage.getItem(key);
    if (flag === '1') {
      // ページ内モーダルで案内を表示し、閉じるとフラグを削除
      this.showOnboardingGuide = true;
      localStorage.removeItem(key);
    }
  }

  showOnboardingGuide = false;

  closeOnboardingGuide(): void {
    this.showOnboardingGuide = false;
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
      await this.alertDeletionService.markAsDeleted('qualification', alertId);
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

  async deleteSelectedMaternityChildcareAlerts(): Promise<void> {
    const selectedIds = Array.from(
      this.state.selectedMaternityChildcareAlertIds
    );
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の産休・育休・休職アラートを削除（非表示）しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 永続削除フラグを保存
    for (const id of selectedIds) {
      await this.alertDeletionService.markAsDeleted('leave', id);
    }

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
    // 有効なタブIDかチェック
    const validTabs: Array<
      | 'schedule'
      | 'bonus'
      | 'suiji'
      | 'teiji'
      | 'age'
      | 'leave'
      | 'family'
      | 'uncollected'
    > = ['schedule', 'bonus', 'suiji', 'teiji', 'age', 'leave', 'family', 'uncollected'];
    if (!tabId || !validTabs.includes(tabId as any)) {
      console.warn(`[AlertsDashboardPage] Invalid tabId: ${tabId}`);
      return;
    }
    this.setActiveTab(tabId as any);
  }
}
