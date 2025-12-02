import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-alert-schedule-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-schedule-tab.component.html',
  styleUrl: './alert-schedule-tab.component.css'
})
export class AlertScheduleTabComponent {
  @Input() scheduleData: {
    [dateKey: string]: { // YYYY-MM-DD形式
      [tabName: string]: number; // タブ名: 件数
    }
  } = {};
  @Input() scheduleYear: number = new Date().getFullYear();
  @Input() scheduleMonth: number = new Date().getMonth() + 1;
  @Output() scheduleMonthChange = new EventEmitter<number>();
  @Output() scheduleYearChange = new EventEmitter<number>();
  @Output() dateClick = new EventEmitter<string>();

  /**
   * 日本時間（JST）の現在日時を取得
   */
  private getJSTDate(): Date {
    const now = new Date();
    // UTC+9時間（日本時間）に変換
    const jstOffset = 9 * 60; // 分単位
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const jst = new Date(utc + (jstOffset * 60000));
    return jst;
  }

  /**
   * 日付をYYYY-MM-DD形式のキーに変換
   */
  formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * タブの色を取得
   */
  getTabColor(tabId: string): string {
    const colorMap: { [key: string]: string } = {
      'schedule': '#6c757d',      // グレー
      'bonus': '#007bff',          // 青
      'suiji': '#28a745',          // 緑
      'teiji': '#ffc107',          // 黄色
      'age': '#dc3545',            // 赤
      'leave': '#17a2b8',          // シアン
      'family': '#6f42c1'          // 紫
    };
    return colorMap[tabId] || '#6c757d';
  }

  /**
   * カレンダーの日付に表示するスケジュール項目を取得（最大6件）
   */
  getScheduleItemsForDate(date: Date): { tabName: string; count: number; tabId: string; color: string }[] {
    const dateKey = this.formatDateKey(date);
    const items = this.scheduleData[dateKey];
    if (!items) {
      return [];
    }
    
    // タブ名とタブIDのマッピング
    const tabMapping: { [key: string]: string } = {
      '賞与支払届': 'bonus',
      '随時改定アラート': 'suiji',
      '定時決定（算定基礎届）': 'teiji',
      '年齢到達・資格変更': 'age',
      '産休・育休・休職': 'leave',
      '扶養・氏名・住所変更': 'family'
    };
    
    const result: { tabName: string; count: number; tabId: string; color: string }[] = [];
    for (const [tabName, count] of Object.entries(items)) {
      const tabId = tabMapping[tabName] || '';
      if (tabId) {
        result.push({ 
          tabName, 
          count, 
          tabId,
          color: this.getTabColor(tabId)
        });
      }
    }
    
    // 最大6件まで
    return result.slice(0, 6);
  }

  /**
   * カレンダーの月を変更
   */
  changeScheduleMonth(delta: number): void {
    this.scheduleMonth += delta;
    if (this.scheduleMonth > 12) {
      this.scheduleMonth = 1;
      this.scheduleYear++;
      this.scheduleYearChange.emit(this.scheduleYear);
    } else if (this.scheduleMonth < 1) {
      this.scheduleMonth = 12;
      this.scheduleYear--;
      this.scheduleYearChange.emit(this.scheduleYear);
    }
    this.scheduleMonthChange.emit(this.scheduleMonth);
  }

  /**
   * カレンダーの日付をクリックしたときの処理
   */
  onScheduleDateClick(tabId: string): void {
    this.dateClick.emit(tabId);
  }

  /**
   * カレンダーの日付が現在の月かどうか
   */
  isCurrentMonth(date: Date): boolean {
    return date.getFullYear() === this.scheduleYear && date.getMonth() + 1 === this.scheduleMonth;
  }

  /**
   * カレンダーの日付が今日かどうか
   */
  isToday(date: Date): boolean {
    const today = this.getJSTDate();
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate();
  }

  /**
   * カレンダーの日付配列を生成
   */
  getCalendarDays(): Date[] {
    const firstDay = new Date(this.scheduleYear, this.scheduleMonth - 1, 1);
    const lastDay = new Date(this.scheduleYear, this.scheduleMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 (日) から 6 (土)
    
    const days: Date[] = [];
    
    // 前月の日付を追加（カレンダーの最初の週を埋める）
    const prevMonth = this.scheduleMonth - 1;
    const prevYear = prevMonth < 1 ? this.scheduleYear - 1 : this.scheduleYear;
    const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(prevYear, prevMonth - 1, prevMonthLastDay - i));
    }
    
    // 今月の日付を追加
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(this.scheduleYear, this.scheduleMonth - 1, day));
    }
    
    // 次月の日付を追加（カレンダーの最後の週を埋める）
    const totalDays = days.length;
    const remainingDays = 42 - totalDays; // 6週間 × 7日 = 42日
    for (let day = 1; day <= remainingDays; day++) {
      days.push(new Date(this.scheduleYear, this.scheduleMonth, day));
    }
    
    return days;
  }

  /**
   * カレンダーの日付を週ごとに分割
   */
  getCalendarWeeks(): Date[][] {
    const days = this.getCalendarDays();
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  }
}



