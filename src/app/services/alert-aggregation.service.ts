import { Injectable } from '@angular/core';
import { BonusReportAlert } from '../features/alerts-dashboard/tabs/alert-bonus-tab/alert-bonus-tab.component';
import { SuijiKouhoResultWithDiff } from '../features/alerts-dashboard/tabs/alert-suiji-tab/alert-suiji-tab.component';
import { TeijiKetteiResultData } from '../features/alerts-dashboard/tabs/alert-teiji-tab/alert-teiji-tab.component';
import {
  AgeAlert,
  QualificationChangeAlert,
} from '../features/alerts-dashboard/tabs/alert-age-tab/alert-age-tab.component';
import { MaternityChildcareAlert } from '../features/alerts-dashboard/tabs/alert-leave-tab/alert-leave-tab.component';
import { SupportAlert } from '../features/alerts-dashboard/tabs/alert-family-tab/alert-family-tab.component';
import { AlertItem } from './alert-generation.service';
import { UncollectedPremium } from '../models/uncollected-premium.model';
import { getJSTDate } from '../utils/alerts-helper';

export interface ScheduleData {
  [dateKey: string]: {
    // YYYY-MM-DD形式
    [tabName: string]: number; // タブ名: 件数
  };
}

export interface AlertSets {
  bonusReportAlerts: BonusReportAlert[];
  suijiAlerts: SuijiKouhoResultWithDiff[];
  teijiKetteiResults: TeijiKetteiResultData[];
  ageAlerts: AgeAlert[];
  qualificationChangeAlerts: QualificationChangeAlert[];
  maternityChildcareAlerts: MaternityChildcareAlert[];
  supportAlerts: SupportAlert[];
}

