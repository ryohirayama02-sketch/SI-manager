import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarService } from '../../../../services/calendar.service';
import { AlertsDashboardStateService } from '../../../../services/alerts-dashboard-state.service';
import { getJSTDate } from '../../../../utils/alerts-helper';

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

  constructor(
    private calendarService: CalendarService,
    private state: AlertsDashboardStateService
  ) {}

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
          color: this.state.getTabColor(tabId)
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
    return this.calendarService.isCurrentMonth(date, this.scheduleYear, this.scheduleMonth);
  }

  /**
   * カレンダーの日付が今日かどうか
   */
  isToday(date: Date): boolean {
    return this.calendarService.isToday(date);
  }

  /**
   * カレンダーの日付配列を生成
   */
  getCalendarDays(): Date[] {
    return this.calendarService.getCalendarDays(this.scheduleYear, this.scheduleMonth);
  }

  /**
   * カレンダーの日付を週ごとに分割
   */
  getCalendarWeeks(): Date[][] {
    const days = this.getCalendarDays();
    return this.calendarService.getCalendarWeeks(days);
  }
}



