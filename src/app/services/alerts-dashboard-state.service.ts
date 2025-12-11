import { Injectable } from '@angular/core';
import { SuijiKouhoResultWithDiff } from '../features/alerts-dashboard/tabs/alert-suiji-tab/alert-suiji-tab.component';
import { TeijiKetteiResultData } from '../features/alerts-dashboard/tabs/alert-teiji-tab/alert-teiji-tab.component';
import {
  AgeAlert,
  QualificationChangeAlert,
} from '../features/alerts-dashboard/tabs/alert-age-tab/alert-age-tab.component';
import { MaternityChildcareAlert } from '../features/alerts-dashboard/tabs/alert-leave-tab/alert-leave-tab.component';
import { SupportAlert } from '../features/alerts-dashboard/tabs/alert-family-tab/alert-family-tab.component';
import { BonusReportAlert } from '../features/alerts-dashboard/tabs/alert-bonus-tab/alert-bonus-tab.component';
import { AlertItem } from './alert-generation.service';
import { AlertAggregationService } from './alert-aggregation.service';
import { UncollectedPremium } from '../models/uncollected-premium.model';
import { getJSTDate } from '../utils/alerts-helper';

@Injectable({
  providedIn: 'root',
})
export class AlertsDashboardStateService {
  activeTab:
    | 'schedule'
    | 'bonus'
    | 'suiji'
    | 'teiji'
    | 'age'
    | 'leave'
    | 'family'
    | 'uncollected' = 'schedule';

  // 届出スケジュール（カレンダー）関連
  scheduleYear: number = getJSTDate().getFullYear();
  scheduleMonth: number = getJSTDate().getMonth() + 1; // 1-12
  scheduleData: {
    [dateKey: string]: {
      // YYYY-MM-DD形式
      [tabName: string]: number; // タブ名: 件数
    };
  } = {};

  // 賞与支払届アラート関連
  bonusReportAlerts: BonusReportAlert[] = [];
  selectedBonusReportAlertIds: Set<string> = new Set();

  // 年度選択関連（算定決定タブ用）
  teijiYear: number = getJSTDate().getFullYear();
  availableYears: number[] = [];

  // 随時改定アラート関連
  suijiAlerts: SuijiKouhoResultWithDiff[] = [];
  selectedSuijiAlertIds: Set<string> = new Set();

  // 届出アラート関連
  notificationAlerts: AlertItem[] = [];
  selectedNotificationAlertIds: Set<string> = new Set();

  // 算定決定タブ関連
  teijiKetteiResults: TeijiKetteiResultData[] = [];
  selectedTeijiAlertIds: Set<string> = new Set();

  // 年齢到達アラート関連
  ageAlerts: AgeAlert[] = [];
  selectedAgeAlertIds: Set<string> = new Set();

  // 資格変更アラート関連
  qualificationChangeAlerts: QualificationChangeAlert[] = [];
  selectedQualificationChangeAlertIds: Set<string> = new Set();

  // 産休育休アラート関連
  maternityChildcareAlerts: MaternityChildcareAlert[] = [];
  selectedMaternityChildcareAlertIds: Set<string> = new Set();

  // 扶養アラート関連
  supportAlerts: SupportAlert[] = [];
  selectedSupportAlertIds: Set<string> = new Set();

  // 徴収不能アラート関連
  uncollectedPremiums: UncollectedPremium[] = [];

  constructor(private alertAggregationService: AlertAggregationService) {}

  /**
   * タブの色を取得
   */
  getTabColor(tabId: string): string {
    const colorMap: { [key: string]: string } = {
      schedule: '#6c757d',
      bonus: '#007bff',
      suiji: '#28a745',
      teiji: '#ffc107',
      age: '#dc3545',
      leave: '#17a2b8',
      family: '#6f42c1',
      uncollected: '#e91e63',
      payment: '#ff7043',
    };
    return colorMap[tabId] || '#6c757d';
  }

  /**
   * 届出スケジュールデータを更新
   */
  updateScheduleData(): void {
    this.scheduleData = this.alertAggregationService.aggregateScheduleData(
      this.bonusReportAlerts,
      this.suijiAlerts,
      this.notificationAlerts,
      this.ageAlerts,
      this.qualificationChangeAlerts,
      this.maternityChildcareAlerts,
      this.supportAlerts,
      this.teijiKetteiResults,
      this.uncollectedPremiums
    );
  }

