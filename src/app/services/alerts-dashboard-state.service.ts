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
   * タブの色を取得（視認性向上のため、カレンダー用に少し濃い色を返す）
   */
  getTabColor(tabId: string): string {
    const colorMap: { [key: string]: string } = {
      schedule: '#6c757d',
      bonus: '#0056b3', // より濃い青
      suiji: '#1e7e34', // より濃い緑
      teiji: '#ffc107', // 明るい黄色（UI的にポジティブな印象）
      age: '#c82333', // より濃い赤
      leave: '#138496', // より濃いシアン
      family: '#5a32a3', // より濃い紫
      uncollected: '#c2185b', // より濃いピンク
      payment: '#e64a19', // より濃いオレンジ/赤
    };
    return colorMap[tabId] || '#6c757d';
  }

  /**
   * 届出スケジュールデータを更新
   */
  updateScheduleData(): void {
    // scheduleYearのバリデーション
    const targetYear = this.scheduleYear && !isNaN(this.scheduleYear) && this.scheduleYear >= 1900 && this.scheduleYear <= 2100
      ? this.scheduleYear
      : getJSTDate().getFullYear();
    
    this.scheduleData = this.alertAggregationService.aggregateScheduleData(
      this.bonusReportAlerts || [],
      this.suijiAlerts || [],
      this.notificationAlerts || [],
      this.ageAlerts || [],
      this.qualificationChangeAlerts || [],
      this.maternityChildcareAlerts || [],
      this.supportAlerts || [],
      this.teijiKetteiResults || [],
      this.uncollectedPremiums || [],
      [targetYear]
    );
  }

  // 賞与支払届アラートのイベントハンドラ
  onBonusAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (!event || !event.alertId) {
      return;
    }
    if (!this.selectedBonusReportAlertIds) {
      this.selectedBonusReportAlertIds = new Set();
    }
    if (event.selected) {
      this.selectedBonusReportAlertIds.add(event.alertId);
    } else {
      this.selectedBonusReportAlertIds.delete(event.alertId);
    }
  }

  onBonusSelectAllChange(checked: boolean): void {
    if (!this.selectedBonusReportAlertIds) {
      this.selectedBonusReportAlertIds = new Set();
    }
    if (!this.bonusReportAlerts || !Array.isArray(this.bonusReportAlerts)) {
      if (!checked) {
        this.selectedBonusReportAlertIds.clear();
      }
      return;
    }
    if (checked) {
      this.bonusReportAlerts.forEach((alert) => {
        if (alert && alert.id) {
          this.selectedBonusReportAlertIds.add(alert.id);
        }
      });
    } else {
      this.selectedBonusReportAlertIds.clear();
    }
  }

  deleteSelectedBonusReportAlerts(): void {
    if (!this.selectedBonusReportAlertIds || this.selectedBonusReportAlertIds.size === 0) {
      return;
    }
    if (!this.bonusReportAlerts || !Array.isArray(this.bonusReportAlerts)) {
      this.selectedBonusReportAlertIds.clear();
      return;
    }
    const selectedIds = Array.from(this.selectedBonusReportAlertIds);
    this.bonusReportAlerts = this.bonusReportAlerts.filter(
      (alert) => alert && !selectedIds.includes(alert.id)
    );
    this.selectedBonusReportAlertIds.clear();
    this.updateScheduleData();
  }

  // 随時改定アラートのイベントハンドラ
  onSuijiAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (!event || !event.alertId) {
      return;
    }
    if (!this.selectedSuijiAlertIds) {
      this.selectedSuijiAlertIds = new Set();
    }
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
    if (!this.selectedSuijiAlertIds) {
      this.selectedSuijiAlertIds = new Set();
    }
    if (!this.suijiAlerts || !Array.isArray(this.suijiAlerts)) {
      if (!checked) {
        this.selectedSuijiAlertIds.clear();
      }
      return;
    }
    if (checked) {
      this.suijiAlerts.forEach((alert) => {
        if (alert) {
          const alertId = getSuijiAlertId(alert);
          if (alertId) {
            this.selectedSuijiAlertIds.add(alertId);
          }
        }
      });
    } else {
      this.selectedSuijiAlertIds.clear();
    }
  }

  deleteSelectedSuijiAlerts(
    getSuijiAlertId: (alert: SuijiKouhoResultWithDiff) => string
  ): void {
    if (!this.selectedSuijiAlertIds || this.selectedSuijiAlertIds.size === 0) {
      return;
    }
    if (!this.suijiAlerts || !Array.isArray(this.suijiAlerts)) {
      this.selectedSuijiAlertIds.clear();
      return;
    }
    const selectedIds = Array.from(this.selectedSuijiAlertIds);
    this.suijiAlerts = this.suijiAlerts.filter(
      (alert) => alert && !selectedIds.includes(getSuijiAlertId(alert))
    );
    this.selectedSuijiAlertIds.clear();
    this.updateScheduleData();
  }

  // 算定基礎届アラートのイベントハンドラ
  onTeijiAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (!event || !event.alertId) {
      return;
    }
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
    if (!this.teijiKetteiResults || !Array.isArray(this.teijiKetteiResults)) {
      return;
    }
    if (checked) {
      this.teijiKetteiResults.forEach((result) => {
        if (result) {
          const alertId = getTeijiAlertId(result);
          if (alertId) {
            this.selectedTeijiAlertIds.add(alertId);
          }
        }
      });
    } else {
      this.selectedTeijiAlertIds.clear();
    }
  }

  deleteSelectedTeijiAlerts(): void {
    if (!this.selectedTeijiAlertIds) {
      return;
    }
    const selectedIds = Array.from(this.selectedTeijiAlertIds);
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `選択した${selectedIds.length}件の算定基礎届アラートを削除しますか？`;
    if (!confirm(confirmMessage)) {
      return;
    }

    if (this.teijiKetteiResults && Array.isArray(this.teijiKetteiResults)) {
      this.teijiKetteiResults = this.teijiKetteiResults.filter(
        (result) => result && result.employeeId && !selectedIds.includes(result.employeeId)
      );
    }
    this.selectedTeijiAlertIds.clear();
    this.updateScheduleData();
  }

  // 年齢到達アラートのイベントハンドラ
  onAgeAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (!event || !event.alertId) {
      return;
    }
    if (event.selected) {
      this.selectedAgeAlertIds.add(event.alertId);
    } else {
      this.selectedAgeAlertIds.delete(event.alertId);
    }
  }

  onAgeSelectAllChange(checked: boolean): void {
    if (!this.ageAlerts || !Array.isArray(this.ageAlerts)) {
      return;
    }
    if (checked) {
      this.ageAlerts.forEach((alert) => {
        if (alert && alert.id) {
          this.selectedAgeAlertIds.add(alert.id);
        }
      });
    } else {
      this.selectedAgeAlertIds.clear();
    }
  }

  deleteSelectedAgeAlerts(): void {
    if (!this.selectedAgeAlertIds) {
      return;
    }
    const selectedIds = Array.from(this.selectedAgeAlertIds);
    if (selectedIds.length === 0) {
      return;
    }
    if (this.ageAlerts && Array.isArray(this.ageAlerts)) {
      this.ageAlerts = this.ageAlerts.filter(
        (alert) => alert && alert.id && !selectedIds.includes(alert.id)
      );
    }
    this.selectedAgeAlertIds.clear();
    this.updateScheduleData();
  }

  // 資格変更アラートのイベントハンドラ
  onQualificationChangeAlertSelectionChange(event: {
    alertId: string;
    selected: boolean;
  }): void {
    if (!event || !event.alertId) {
      return;
    }
    if (event.selected) {
      this.selectedQualificationChangeAlertIds.add(event.alertId);
    } else {
      this.selectedQualificationChangeAlertIds.delete(event.alertId);
    }
  }

  onQualificationChangeSelectAllChange(checked: boolean): void {
    if (!this.qualificationChangeAlerts || !Array.isArray(this.qualificationChangeAlerts)) {
      return;
    }
    if (checked) {
      this.qualificationChangeAlerts.forEach((alert) => {
        if (alert && alert.id) {
          this.selectedQualificationChangeAlertIds.add(alert.id);
        }
      });
    } else {
      this.selectedQualificationChangeAlertIds.clear();
    }
  }

  deleteSelectedQualificationChangeAlerts(): void {
    if (!this.selectedQualificationChangeAlertIds) {
      return;
    }
    const selectedIds = Array.from(this.selectedQualificationChangeAlertIds);
    if (selectedIds.length === 0) {
      return;
    }
    if (this.qualificationChangeAlerts && Array.isArray(this.qualificationChangeAlerts)) {
      this.qualificationChangeAlerts = this.qualificationChangeAlerts.filter(
        (alert) => alert && alert.id && !selectedIds.includes(alert.id)
      );
    }
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
    // 月が変更された場合もスケジュールデータを更新（カレンダー表示のため）
    this.updateScheduleData();
  }

  onScheduleYearChange(year: number): void {
    this.scheduleYear = year;
    this.updateScheduleData();
  }
}
