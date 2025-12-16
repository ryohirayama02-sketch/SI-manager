import { Injectable } from '@angular/core';
import { SuijiKouhoResultWithDiff } from '../features/alerts-dashboard/tabs/alert-suiji-tab/alert-suiji-tab.component';
import { getJSTDate, formatDate } from '../utils/alerts-helper';

@Injectable({
  providedIn: 'root',
})
export class SuijiAlertUiService {
  /**
   * 随時改定アラートIDを取得
   */
  getSuijiAlertId(alert: SuijiKouhoResultWithDiff): string {
    if (!alert) {
      return '';
    }
    // FirestoreのドキュメントIDがあればそれを使用、なければ生成
    if (alert.id) {
      return alert.id;
    }
    const employeeId = alert.employeeId || '';
    const changeMonth = alert.changeMonth || 0;
    const applyStartMonth = alert.applyStartMonth || 0;
    return `${employeeId}_${changeMonth}_${applyStartMonth}`;
  }

  /**
   * 随時改定の届出提出期日を取得
   * 適用開始月の7日が提出期日
   * 例：適用開始月が7月の場合、提出期日は7月7日
   * 変動月+3ヶ月後が適用開始月なので、変動月が4月の場合、適用開始月は7月になる
   */
  getSuijiReportDeadline(alert: SuijiKouhoResultWithDiff): string {
    if (!alert || !alert.applyStartMonth || !alert.changeMonth) {
      return '-';
    }

    const changeYear = alert.year || getJSTDate().getFullYear();
    if (changeYear < 1900 || changeYear > 2100) {
      return '-';
    }
    const changeMonth = alert.changeMonth;
    if (changeMonth < 1 || changeMonth > 12) {
      return '-';
    }

    // 適用開始月を変動月から再計算（変動月+3ヶ月後）
    const applyStartMonthRaw = changeMonth + 3;

    // 適用開始月の年度を計算
    let applyStartYear = changeYear;
    let applyStartMonth = applyStartMonthRaw;
    if (applyStartMonthRaw > 12) {
      applyStartMonth = applyStartMonthRaw - 12;
      applyStartYear = changeYear + 1;
      if (applyStartYear > 2100) {
        return '-';
      }
    }

    // 適用開始月の7日を提出期日とする
    try {
      const deadlineDate = new Date(applyStartYear, applyStartMonth - 1, 7); // 月は0ベースなので-1
      if (isNaN(deadlineDate.getTime())) {
        return '-';
      }
      return formatDate(deadlineDate);
    } catch (error) {
      console.error('[suiji-alert-ui] getSuijiReportDeadlineエラー:', error);
      return '-';
    }
  }

  /**
   * 等級差が2以上かどうかを判定
   */
  isLargeChange(diff: number | null | undefined): boolean {
    if (diff == null) return false;
    return Math.abs(diff) >= 2;
  }

  /**
   * 日付をフォーマット
   */
  formatSuijiDate(date: Date): string {
    return formatDate(date);
  }
}
