import { Injectable } from '@angular/core';
import { BonusReportAlert } from '../features/alerts-dashboard/tabs/alert-bonus-tab/alert-bonus-tab.component';
import { SuijiKouhoResultWithDiff } from '../features/alerts-dashboard/tabs/alert-suiji-tab/alert-suiji-tab.component';
import { TeijiKetteiResultData } from '../features/alerts-dashboard/tabs/alert-teiji-tab/alert-teiji-tab.component';
import { AgeAlert, QualificationChangeAlert } from '../features/alerts-dashboard/tabs/alert-age-tab/alert-age-tab.component';
import { MaternityChildcareAlert } from '../features/alerts-dashboard/tabs/alert-leave-tab/alert-leave-tab.component';
import { SupportAlert } from '../features/alerts-dashboard/tabs/alert-family-tab/alert-family-tab.component';
import { AlertItem } from './alert-generation.service';
import { getJSTDate } from '../utils/alerts-helper';

export interface ScheduleData {
  [dateKey: string]: { // YYYY-MM-DD形式
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
  providedIn: 'root'
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
    teijiKetteiResults: TeijiKetteiResultData[]
  ): ScheduleData {
    const scheduleData: ScheduleData = {};
    
    // 賞与支払届アラート
    for (const alert of bonusAlerts) {
      const dateKey = this.formatDateKey(alert.submitDeadline);
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
    if (!scheduleData[teijiDateKey]) {
      scheduleData[teijiDateKey] = {};
    }
    if (teijiKetteiResults.length > 0) {
      scheduleData[teijiDateKey]['定時決定（算定基礎届）'] = teijiKetteiResults.length;
    }
    
    // 年齢到達アラート
    for (const alert of ageAlerts) {
      const dateKey = this.formatDateKey(alert.submitDeadline);
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
      if (!scheduleData[dateKey]) {
        scheduleData[dateKey] = {};
      }
      if (!scheduleData[dateKey]['年齢到達・資格変更']) {
        scheduleData[dateKey]['年齢到達・資格変更'] = 0;
      }
      scheduleData[dateKey]['年齢到達・資格変更']++;
    }
    
    // 産休・育休アラート
    for (const alert of maternityChildcareAlerts) {
      const dateKey = this.formatDateKey(alert.submitDeadline);
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
        if (!scheduleData[dateKey]) {
          scheduleData[dateKey] = {};
        }
        if (!scheduleData[dateKey]['扶養・氏名・住所変更']) {
          scheduleData[dateKey]['扶養・氏名・住所変更'] = 0;
        }
        scheduleData[dateKey]['扶養・氏名・住所変更']++;
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
   */
  private getSuijiReportDeadlineDate(alert: SuijiKouhoResultWithDiff): Date | null {
    if (!alert.applyStartMonth) {
      return null;
    }
    
    const year = alert.year || getJSTDate().getFullYear();
    const applyStartMonth = alert.applyStartMonth;
    
    // 適用開始月の前月を計算
    let deadlineMonth = applyStartMonth - 1;
    let deadlineYear = year;
    
    // 1月の場合は前年の12月
    if (deadlineMonth < 1) {
      deadlineMonth = 12;
      deadlineYear = year - 1;
    }
    
    // 前月の月末日を取得
    const deadlineDate = new Date(deadlineYear, deadlineMonth, 0); // 0日目 = 前月の最終日
    
    return deadlineDate;
  }
}



