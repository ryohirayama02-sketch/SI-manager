import { Injectable } from '@angular/core';
import { formatDate } from '../utils/alerts-helper';

@Injectable({
  providedIn: 'root'
})
export class LeaveAlertUiService {
  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    return formatDate(date);
  }
}




