import { Injectable } from '@angular/core';
import { formatDate } from '../utils/alerts-helper';

@Injectable({
  providedIn: 'root'
})
export class BonusAlertUiService {
  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    return formatDate(date);
  }

  /**
   * 支給日をフォーマット
   */
  formatPayDate(payDateStr: string): string {
    if (!payDateStr) return '-';
    const date = new Date(payDateStr);
    return formatDate(date);
  }
}



