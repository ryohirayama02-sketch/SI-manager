import { Injectable } from '@angular/core';
import { formatDate } from '../utils/alerts-helper';

@Injectable({
  providedIn: 'root'
})
export class TeijiAlertUiService {
  /**
   * 定時決定（算定基礎届）の提出期日を取得
   * 期日は7月10日
   */
  getTeijiReportDeadline(year: number): string {
    if (isNaN(year) || year < 1900 || year > 2100) {
      return '-';
    }
    try {
      const deadlineDate = new Date(year, 6, 10); // 7月 = 6 (0-indexed)
      if (isNaN(deadlineDate.getTime())) {
        return '-';
      }
      return formatDate(deadlineDate);
    } catch (error) {
      console.error('[TeijiAlertUiService] getTeijiReportDeadlineエラー:', error);
      return '-';
    }
  }

  /**
   * 日付をフォーマット
   */
  formatTeijiDate(date: Date): string {
    return formatDate(date);
  }
}