  // 賞与支払届アラートのイベントハンドラ
  onBonusAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (event.selected) {
      this.selectedBonusReportAlertIds.add(event.alertId);
    } else {
      this.selectedBonusReportAlertIds.delete(event.alertId);
    }
  }

  onBonusSelectAllChange(checked: boolean): void {
    if (checked) {
      this.bonusReportAlerts.forEach((alert) => {
        this.selectedBonusReportAlertIds.add(alert.id);
      });
    } else {
      this.selectedBonusReportAlertIds.clear();
    }
  }

  deleteSelectedBonusReportAlerts(): void {
    const selectedIds = Array.from(this.selectedBonusReportAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の賞与支払届アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    this.bonusReportAlerts = this.bonusReportAlerts.filter(
      (alert) => !selectedIds.includes(alert.id)
    );
    this.selectedBonusReportAlertIds.clear();
    this.updateScheduleData();
  }

  // 随時改定アラートのイベントハンドラ
  onSuijiAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (event.selected) {
      this.selectedSuijiAlertIds.add(event.alertId);
    } else {
      this.selectedSuijiAlertIds.delete(event.alertId);
    }
  }

  onSuijiSelectAllChange(
    checked: boolean,
    getSuijiAlertId: (alert: SuijiKouhoResultWithDiff) => string
  ): void {
    if (checked) {
      this.suijiAlerts.forEach((alert) => {
        const alertId = getSuijiAlertId(alert);
        this.selectedSuijiAlertIds.add(alertId);
      });
    } else {
      this.selectedSuijiAlertIds.clear();
    }
  }

  deleteSelectedSuijiAlerts(
    getSuijiAlertId: (alert: SuijiKouhoResultWithDiff) => string
  ): void {
    const selectedIds = Array.from(this.selectedSuijiAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の随時改定アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    this.suijiAlerts = this.suijiAlerts.filter(
      (alert) => !selectedIds.includes(getSuijiAlertId(alert))
    );
    this.selectedSuijiAlertIds.clear();
    this.updateScheduleData();
  }

  // 算定基礎届アラートのイベントハンドラ
  onTeijiAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (event.selected) {
      this.selectedTeijiAlertIds.add(event.alertId);
    } else {
      this.selectedTeijiAlertIds.delete(event.alertId);
    }
  }

  onTeijiSelectAllChange(
    checked: boolean,
    getTeijiAlertId: (result: TeijiKetteiResultData) => string
  ): void {
    if (checked) {
      this.teijiKetteiResults.forEach((result) => {
        const alertId = getTeijiAlertId(result);
        this.selectedTeijiAlertIds.add(alertId);
      });
    } else {
      this.selectedTeijiAlertIds.clear();
    }
  }

  deleteSelectedTeijiAlerts(): void {
    const selectedIds = Array.from(this.selectedTeijiAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の算定基礎届アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    this.teijiKetteiResults = this.teijiKetteiResults.filter(
      (result) => !selectedIds.includes(result.employeeId)
    );
    this.selectedTeijiAlertIds.clear();
    this.updateScheduleData();
  }

  // 年齢到達アラートのイベントハンドラ
  onAgeAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (event.selected) {
      this.selectedAgeAlertIds.add(event.alertId);
    } else {
      this.selectedAgeAlertIds.delete(event.alertId);
    }
  }

  onAgeSelectAllChange(checked: boolean): void {
    if (checked) {
      this.ageAlerts.forEach((alert) => {
        this.selectedAgeAlertIds.add(alert.id);
      });
    } else {
      this.selectedAgeAlertIds.clear();
    }
  }

  deleteSelectedAgeAlerts(): void {
    const selectedIds = Array.from(this.selectedAgeAlertIds);
    if (selectedIds.length === 0) {
      return;
    }
    this.ageAlerts = this.ageAlerts.filter(
      (alert) => !selectedIds.includes(alert.id)
    );
    this.selectedAgeAlertIds.clear();
    this.updateScheduleData();
  }

  // 資格変更アラートのイベントハンドラ
  onQualificationChangeAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (event.selected) {
      this.selectedQualificationChangeAlertIds.add(event.alertId);
    } else {
      this.selectedQualificationChangeAlertIds.delete(event.alertId);
    }
  }

  onQualificationChangeSelectAllChange(checked: boolean): void {
    if (checked) {
      this.qualificationChangeAlerts.forEach((alert) => {
        this.selectedQualificationChangeAlertIds.add(alert.id);
      });
    } else {
      this.selectedQualificationChangeAlertIds.clear();
    }
  }

  deleteSelectedQualificationChangeAlerts(): void {
    const selectedIds = Array.from(this.selectedQualificationChangeAlertIds);
    if (selectedIds.length === 0) {
      return;
    }
    this.qualificationChangeAlerts = this.qualificationChangeAlerts.filter(
      (alert) => !selectedIds.includes(alert.id)
    );
    this.selectedQualificationChangeAlertIds.clear();
    this.updateScheduleData();
  }

  // 産休育休アラートのイベントハンドラ
  onMaternityChildcareAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (event.selected) {
      this.selectedMaternityChildcareAlertIds.add(event.alertId);
    } else {
      this.selectedMaternityChildcareAlertIds.delete(event.alertId);
    }
  }

  onMaternityChildcareSelectAllChange(checked: boolean): void {
    if (checked) {
      this.maternityChildcareAlerts.forEach((alert) => {
        this.selectedMaternityChildcareAlertIds.add(alert.id);
      });
    } else {
      this.selectedMaternityChildcareAlertIds.clear();
    }
  }

  deleteSelectedMaternityChildcareAlerts(): void {
    const selectedIds = Array.from(this.selectedMaternityChildcareAlertIds);
    if (selectedIds.length === 0) {
      return;
    }
    this.maternityChildcareAlerts = this.maternityChildcareAlerts.filter(
      (alert) => !selectedIds.includes(alert.id)
    );
    this.selectedMaternityChildcareAlertIds.clear();
    this.updateScheduleData();
  }

  // 扶養アラートのイベントハンドラ
  onSupportAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (event.selected) {
      this.selectedSupportAlertIds.add(event.alertId);
    } else {
      this.selectedSupportAlertIds.delete(event.alertId);
    }
  }

  onSupportSelectAllChange(checked: boolean): void {
    if (checked) {
      this.supportAlerts.forEach((alert) => {
        this.selectedSupportAlertIds.add(alert.id);
      });
    } else {
      this.selectedSupportAlertIds.clear();
    }
  }

  deleteSelectedSupportAlerts(): void {
    const selectedIds = Array.from(this.selectedSupportAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の扶養アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    this.supportAlerts = this.supportAlerts.filter(
      (alert) => !selectedIds.includes(alert.id)
    );
    this.selectedSupportAlertIds.clear();
    this.updateScheduleData();
  }

  // スケジュールタブのイベントハンドラ
  onScheduleMonthChange(month: number): void {
    this.scheduleMonth = month;
  }

  onScheduleYearChange(year: number): void {
    this.scheduleYear = year;
  }
}
