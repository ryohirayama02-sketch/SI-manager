import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlertItemListComponent } from './alert-item-list/alert-item-list.component';
import { SuijiService } from '../../services/suiji.service';
import { EmployeeService } from '../../services/employee.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { NotificationCalculationService } from '../../services/notification-calculation.service';
import { NotificationFormatService } from '../../services/notification-format.service';
import { SettingsService } from '../../services/settings.service';
import { BonusService } from '../../services/bonus.service';
import { SuijiKouhoResult, TeijiKetteiResult, SalaryCalculationService } from '../../services/salary-calculation.service';
import { NotificationDecisionResult } from '../../services/notification-decision.service';
import { EmployeeChangeHistoryService } from '../../services/employee-change-history.service';
import { EmployeeChangeHistory } from '../../models/employee-change-history.model';
import { QualificationChangeAlertService } from '../../services/qualification-change-alert.service';
import { FamilyMemberService } from '../../services/family-member.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';
import { FamilyMember } from '../../models/family-member.model';

export interface AlertItem {
  id: string;
  employeeName: string;
  alertType: string;
  comment: string;
  targetMonth: string;
}

// 前月比差額を含む拡張型
interface SuijiKouhoResultWithDiff extends SuijiKouhoResult {
  diffPrev?: number | null;
  id?: string; // FirestoreのドキュメントID
  year?: number; // 年度情報
}

@Component({
  selector: 'app-alerts-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AlertItemListComponent],
  templateUrl: './alerts-dashboard-page.component.html',
  styleUrl: './alerts-dashboard-page.component.css'
})
export class AlertsDashboardPageComponent implements OnInit, OnDestroy {
  activeTab: 'schedule' | 'suiji' | 'teiji' | 'age' | 'leave' | 'family' = 'schedule';
  
  // 年度選択関連（算定決定タブ用）
  teijiYear: number = new Date().getFullYear(); // ngOnInitでJSTに更新
  availableYears: number[] = [];
  
  // 随時改定アラート関連
  suijiAlerts: SuijiKouhoResultWithDiff[] = [];
  selectedSuijiAlertIds: Set<string> = new Set();
  employees: Employee[] = [];
  salaries: {
    [key: string]: { total: number; fixed: number; variable: number };
  } = {};
  salarySubscription: Subscription | null = null;
  eligibilitySubscription: Subscription | null = null;
  // 全年度の給与データを保持（年度ごとに分離）
  salariesByYear: { [year: number]: { [key: string]: { total: number; fixed: number; variable: number } } } = {};
  
  // 届出アラート関連
  notificationAlerts: AlertItem[] = [];
  selectedNotificationAlertIds: Set<string> = new Set();
  notificationsByEmployee: { [employeeId: string]: NotificationDecisionResult[] } = {};
  salaryDataByEmployeeId: { [employeeId: string]: any } = {};
  bonusesByEmployeeId: { [employeeId: string]: Bonus[] } = {};
  gradeTable: any[] = [];

  // 算定決定タブ関連
  teijiKetteiResults: {
    employeeId: string;
    employeeName: string;
    aprilSalary: number;
    aprilWorkingDays: number;
    maySalary: number;
    mayWorkingDays: number;
    juneSalary: number;
    juneWorkingDays: number;
    averageSalary: number;
    excludedMonths: number[];
    exclusionCandidates: number[]; // 平均額との差が10%以上の月
    teijiResult: TeijiKetteiResult;
  }[] = [];
  isLoadingTeijiKettei: boolean = false; // ローディング中フラグ（重複実行を防ぐ）

  // 年齢到達アラート関連
  ageAlerts: {
    id: string;
    employeeId: string;
    employeeName: string;
    alertType: '70歳到達' | '75歳到達';
    notificationName: string; // 届出名前
    birthDate: string;
    reachDate: Date; // 到達日（資格喪失日）
    submitDeadline: Date; // 提出期限
    daysUntilDeadline: number; // 提出期限までの日数
  }[] = [];
  selectedAgeAlertIds: Set<string> = new Set();

  // 資格変更アラート関連
  qualificationChangeAlerts: {
    id: string;
    employeeId: string;
    employeeName: string;
    changeType: '氏名変更' | '住所変更' | '生年月日訂正' | '性別変更' | '所属事業所変更' | '適用区分変更';
    notificationNames: string[]; // 届出名前のリスト
    changeDate: Date; // 変更があった日
    submitDeadline: Date; // 提出期限（変更があった日から5日後）
    daysUntilDeadline: number; // 提出期限までの日数
    details: string; // 変更詳細（例：「田中太郎 → 佐藤太郎」）
  }[] = [];
  selectedQualificationChangeAlertIds: Set<string> = new Set();

  // 産休育休アラート関連
  maternityChildcareAlerts: {
    id: string;
    employeeId: string;
    employeeName: string;
    alertType: '産前産後休業取得者申出書' | '産前産後休業終了届' | '育児休業等取得者申出書（保険料免除開始）' | '育児休業等終了届（免除終了）' | '育児休業等取得者申出書（賞与用）';
    notificationName: string;
    startDate: Date; // 開始日（産休開始日、育休開始日、産休終了日の翌日、育休終了日の翌日、賞与支給日）
    submitDeadline: Date; // 提出期限（開始日から5日後）
    daysUntilDeadline: number; // 提出期限までの日数
    details: string; // 詳細情報
  }[] = [];
  selectedMaternityChildcareAlertIds: Set<string> = new Set();

  // 扶養アラート関連
  supportAlerts: {
    id: string;
    employeeId: string;
    employeeName: string;
    familyMemberId: string;
    familyMemberName: string;
    relationship: string; // 続柄（配偶者、子、父母など）
    alertType: '配偶者20歳到達' | '配偶者60歳到達' | '配偶者収入増加' | '配偶者別居' | '配偶者75歳到達' | 
               '子18歳到達' | '子20歳到達' | '子22歳到達' | '子別居' | '子収入増加' | '子死亡結婚' |
               '親収入見直し' | '親別居' | '親75歳到達' | '親死亡';
    notificationName: string;
    alertDate: Date; // アラート対象日（到達日、変更日など）
    submitDeadline?: Date; // 提出期限（該当する場合）
    daysUntilDeadline?: number; // 提出期限までの日数
    details: string; // 詳細情報
  }[] = [];
  selectedSupportAlertIds: Set<string> = new Set();

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
    private familyMemberService: FamilyMemberService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    
    // 年度選択肢を生成（現在年度から過去5年分）
    const currentYear = this.getJSTDate().getFullYear();
    this.availableYears = [];
    for (let i = 0; i < 6; i++) {
      this.availableYears.push(currentYear - i);
    }
    this.teijiYear = currentYear;
    
