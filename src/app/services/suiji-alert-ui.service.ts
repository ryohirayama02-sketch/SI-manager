import { Injectable } from '@angular/core';
import { SuijiKouhoResultWithDiff } from '../features/alerts-dashboard/tabs/alert-suiji-tab/alert-suiji-tab.component';
import { getJSTDate, formatDate } from '../utils/alerts-helper';

@Injectable({
  providedIn: 'root'
})
export class SuijiAlertUiService {
  /**
   * 随時改定アラートIDを取得
   */
  getSuijiAlertId(alert: SuijiKouhoResultWithDiff): string {
    // FirestoreのドキュメントIDがあればそれを使用、なければ生成
    if (alert.id) {
      return alert.id;
    }
    return `${alert.employeeId}_${alert.changeMonth}_${alert.applyStartMonth}`;
  }

  /**
   * 随時改定の届出提出期日を取得
   * 適用開始月の前月の月末が提出期日
   * 例：適用開始月が8月の場合、提出期日は7月31日
   * 変動月+4ヶ月後が適用開始月なので、変動月が9月の場合、適用開始月は翌年1月になる
   */
  getSuijiReportDeadline(alert: SuijiKouhoResultWithDiff): string {
    if (!alert.applyStartMonth) {
      return '-';
    }
    
    const changeYear = alert.year || getJSTDate().getFullYear();
    const changeMonth = alert.changeMonth;
    const applyStartMonth = alert.applyStartMonth;
    
    // 適用開始月の年度を計算
    // 変動月+4が適用開始月なので、変動月が9月以上の場合、適用開始月は翌年になる
    let applyStartYear = changeYear;
    if (changeMonth + 4 > 12) {
      applyStartYear = changeYear + 1;
    }
    
    // 適用開始月の前月を計算
    let deadlineMonth = applyStartMonth - 1;
    let deadlineYear = applyStartYear;
    
    // 1月の場合は前年の12月
    if (deadlineMonth < 1) {
      deadlineMonth = 12;
      deadlineYear = applyStartYear - 1;
    }
    
    // 前月の月末日を取得
    const deadlineDate = new Date(deadlineYear, deadlineMonth, 0); // 0日目 = 前月の最終日
    
    return formatDate(deadlineDate);
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