@Injectable({
  providedIn: 'root',
})
export class AlertAggregationService {
  /**
   * 各タブのアラートデータを集約してスケジュールデータを生成（個別パラメータ版）
   */
  aggregateScheduleData(
    bonusAlerts: BonusReportAlert[],
    suijiAlerts: SuijiKouhoResultWithDiff[],
    notificationAlerts: AlertItem[],
    ageAlerts: AgeAlert[],
    qualificationChangeAlerts: QualificationChangeAlert[],
    maternityChildcareAlerts: MaternityChildcareAlert[],
    supportAlerts: SupportAlert[],
    teijiKetteiResults: TeijiKetteiResultData[],
    uncollectedPremiums: UncollectedPremium[] = []
  ): ScheduleData {
    const scheduleData: ScheduleData = {};
    const yearsForFixedEvents = new Set<number>();

    // 賞与支払届アラート
    for (const alert of bonusAlerts) {
      const dateKey = this.formatDateKey(alert.submitDeadline);
      yearsForFixedEvents.add(alert.submitDeadline.getFullYear());
      if (!scheduleData[dateKey]) {
        scheduleData[dateKey] = {};
      }
      if (!scheduleData[dateKey]['賞与支払届']) {
        scheduleData[dateKey]['賞与支払届'] = 0;
      }
      scheduleData[dateKey]['賞与支払届']++;
    }

    // 随時改定アラート
    for (const alert of suijiAlerts) {
      if (alert.isEligible && alert.applyStartMonth) {
        const deadline = this.getSuijiReportDeadlineDate(alert);
        if (deadline) {
          const dateKey = this.formatDateKey(deadline);
          yearsForFixedEvents.add(deadline.getFullYear());
          if (!scheduleData[dateKey]) {
            scheduleData[dateKey] = {};
          }
          if (!scheduleData[dateKey]['随時改定アラート']) {
            scheduleData[dateKey]['随時改定アラート'] = 0;
          }
          scheduleData[dateKey]['随時改定アラート']++;
        }
      }
    }

    // 定時決定（算定基礎届）- 7月10日
    const currentYear = getJSTDate().getFullYear();
    const teijiDeadline = new Date(currentYear, 6, 10); // 7月10日
    const teijiDateKey = this.formatDateKey(teijiDeadline);
    yearsForFixedEvents.add(teijiDeadline.getFullYear());
    if (!scheduleData[teijiDateKey]) {
      scheduleData[teijiDateKey] = {};
    }
    if (teijiKetteiResults.length > 0) {
      scheduleData[teijiDateKey]['定時決定（算定基礎届）'] =
        teijiKetteiResults.length;
    }

    // 年齢到達アラート
    for (const alert of ageAlerts) {
      const dateKey = this.formatDateKey(alert.submitDeadline);
      yearsForFixedEvents.add(alert.submitDeadline.getFullYear());
      if (!scheduleData[dateKey]) {
        scheduleData[dateKey] = {};
      }
      if (!scheduleData[dateKey]['年齢到達・資格変更']) {
        scheduleData[dateKey]['年齢到達・資格変更'] = 0;
      }
      scheduleData[dateKey]['年齢到達・資格変更']++;
    }

    // 資格変更アラート
    for (const alert of qualificationChangeAlerts) {
      const dateKey = this.formatDateKey(alert.submitDeadline);
      yearsForFixedEvents.add(alert.submitDeadline.getFullYear());
      if (!scheduleData[dateKey]) {
        scheduleData[dateKey] = {};
      }
      if (!scheduleData[dateKey]['年齢到達・資格変更']) {
        scheduleData[dateKey]['年齢到達・資格変更'] = 0;
      }
      scheduleData[dateKey]['年齢到達・資格変更']++;
    }

    // 産休・育休・休職アラート
    for (const alert of maternityChildcareAlerts) {
      const dateKey = this.formatDateKey(alert.submitDeadline);
      yearsForFixedEvents.add(alert.submitDeadline.getFullYear());
      if (!scheduleData[dateKey]) {
        scheduleData[dateKey] = {};
      }
      if (!scheduleData[dateKey]['産休・育休・休職']) {
        scheduleData[dateKey]['産休・育休・休職'] = 0;
      }
      scheduleData[dateKey]['産休・育休・休職']++;
    }

    // 扶養アラート
    for (const alert of supportAlerts) {
      if (alert.submitDeadline) {
        const dateKey = this.formatDateKey(alert.submitDeadline);
        yearsForFixedEvents.add(alert.submitDeadline.getFullYear());
        if (!scheduleData[dateKey]) {
          scheduleData[dateKey] = {};
        }
        if (!scheduleData[dateKey]['扶養・氏名・住所変更']) {
          scheduleData[dateKey]['扶養・氏名・住所変更'] = 0;
        }
        scheduleData[dateKey]['扶養・氏名・住所変更']++;
      }
    }

    // 徴収不能アラート - 毎月1日に表示（提出期限の概念がないため）
    // 徴収不能額を年月ごとに集計
    const uncollectedByMonth = new Map<string, number>(); // key: "YYYY-MM", value: 件数
    for (const premium of uncollectedPremiums) {
      if (!premium.resolved && premium.amount > 0) {
        const monthKey = `${premium.year}-${String(premium.month).padStart(
          2,
          '0'
        )}`;
        uncollectedByMonth.set(
          monthKey,
          (uncollectedByMonth.get(monthKey) || 0) + 1
        );
      }
    }

    // 毎月1日に件数を設定
    for (const [monthKey, count] of uncollectedByMonth.entries()) {
      const [year, month] = monthKey.split('-').map(Number);
      const dateKey = this.formatDateKey(new Date(year, month - 1, 1)); // 毎月1日
      yearsForFixedEvents.add(year);
      if (!scheduleData[dateKey]) {
        scheduleData[dateKey] = {};
      }
      scheduleData[dateKey]['徴収不能'] = count;
    }

    // 前月分の社会保険料納付期限（毎月末日）- 対象年を広げて反映
    if (yearsForFixedEvents.size === 0) {
      yearsForFixedEvents.add(currentYear);
    }
    for (const year of yearsForFixedEvents) {
      for (let month = 1; month <= 12; month++) {
        // 月末日を取得（翌月0日）
        const lastDay = new Date(year, month, 0);
        const dateKey = this.formatDateKey(lastDay);
        if (!scheduleData[dateKey]) {
          scheduleData[dateKey] = {};
        }
        if (!scheduleData[dateKey]['前月分の社会保険料納付期限']) {
          scheduleData[dateKey]['前月分の社会保険料納付期限'] = 0;
        }
        scheduleData[dateKey]['前月分の社会保険料納付期限']++;
      }
    }

    return scheduleData;
  }

  /**
   * 日付をYYYY-MM-DD形式のキーに変換
   */
  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 随時改定の届出提出期日をDateオブジェクトで取得
   * 適用開始月の7日が提出期日
   * 変動月+3ヶ月後が適用開始月なので、変動月が4月の場合、適用開始月は7月になる
   */
  private getSuijiReportDeadlineDate(
    alert: SuijiKouhoResultWithDiff
  ): Date | null {
    if (!alert.applyStartMonth || !alert.changeMonth) {
      return null;
    }

    const changeYear = alert.year || getJSTDate().getFullYear();
    const changeMonth = alert.changeMonth;

    // 適用開始月を変動月から再計算（変動月+3ヶ月後）
    const applyStartMonthRaw = changeMonth + 3;

    // 適用開始月の年度を計算
    let applyStartYear = changeYear;
    let applyStartMonth = applyStartMonthRaw;
    if (applyStartMonthRaw > 12) {
      applyStartMonth = applyStartMonthRaw - 12;
      applyStartYear = changeYear + 1;
    }

    // 適用開始月の7日を提出期日とする
    const deadlineDate = new Date(applyStartYear, applyStartMonth - 1, 7); // 月は0ベースなので-1

    return deadlineDate;
  }
}