    // 全年度の給与データを読み込み
    await this.loadAllSalaries();
    
    // 全年度のアラートを読み込み
    await this.loadSuijiAlerts();
    await this.loadNotificationAlerts();
    await this.loadAgeAlerts();
    await this.loadQualificationChangeAlerts();
    await this.loadMaternityChildcareAlerts();
    // 算定決定データはタブがアクティブな場合のみ読み込む（初期化時は読み込まない）
    // await this.loadTeijiKetteiData();
    
    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService.observeEligibility().subscribe(() => {
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
    if (this.activeTab === 'teiji') {
      await this.loadTeijiKetteiData();
    }
  }

  /**
   * 全年度の給与データを読み込む
   */
  async loadAllSalaries(): Promise<void> {
    this.salariesByYear = {};
    const years = [2023, 2024, 2025, 2026]; // 取得対象年度
    
    for (const year of years) {
      this.salariesByYear[year] = {};
      for (const emp of this.employees) {
        const data = await this.monthlySalaryService.getEmployeeSalary(emp.id, year);
        if (!data) continue;

        for (let month = 1; month <= 12; month++) {
          const monthKey = month.toString();
          const monthData = data[monthKey];
          if (monthData) {
            const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
            const variable = monthData.variableSalary ?? monthData.variable ?? 0;
            const total = monthData.totalSalary ?? monthData.total ?? fixed + variable;
            const key = this.getSalaryKey(emp.id, month);
            this.salariesByYear[year][key] = { total, fixed, variable };
          }
        }
      }
    }
    
    // 後方互換性のため、最新年度のデータをsalariesにも設定
    const latestYear = Math.max(...years);
    this.salaries = this.salariesByYear[latestYear] || {};
  }

  async loadSalaries(): Promise<void> {
    // 後方互換性のため残すが、使用しない
    await this.loadAllSalaries();
  }

  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  async loadSuijiAlerts(): Promise<void> {
    const years = [2023, 2024, 2025, 2026]; // 取得対象年度
    const loadedAlerts = await this.suijiService.loadAllAlerts(years);
    
    // 存在する従業員のアラートのみをフィルタリング
    const validEmployeeIds = new Set(this.employees.map(e => e.id));
    this.suijiAlerts = loadedAlerts
      .filter((alert: any) => validEmployeeIds.has(alert.employeeId))
      .map((alert: any) => ({
        ...alert,
        diffPrev: this.getPrevMonthDiff(alert.employeeId, alert.changeMonth, alert.year || 2025),
        id: alert.id || this.getSuijiAlertId(alert)
      }));
  }

  getPrevMonthDiff(employeeId: string, month: number, year: number): number | null {
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

  getEmployeeName(employeeId: string): string {
    const emp = this.employees.find(e => e.id === employeeId);
    if (!emp) {
      console.warn(`[alerts-dashboard] 従業員が見つかりません: employeeId=${employeeId}, 従業員数=${this.employees.length}`);
      console.log(`[alerts-dashboard] 現在の従業員リスト:`, this.employees.map(e => ({ id: e.id, name: e.name })));
    }
    return emp?.name || employeeId;
  }

  getStatusText(result: SuijiKouhoResultWithDiff): string {
    return result.isEligible ? '要提出' : '提出不要';
  }

  getReasonText(result: SuijiKouhoResultWithDiff): string {
    return result.reasons.join(' / ');
  }

  async loadSalaryData(): Promise<void> {
    // 後方互換性のため残すが、実際のデータ読み込みはloadNotificationAlerts内で行う
    this.salaryDataByEmployeeId = {};
  }

  async loadBonusData(): Promise<void> {
    // 後方互換性のため残すが、実際のデータ読み込みはloadNotificationAlerts内で行う
    this.bonusesByEmployeeId = {};
  }

  async loadNotificationAlerts(): Promise<void> {
    // 届出アラートは現在年度のみ計算（必要に応じて全年度対応可能）
    const currentYear = this.getJSTDate().getFullYear();
    this.gradeTable = await this.settingsService.getStandardTable(currentYear);
    
    // 給与データと賞与データを読み込み
    this.salaryDataByEmployeeId = {};
    for (const emp of this.employees) {
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(emp.id, currentYear);
      this.salaryDataByEmployeeId[emp.id] = salaryData;
    }
    
    const bonuses = await this.bonusService.loadBonus(currentYear);
    this.bonusesByEmployeeId = {};
    for (const bonus of bonuses) {
      if (!this.bonusesByEmployeeId[bonus.employeeId]) {
        this.bonusesByEmployeeId[bonus.employeeId] = [];
      }
      this.bonusesByEmployeeId[bonus.employeeId].push(bonus);
    }
    
    // 届出要否を計算
    this.notificationsByEmployee = await this.notificationCalculationService.calculateNotificationsBatch(
      this.employees,
      currentYear,
      this.gradeTable,
      this.bonusesByEmployeeId,
      this.salaryDataByEmployeeId
    );

    // AlertItemに変換
    this.notificationAlerts = [];
    let alertId = 1;
    for (const emp of this.employees) {
      const notifications = this.notificationsByEmployee[emp.id] || [];
      for (const notification of notifications) {
        if (notification.required) {
          this.notificationAlerts.push({
            id: `alert-${alertId++}`,
            employeeName: emp.name,
            alertType: this.getNotificationTypeLabel(notification.type),
            comment: notification.reasons.join(' / '),
            targetMonth: notification.submitUntil 
              ? `${currentYear}年${new Date(notification.submitUntil).getMonth() + 1}月`
              : `${currentYear}年`
          });
        }
      }
    }
  }

  getNotificationTypeLabel(type: 'teiji' | 'suiji' | 'bonus'): string {
    return this.notificationFormatService.getNotificationTypeLabel(type);
  }

  // onYearChangeメソッドは削除（年度選択が不要になったため）

  isLargeChange(diff: number | null | undefined): boolean {
    if (diff == null) return false;
    return Math.abs(diff) >= 2;
  }

  async setActiveTab(tab: 'schedule' | 'suiji' | 'teiji' | 'age' | 'leave' | 'family'): Promise<void> {
    this.activeTab = tab;
    // 算定決定タブが選択された場合のみデータを読み込む
    if (tab === 'teiji') {
      await this.loadTeijiKetteiData();
    } else if (tab === 'leave') {
      await this.loadMaternityChildcareAlerts();
    } else if (tab === 'family') {
      await this.loadSupportAlerts();
    }
  }

  // 随時改定アラートの選択管理
  toggleSuijiAlertSelection(alertId: string): void {
    if (this.selectedSuijiAlertIds.has(alertId)) {
      this.selectedSuijiAlertIds.delete(alertId);
    } else {
      this.selectedSuijiAlertIds.add(alertId);
    }
  }

  toggleAllSuijiAlerts(checked: boolean): void {
    if (checked) {
      this.suijiAlerts.forEach(alert => {
        const alertId = this.getSuijiAlertId(alert);
        this.selectedSuijiAlertIds.add(alertId);
      });
    } else {
      this.selectedSuijiAlertIds.clear();
    }
  }

  toggleAllSuijiAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleAllSuijiAlerts(target.checked);
  }

  isSuijiAlertSelected(alertId: string): boolean {
    return this.selectedSuijiAlertIds.has(alertId);
  }

  getSuijiAlertId(alert: SuijiKouhoResultWithDiff): string {
    // FirestoreのドキュメントIDがあればそれを使用、なければ生成
    if (alert.id) {
      return alert.id;
    }
    return `${alert.employeeId}_${alert.changeMonth}_${alert.applyStartMonth}`;
  }

  // 届出アラートの選択管理
  toggleNotificationAlertSelection(alertId: string): void {
    if (this.selectedNotificationAlertIds.has(alertId)) {
      this.selectedNotificationAlertIds.delete(alertId);
    } else {
      this.selectedNotificationAlertIds.add(alertId);
    }
  }

  toggleAllNotificationAlerts(checked: boolean): void {
    if (checked) {
      this.notificationAlerts.forEach(alert => {
        this.selectedNotificationAlertIds.add(alert.id);
      });
    } else {
      this.selectedNotificationAlertIds.clear();
    }
  }

  isNotificationAlertSelected(alertId: string): boolean {
    return this.selectedNotificationAlertIds.has(alertId);
  }

  // 随時改定アラートの削除
  async deleteSelectedSuijiAlerts(): Promise<void> {
    const selectedIds = Array.from(this.selectedSuijiAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の随時改定アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 選択されたアラートを削除
    for (const alertId of selectedIds) {
      const alert = this.suijiAlerts.find(a => this.getSuijiAlertId(a) === alertId);
      if (alert) {
        // FirestoreのドキュメントIDを使用（形式: employeeId_changeMonth）
        const docId = alert.id || `${alert.employeeId}_${alert.changeMonth}`;
        const parts = docId.split('_');
        const employeeId = parts[0];
        const changeMonth = parseInt(parts[1], 10);
        
        const year = alert.year || 2025; // アラートに年度情報が含まれている
        await this.suijiService.deleteAlert(
          year,
          employeeId,
          changeMonth
        );
      }
    }

    // アラートを再読み込み
    await this.loadSuijiAlerts();
    this.selectedSuijiAlertIds.clear();
  }

  // 届出アラートの削除
  deleteSelectedNotificationAlerts(): void {
    const selectedIds = Array.from(this.selectedNotificationAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の届出アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 選択されたアラートを配列から削除
    this.notificationAlerts = this.notificationAlerts.filter(
      alert => !selectedIds.includes(alert.id)
    );
    this.selectedNotificationAlertIds.clear();
  }

  /**
   * 算定決定タブの年度変更ハンドラ
   */
  async onTeijiYearChange(): Promise<void> {
    await this.loadTeijiKetteiData();
  }

  /**
   * 算定決定タブのデータを読み込む
   */
  async loadTeijiKetteiData(): Promise<void> {
    // 既にローディング中の場合はスキップ（重複実行を防ぐ）
    if (this.isLoadingTeijiKettei) {
      console.log('[alerts-dashboard] loadTeijiKetteiData: 既にローディング中のためスキップ');
      return;
    }

    try {
      this.isLoadingTeijiKettei = true;
      const targetYear = this.teijiYear;
      this.gradeTable = await this.settingsService.getStandardTable(targetYear);
      
      // 配列をクリア（重複を防ぐ）
      this.teijiKetteiResults = [];
      
      // 処理済みの従業員IDを追跡（重複を防ぐ）
      const processedEmployeeIds = new Set<string>();
      
      console.log(`[alerts-dashboard] loadTeijiKetteiData開始: 年度=${targetYear}, 従業員数=${this.employees.length}`);
      
      for (const emp of this.employees) {
        // 既に処理済みの従業員はスキップ
        if (processedEmployeeIds.has(emp.id)) {
          console.warn(`[alerts-dashboard] 重複した従業員をスキップ: ${emp.name} (${emp.id})`);
          continue;
        }
        processedEmployeeIds.add(emp.id);
      // 給与データを取得
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(emp.id, targetYear);
      if (!salaryData) continue;

      // 4-6月の給与所得と支払基礎日数を取得
      const aprilData = salaryData['4'];
      const mayData = salaryData['5'];
      const juneData = salaryData['6'];

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

      // 定時決定を計算（既存のロジックを使用）
      const salaries: { [key: string]: any } = {};
      for (let month = 1; month <= 12; month++) {
        const monthKey = this.getSalaryKey(emp.id, month);
        const monthData = salaryData[month.toString()];
        if (monthData) {
          salaries[monthKey] = {
            fixedSalary: monthData.fixedSalary ?? monthData.fixed ?? 0,
            variableSalary: monthData.variableSalary ?? monthData.variable ?? 0,
            totalSalary: monthData.totalSalary ?? monthData.total ?? 
                        (monthData.fixedSalary ?? monthData.fixed ?? 0) + 
                        (monthData.variableSalary ?? monthData.variable ?? 0),
          };
        }
      }

      const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
        emp.id,
        salaries,
        this.gradeTable,
        targetYear,
        emp.standardMonthlyRemuneration
      );

      // 平均額との差が10%以上の月を検出
      const exclusionCandidates: number[] = [];
      if (validMonths.includes(4) && aprilSalary > 0) {
        const diffRate = Math.abs((aprilSalary - averageSalary) / averageSalary);
        if (diffRate >= 0.1) {
          exclusionCandidates.push(4);
        }
      }
      if (validMonths.includes(5) && maySalary > 0) {
        const diffRate = Math.abs((maySalary - averageSalary) / averageSalary);
        if (diffRate >= 0.1) {
          exclusionCandidates.push(5);
        }
      }
      if (validMonths.includes(6) && juneSalary > 0) {
        const diffRate = Math.abs((juneSalary - averageSalary) / averageSalary);
        if (diffRate >= 0.1) {
          exclusionCandidates.push(6);
        }
      }

      // 既に同じ従業員IDが結果に含まれていないか確認（二重チェック）
      const existingIndex = this.teijiKetteiResults.findIndex(r => r.employeeId === emp.id);
      if (existingIndex >= 0) {
        console.warn(`[alerts-dashboard] 既に結果に存在する従業員をスキップ: ${emp.name} (${emp.id})`);
        continue;
      }

      this.teijiKetteiResults.push({
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
    
    console.log(`[alerts-dashboard] loadTeijiKetteiData完了: 結果数=${this.teijiKetteiResults.length}`);
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
    return monthData.totalSalary ?? monthData.total ?? 
           (monthData.fixedSalary ?? monthData.fixed ?? 0) + 
           (monthData.variableSalary ?? monthData.variable ?? 0);
  }

  /**
   * 日本時間（JST）の現在日時を取得
   */
  private getJSTDate(): Date {
    const now = new Date();
    // UTC+9時間（日本時間）に変換
    const jstOffset = 9 * 60; // 分単位
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const jst = new Date(utc + (jstOffset * 60000));
    return jst;
  }

  /**
   * 年齢到達アラートを読み込む
   */
  async loadAgeAlerts(): Promise<void> {
    this.ageAlerts = [];
    const today = this.getJSTDate();
    today.setHours(0, 0, 0, 0);

    for (const emp of this.employees) {
      if (!emp.birthDate) continue;

      const birthDate = new Date(emp.birthDate);
      
      // 70歳到達チェック
      const age70Date = new Date(birthDate.getFullYear() + 70, birthDate.getMonth(), birthDate.getDate() - 1);
      const age70AlertStartDate = new Date(age70Date);
      age70AlertStartDate.setMonth(age70AlertStartDate.getMonth() - 1);
      
      if (today >= age70AlertStartDate && today < age70Date) {
        // 提出期限 = 資格喪失日の5日後
        const submitDeadline = new Date(age70Date);
        submitDeadline.setDate(submitDeadline.getDate() + 5);
        
        const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        this.ageAlerts.push({
          id: `age70_${emp.id}`,
          employeeId: emp.id,
          employeeName: emp.name,
          alertType: '70歳到達',
          notificationName: '厚生年金 資格喪失届',
          birthDate: emp.birthDate,
          reachDate: age70Date,
          submitDeadline: submitDeadline,
          daysUntilDeadline: daysUntilDeadline,
        });
      }

      // 75歳到達チェック
      const age75Date = new Date(birthDate.getFullYear() + 75, birthDate.getMonth(), birthDate.getDate() - 1);
      const age75AlertStartDate = new Date(age75Date);
      age75AlertStartDate.setMonth(age75AlertStartDate.getMonth() - 1);
      
      if (today >= age75AlertStartDate && today < age75Date) {
        // 提出期限 = 資格喪失日の5日後
        const submitDeadline = new Date(age75Date);
        submitDeadline.setDate(submitDeadline.getDate() + 5);
        
        const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        this.ageAlerts.push({
          id: `age75_${emp.id}`,
          employeeId: emp.id,
          employeeName: emp.name,
          alertType: '75歳到達',
          notificationName: '健保 資格喪失届',
          birthDate: emp.birthDate,
          reachDate: age75Date,
          submitDeadline: submitDeadline,
          daysUntilDeadline: daysUntilDeadline,
        });
      }
    }

    // 提出期限でソート
    this.ageAlerts.sort((a, b) => a.submitDeadline.getTime() - b.submitDeadline.getTime());
  }

  // 年齢到達アラートの選択管理
  toggleAgeAlertSelection(alertId: string): void {
    if (this.selectedAgeAlertIds.has(alertId)) {
      this.selectedAgeAlertIds.delete(alertId);
    } else {
      this.selectedAgeAlertIds.add(alertId);
    }
  }

  toggleAllAgeAlerts(checked: boolean): void {
    if (checked) {
      this.ageAlerts.forEach(alert => {
        this.selectedAgeAlertIds.add(alert.id);
      });
    } else {
      this.selectedAgeAlertIds.clear();
    }
  }

  toggleAllAgeAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleAllAgeAlerts(target.checked);
  }

  isAgeAlertSelected(alertId: string): boolean {
    return this.selectedAgeAlertIds.has(alertId);
  }

  // 年齢到達アラートの削除
  deleteSelectedAgeAlerts(): void {
    const selectedIds = Array.from(this.selectedAgeAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の年齢到達アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 選択されたアラートを配列から削除
    this.ageAlerts = this.ageAlerts.filter(
      alert => !selectedIds.includes(alert.id)
    );
    this.selectedAgeAlertIds.clear();
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }

  formatBirthDate(birthDateString: string): string {
    const date = new Date(birthDateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }

  /**
   * 資格変更アラートを読み込む
   * 従業員データの変更履歴を確認してアラートを生成
   */
  async loadQualificationChangeAlerts(): Promise<void> {
    this.qualificationChangeAlerts = [];
    const today = this.getJSTDate();
    today.setHours(0, 0, 0, 0);

    try {
      // 削除済みアラートIDを取得
      const deletedAlertIds = await this.qualificationChangeAlertService.getDeletedAlertIds();
      console.log(`[alerts-dashboard] 削除済みアラートID数: ${deletedAlertIds.size}`);

      // 変更履歴を取得（変更日から5日以内のもの）
      const changeHistories = await this.employeeChangeHistoryService.getAllRecentChangeHistory(5);
      console.log(`[alerts-dashboard] 取得した変更履歴数: ${changeHistories.length}`);

      for (const history of changeHistories) {
        // アラートIDを生成（一意性を確保）
        const alertId = history.id || `${history.employeeId}_${history.changeType}_${history.changeDate}`;
        console.log(`[alerts-dashboard] 変更履歴を処理: ID=${alertId}, 従業員ID=${history.employeeId}, 変更種別=${history.changeType}, 変更日=${history.changeDate}`);
        
        // 削除済みアラートはスキップ
        if (deletedAlertIds.has(alertId)) {
          console.log(`[alerts-dashboard] 削除済みアラートのためスキップ: ${alertId}`);
          continue;
        }

        const changeDate = new Date(history.changeDate);
        changeDate.setHours(0, 0, 0, 0);

        // 提出期限 = 変更日から5日後
        const submitDeadline = new Date(changeDate);
        submitDeadline.setDate(submitDeadline.getDate() + 5);

        // 提出期限までの日数を計算
        const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // 従業員名を取得
        const employee = this.employees.find(emp => emp.id === history.employeeId);
        const employeeName = employee?.name || '不明';

        // 変更詳細を生成
        let details = '';
        if (history.changeType === '氏名変更') {
          details = `${history.oldValue} → ${history.newValue}`;
        } else if (history.changeType === '住所変更') {
          details = `${history.oldValue} → ${history.newValue}`;
        } else if (history.changeType === '生年月日訂正') {
          details = `${history.oldValue} → ${history.newValue}`;
        } else if (history.changeType === '性別変更') {
          details = `${history.oldValue} → ${history.newValue}`;
        } else if (history.changeType === '所属事業所変更') {
          details = `${history.oldValue} → ${history.newValue}`;
        } else if (history.changeType === '適用区分変更') {
          details = `${history.oldValue} → ${history.newValue}`;
        }

        // 既に同じアラートが存在するかチェック（重複を防ぐ）
        const existingAlert = this.qualificationChangeAlerts.find(
          alert => alert.id === alertId || 
          (alert.employeeId === history.employeeId && 
           alert.changeType === history.changeType && 
           alert.changeDate.getTime() === changeDate.getTime())
        );
        
        if (!existingAlert) {
          console.log(`[alerts-dashboard] 新しいアラートを追加: ${alertId}, 従業員=${employeeName}`);
          this.qualificationChangeAlerts.push({
            id: alertId,
            employeeId: history.employeeId,
            employeeName: employeeName,
            changeType: history.changeType,
            notificationNames: history.notificationNames,
            changeDate: changeDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: details,
          });
        } else {
          console.log(`[alerts-dashboard] 既存のアラートのためスキップ: ${alertId}`);
        }
      }

      // 変更日でソート（新しい順）
      this.qualificationChangeAlerts.sort((a, b) => {
        return b.changeDate.getTime() - a.changeDate.getTime();
      });
    } catch (error) {
      console.error('[alerts-dashboard] loadQualificationChangeAlertsエラー:', error);
    }
  }

  // 資格変更アラートの選択管理
  toggleQualificationChangeAlertSelection(alertId: string): void {
    if (this.selectedQualificationChangeAlertIds.has(alertId)) {
      this.selectedQualificationChangeAlertIds.delete(alertId);
    } else {
      this.selectedQualificationChangeAlertIds.add(alertId);
    }
  }

  toggleAllQualificationChangeAlerts(checked: boolean): void {
    if (checked) {
      this.qualificationChangeAlerts.forEach(alert => {
        this.selectedQualificationChangeAlertIds.add(alert.id);
      });
    } else {
      this.selectedQualificationChangeAlertIds.clear();
    }
  }

  toggleAllQualificationChangeAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleAllQualificationChangeAlerts(target.checked);
  }

  isQualificationChangeAlertSelected(alertId: string): boolean {
    return this.selectedQualificationChangeAlertIds.has(alertId);
  }

  // 資格変更アラートの削除
  async deleteSelectedQualificationChangeAlerts(): Promise<void> {
    const selectedIds = Array.from(this.selectedQualificationChangeAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の資格変更アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // Firestoreに削除済みとしてマーク
    for (const alertId of selectedIds) {
      await this.qualificationChangeAlertService.markAsDeleted(alertId);
    }

    // 選択されたアラートを配列から削除
    this.qualificationChangeAlerts = this.qualificationChangeAlerts.filter(
      alert => !selectedIds.includes(alert.id)
    );
    this.selectedQualificationChangeAlertIds.clear();
  }

  /**
   * 産休育休アラートを読み込む
   */
  async loadMaternityChildcareAlerts(): Promise<void> {
    this.maternityChildcareAlerts = [];
    const today = this.getJSTDate();
    today.setHours(0, 0, 0, 0);

    try {
      // 現在年度の賞与データを取得（賞与用アラートのため）
      const currentYear = today.getFullYear();
      const allBonuses = await this.bonusService.loadBonus(currentYear);

      for (const emp of this.employees) {
        // ① 産前産後休業取得者申出書 - 産休開始日が記入されていれば常にアラート表示
        if (emp.maternityLeaveStart) {
          const startDate = new Date(emp.maternityLeaveStart);
          startDate.setHours(0, 0, 0, 0);
          const submitDeadline = new Date(startDate);
          submitDeadline.setDate(submitDeadline.getDate() + 5);
          
          // 記入されていれば常にアラートを表示（時間差に関係なく）
          const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          this.maternityChildcareAlerts.push({
            id: `maternity_start_${emp.id}_${emp.maternityLeaveStart}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '産前産後休業取得者申出書',
            notificationName: '産前産後休業取得者申出書',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `産休開始日: ${this.formatDate(startDate)}`,
          });
        }

        // ② 産前産後休業終了届 - 産休終了日が記入されていれば常にアラート表示
        if (emp.maternityLeaveEnd) {
          const endDate = new Date(emp.maternityLeaveEnd);
          endDate.setHours(0, 0, 0, 0);
          const startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() + 1); // 終了日の翌日
          const submitDeadline = new Date(startDate);
          submitDeadline.setDate(submitDeadline.getDate() + 5);
          
          // 記入されていれば常にアラートを表示（時間差に関係なく）
          const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          this.maternityChildcareAlerts.push({
            id: `maternity_end_${emp.id}_${emp.maternityLeaveEnd}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '産前産後休業終了届',
            notificationName: '産前産後休業終了届',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `産休終了日: ${this.formatDate(endDate)}`,
          });
        }

        // ③ 育児休業等取得者申出書（保険料免除開始） - 育休開始日が記入されていれば常にアラート表示
        if (emp.childcareLeaveStart) {
          const startDate = new Date(emp.childcareLeaveStart);
          startDate.setHours(0, 0, 0, 0);
          const submitDeadline = new Date(startDate);
          submitDeadline.setDate(submitDeadline.getDate() + 5);
          
          // 記入されていれば常にアラートを表示（時間差に関係なく）
          const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          this.maternityChildcareAlerts.push({
            id: `childcare_start_${emp.id}_${emp.childcareLeaveStart}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '育児休業等取得者申出書（保険料免除開始）',
            notificationName: '育児休業等取得者申出書（保険料免除開始）',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `育休開始日: ${this.formatDate(startDate)}`,
          });
        }

        // ④ 育児休業等終了届（免除終了） - 育休終了日が記入されていれば常にアラート表示
        if (emp.childcareLeaveEnd) {
          const endDate = new Date(emp.childcareLeaveEnd);
          endDate.setHours(0, 0, 0, 0);
          const startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() + 1); // 終了日の翌日
          const submitDeadline = new Date(startDate);
          submitDeadline.setDate(submitDeadline.getDate() + 5);
          
          // 記入されていれば常にアラートを表示（時間差に関係なく）
          const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          this.maternityChildcareAlerts.push({
            id: `childcare_end_${emp.id}_${emp.childcareLeaveEnd}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '育児休業等終了届（免除終了）',
            notificationName: '育児休業等終了届（免除終了）',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `育休終了日: ${this.formatDate(endDate)}`,
          });
        }

        // ⑤ 育児休業等取得者申出書（賞与用） - 賞与支給日が記入されていれば常にアラート表示（同居養育のチェックが無ければ）
        if (!emp.childcareLivingTogether) {
          // 該当従業員の賞与データを取得
          const employeeBonuses = allBonuses.filter(b => b.employeeId === emp.id && b.amount > 0);
          
          for (const bonus of employeeBonuses) {
            if (bonus.payDate) {
              const payDate = new Date(bonus.payDate);
              payDate.setHours(0, 0, 0, 0);
              const submitDeadline = new Date(payDate);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              
              // 記入されていれば常にアラートを表示（時間差に関係なく）
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              this.maternityChildcareAlerts.push({
                id: `childcare_bonus_${emp.id}_${bonus.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                alertType: '育児休業等取得者申出書（賞与用）',
                notificationName: '育児休業等取得者申出書（賞与用）',
                startDate: payDate,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `賞与支給日: ${this.formatDate(payDate)}, 賞与額: ${bonus.amount.toLocaleString('ja-JP')}円`,
              });
            }
          }
        }
      }

      // 開始日でソート（新しい順）
      this.maternityChildcareAlerts.sort((a, b) => {
        return b.startDate.getTime() - a.startDate.getTime();
      });
    } catch (error) {
      console.error('[alerts-dashboard] loadMaternityChildcareAlertsエラー:', error);
    }
  }

  // 産休育休アラートの選択管理
  toggleMaternityChildcareAlertSelection(alertId: string): void {
    if (this.selectedMaternityChildcareAlertIds.has(alertId)) {
      this.selectedMaternityChildcareAlertIds.delete(alertId);
    } else {
      this.selectedMaternityChildcareAlertIds.add(alertId);
    }
  }

  toggleAllMaternityChildcareAlerts(checked: boolean): void {
    if (checked) {
      this.maternityChildcareAlerts.forEach(alert => {
        this.selectedMaternityChildcareAlertIds.add(alert.id);
      });
    } else {
      this.selectedMaternityChildcareAlertIds.clear();
    }
  }

  toggleAllMaternityChildcareAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleAllMaternityChildcareAlerts(target.checked);
  }

  isMaternityChildcareAlertSelected(alertId: string): boolean {
    return this.selectedMaternityChildcareAlertIds.has(alertId);
  }

  // 産休育休アラートの削除
  async deleteSelectedMaternityChildcareAlerts(): Promise<void> {
    const selectedIds = Array.from(this.selectedMaternityChildcareAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の産休育休アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 選択されたアラートを配列から削除
    this.maternityChildcareAlerts = this.maternityChildcareAlerts.filter(
      alert => !selectedIds.includes(alert.id)
    );
    this.selectedMaternityChildcareAlertIds.clear();
  }

  /**
   * 扶養アラートを読み込む
   */
  async loadSupportAlerts(): Promise<void> {
    this.supportAlerts = [];
    const today = this.getJSTDate();
    today.setHours(0, 0, 0, 0);

    console.log(`[loadSupportAlerts] 開始: 今日=${this.formatDate(today)}, 従業員数=${this.employees.length}`);

    try {
      for (const emp of this.employees) {
        // 従業員の家族情報を取得
        const familyMembers = await this.familyMemberService.getFamilyMembersByEmployeeId(emp.id);
        console.log(`[loadSupportAlerts] 従業員=${emp.name}, 家族数=${familyMembers.length}`);

        for (const member of familyMembers) {
          const birthDate = new Date(member.birthDate);
          birthDate.setHours(0, 0, 0, 0);
          const age = this.familyMemberService.calculateAge(member.birthDate);
          const relationship = member.relationship || '';
          
          console.log(`[loadSupportAlerts] 家族チェック: 従業員=${emp.name}, 家族=${member.name}, 続柄=${relationship}, 生年月日=${member.birthDate}, 現在年齢=${age}`);

          // 【1】配偶者に関するアラート
          if (relationship === '配偶者' || relationship === '妻' || relationship === '夫') {
            // ① 20歳到達（年金加入開始）
            const age20Date = new Date(birthDate.getFullYear() + 20, birthDate.getMonth(), birthDate.getDate());
            age20Date.setHours(0, 0, 0, 0);
            // 20歳到達の1ヶ月前からアラート表示
            const age20AlertStart = new Date(age20Date);
            age20AlertStart.setMonth(age20AlertStart.getMonth() - 1);
            if (today >= age20AlertStart && age >= 19 && age < 21) {
              // 提出期限：事実発生日から5日以内
              const submitDeadline = new Date(age20Date);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
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
                details: `配偶者が20歳になります。国民年金第3号被保険者関係届が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }

            // ② 60歳到達（第3号の終了）
            const age60Date = new Date(birthDate.getFullYear() + 60, birthDate.getMonth(), birthDate.getDate());
            age60Date.setHours(0, 0, 0, 0);
            // 60歳到達の1ヶ月前からアラート表示
            const age60AlertStart = new Date(age60Date);
            age60AlertStart.setMonth(age60AlertStart.getMonth() - 1);
            if (today >= age60AlertStart && age >= 59 && age < 61) {
              // 提出期限：事実発生日から5日以内
              const submitDeadline = new Date(age60Date);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
                id: `spouse_60_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者60歳到達',
                notificationName: '国民年金第3号被保険者資格喪失届',
                alertDate: age60Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が60歳に到達します。国民年金第3号被保険者資格喪失届が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }

            // ③ 収入増加（130万円超または月108,333円超）
            if (member.expectedIncome && member.expectedIncome > 1300000) {
              // 提出期限：収入超過が判明した日から5日以内
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
                id: `spouse_income_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者収入増加',
                notificationName: '被扶養者（異動）削除届・国民年金第3号資格喪失届',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者の収入が扶養基準を超える可能性があります（収入見込: ${member.expectedIncome.toLocaleString('ja-JP')}円）。被扶養者（異動）削除届および国民年金第3号資格喪失届が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }

            // ④ 同居⇒別居の変更
            if (!member.livingTogether) {
              // 扶養削除が必要な場合、提出期限：5日以内
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
                id: `spouse_separate_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者別居',
                notificationName: '被扶養者（異動）削除届（扶養継続不可の場合）',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が別居予定です。別居扶養の要件（仕送り証明）の確認が必要です。扶養継続不可と判断される場合は被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }

            // ⑤ 75歳到達（後期高齢者医療／扶養不可）
            const age75Date = new Date(birthDate.getFullYear() + 75, birthDate.getMonth(), birthDate.getDate());
            age75Date.setHours(0, 0, 0, 0);
            // 75歳到達の1ヶ月前からアラート表示
            const age75AlertStart = new Date(age75Date);
            age75AlertStart.setMonth(age75AlertStart.getMonth() - 1);
            if (today >= age75AlertStart && age >= 74 && age < 76) {
              // 提出期限：75歳到達日から5日以内
              const submitDeadline = new Date(age75Date);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
                id: `spouse_75_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '配偶者75歳到達',
                notificationName: '被扶養者（異動）削除届',
                alertDate: age75Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `配偶者が75歳になります。後期高齢者医療制度へ移行するため、健康保険の扶養から削除が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }
          }

          // 【2】子どもに関するアラート
          if (relationship === '子' || relationship === '長男' || relationship === '長女' || relationship === '次男' || relationship === '次女' || relationship.includes('子')) {
            // ① 18歳到達（高校卒業）
            const age18Year = birthDate.getFullYear() + 18;
            const age18GraduationDate = new Date(age18Year, 2, 31); // 3月31日（年度末）
            age18GraduationDate.setHours(0, 0, 0, 0);
            // 18歳到達年度末の1ヶ月前からアラート表示
            const age18AlertStart = new Date(age18GraduationDate);
            age18AlertStart.setMonth(age18AlertStart.getMonth() - 1);
            if (today >= age18AlertStart && age >= 17 && age < 19) {
              // 18歳到達は届出不要（提出期限なし）
              this.supportAlerts.push({
                id: `child_18_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子18歳到達',
                notificationName: '扶養見直し（届出不要）',
                alertDate: age18GraduationDate,
                details: `子が18歳に到達します（高校卒業予定: ${age18Year}年3月31日）。進学・就労有無による扶養見直しが必要です（届出不要）。`,
              });
            }

            // ② 20歳到達（国民年金加入開始）
            const age20Date = new Date(birthDate.getFullYear() + 20, birthDate.getMonth(), birthDate.getDate());
            age20Date.setHours(0, 0, 0, 0);
            // 20歳到達の1ヶ月前からアラート表示
            const age20AlertStart = new Date(age20Date);
            age20AlertStart.setMonth(age20AlertStart.getMonth() - 1);
            
            console.log(`[loadSupportAlerts] 子20歳到達チェック: 従業員=${emp.name}, 家族=${member.name}, 生年月日=${member.birthDate}, 現在年齢=${age}, 20歳到達日=${this.formatDate(age20Date)}, アラート開始日=${this.formatDate(age20AlertStart)}, 今日=${this.formatDate(today)}, 条件1=${today >= age20AlertStart}, 条件2=${age >= 19 && age < 21}`);
            
            if (today >= age20AlertStart && age >= 19 && age < 21) {
              // 提出期限：事実発生日から5日以内
              const submitDeadline = new Date(age20Date);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              console.log(`[loadSupportAlerts] 子20歳到達アラート追加: ${member.name}, 提出期限=${this.formatDate(submitDeadline)}, 残り日数=${daysUntilDeadline}`);
              
              this.supportAlerts.push({
                id: `child_20_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子20歳到達',
                notificationName: '国民年金第2号被保険者関係届（学生の場合）',
                alertDate: age20Date,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子が20歳になります。国民年金の加入が必要です（本人手続き）。学生は「学生納付特例」の申請が必要です。就労する場合は扶養見直しが必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }

            // ③ 22歳到達（大学卒業＋収入増の可能性）
            const age22Year = birthDate.getFullYear() + 22;
            const age22GraduationDate = new Date(age22Year, 2, 31); // 3月31日（年度末）
            age22GraduationDate.setHours(0, 0, 0, 0);
            // 22歳到達年度末の1ヶ月前からアラート表示
            const age22AlertStart = new Date(age22GraduationDate);
            age22AlertStart.setMonth(age22AlertStart.getMonth() - 1);
            if (today >= age22AlertStart && age >= 21 && age < 23) {
              // 扶養外れる場合、提出期限：扶養要件喪失から5日以内
              const submitDeadline = new Date(age22GraduationDate);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
                id: `child_22_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '子22歳到達',
                notificationName: '被扶養者（異動）削除届（扶養外れる場合）',
                alertDate: age22GraduationDate,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `子が22歳に到達します（大学卒業予定: ${age22Year}年3月31日）。就職して厚生年金加入する場合、扶養外れるため被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }

            // ④ 同居→別居（実家・一人暮らし）
            if (!member.livingTogether) {
              // 仕送りがない場合、提出期限：5日以内
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
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
                details: `子が別居します。別居扶養の要件（仕送り）が必要です。仕送りがない場合は被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }

            // ⑤ アルバイト収入の増減（130万円基準）
            if (member.expectedIncome && member.expectedIncome > 1300000) {
              // 提出期限：収入超過が判明して5日以内
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
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
                details: `子の収入が扶養基準を超過する可能性があります（収入見込: ${member.expectedIncome.toLocaleString('ja-JP')}円）。被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }
          }

          // 【3】自分の両親（高齢者扶養）に関するアラート
          if (relationship === '父' || relationship === '母' || relationship === '父母' || relationship.includes('父') || relationship.includes('母')) {
            // ① 60歳以上の親の所得増減
            if (age >= 60) {
              // 収入見込が設定されている場合、扶養基準を超えていないか確認
              if (member.expectedIncome && member.expectedIncome > 1300000) {
                this.supportAlerts.push({
                  id: `parent_income_${emp.id}_${member.id}`,
                  employeeId: emp.id,
                  employeeName: emp.name,
                  familyMemberId: member.id || '',
                  familyMemberName: member.name,
                  relationship: relationship,
                  alertType: '親収入見直し',
                  notificationName: '扶養基準確認',
                  alertDate: today,
                  details: `親の収入見直しが必要です（収入見込: ${member.expectedIncome.toLocaleString('ja-JP')}円）。扶養基準に該当するか確認してください。`,
                });
              }
            }

            // ② 同居→別居
            if (!member.livingTogether) {
              // 仕送りがない場合、提出期限：5日以内
              const submitDeadline = new Date(today);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
                id: `parent_separate_${emp.id}_${member.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                familyMemberId: member.id || '',
                familyMemberName: member.name,
                relationship: relationship,
                alertType: '親別居',
                notificationName: '被扶養者（異動）削除届（仕送りがない場合）',
                alertDate: today,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `親が別居します。別居扶養の条件（仕送り）が必要です。仕送りがない場合は被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }

            // ③ 75歳到達（後期高齢者医療へ切替）
            const age75Date = new Date(birthDate.getFullYear() + 75, birthDate.getMonth(), birthDate.getDate());
            age75Date.setHours(0, 0, 0, 0);
            // 75歳到達の1ヶ月前からアラート表示
            const age75AlertStart = new Date(age75Date);
            age75AlertStart.setMonth(age75AlertStart.getMonth() - 1);
            if (today >= age75AlertStart && age >= 74 && age < 76) {
              // 提出期限：75歳到達日から5日以内
              const submitDeadline = new Date(age75Date);
              submitDeadline.setDate(submitDeadline.getDate() + 5);
              const daysUntilDeadline = Math.ceil((submitDeadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              
              this.supportAlerts.push({
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
                details: `親が75歳になります。後期高齢者医療制度へ移行します。被扶養者（異動）削除届が必要です（提出期限: ${this.formatDate(submitDeadline)}）。`,
              });
            }
          }
        }
      }

      // アラート日でソート（新しい順）
      this.supportAlerts.sort((a, b) => {
        return b.alertDate.getTime() - a.alertDate.getTime();
      });
    } catch (error) {
      console.error('[alerts-dashboard] loadSupportAlertsエラー:', error);
    }
  }

  // 扶養アラートの選択管理
  toggleSupportAlertSelection(alertId: string): void {
    if (this.selectedSupportAlertIds.has(alertId)) {
      this.selectedSupportAlertIds.delete(alertId);
    } else {
      this.selectedSupportAlertIds.add(alertId);
    }
  }

  toggleAllSupportAlerts(checked: boolean): void {
    if (checked) {
      this.supportAlerts.forEach(alert => {
        this.selectedSupportAlertIds.add(alert.id);
      });
    } else {
      this.selectedSupportAlertIds.clear();
    }
  }

  toggleAllSupportAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleAllSupportAlerts(target.checked);
  }

  isSupportAlertSelected(alertId: string): boolean {
    return this.selectedSupportAlertIds.has(alertId);
  }

  // 扶養アラートの削除
  async deleteSelectedSupportAlerts(): Promise<void> {
    const selectedIds = Array.from(this.selectedSupportAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の扶養アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 選択されたアラートを配列から削除
    this.supportAlerts = this.supportAlerts.filter(
      alert => !selectedIds.includes(alert.id)
    );
    this.selectedSupportAlertIds.clear();
  }
}

