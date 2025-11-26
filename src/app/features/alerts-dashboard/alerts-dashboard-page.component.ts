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
import { SuijiKouhoResult } from '../../services/salary-calculation.service';
import { NotificationDecisionResult } from '../../services/notification-decision.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';

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
  activeTab: 'suiji' | 'notifications' = 'suiji';
  
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

  constructor(
    private suijiService: SuijiService,
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private notificationCalculationService: NotificationCalculationService,
    private notificationFormatService: NotificationFormatService,
    private settingsService: SettingsService,
    private bonusService: BonusService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    
    // 全年度の給与データを読み込み
    await this.loadAllSalaries();
    
    // 全年度のアラートを読み込み
    await this.loadSuijiAlerts();
    await this.loadNotificationAlerts();
    
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
    const currentYear = new Date().getFullYear();
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

  setActiveTab(tab: 'suiji' | 'notifications'): void {
    this.activeTab = tab;
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
}

