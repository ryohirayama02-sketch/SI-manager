import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarService } from '../../../../services/calendar.service';
import { AlertsDashboardStateService } from '../../../../services/alerts-dashboard-state.service';
import { getJSTDate } from '../../../../utils/alerts-helper';

@Component({
  selector: 'app-alert-schedule-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-schedule-tab.component.html',
  styleUrl: './alert-schedule-tab.component.css',
})
export class AlertScheduleTabComponent implements OnInit {
  @Input() scheduleData: {
    [dateKey: string]: {
      // YYYY-MM-DD形式
      [tabName: string]: number; // タブ名: 件数
    };
  } = {};
  @Input() scheduleYear: number = getJSTDate().getFullYear();
  @Input() scheduleMonth: number = getJSTDate().getMonth() + 1;
  @Output() scheduleMonthChange = new EventEmitter<number>();
  @Output() scheduleYearChange = new EventEmitter<number>();
  @Output() dateClick = new EventEmitter<string>();

  constructor(
    private calendarService: CalendarService,
    private state: AlertsDashboardStateService
  ) {}

  /**
   * 表示用の年を取得（安全な値）
   */
  get displayYear(): number {
    return this.scheduleYear && !isNaN(this.scheduleYear) && this.scheduleYear >= 1900 && this.scheduleYear <= 2100
      ? this.scheduleYear
      : getJSTDate().getFullYear();
  }

  /**
   * 表示用の月を取得（安全な値）
   */
  get displayMonth(): number {
    return this.scheduleMonth && !isNaN(this.scheduleMonth) && this.scheduleMonth >= 1 && this.scheduleMonth <= 12
      ? this.scheduleMonth
      : getJSTDate().getMonth() + 1;
  }

  ngOnInit(): void {
    // 直近の状態で即時カレンダーを描画
    this.state.updateScheduleData();
  }

  /**
   * 日付をYYYY-MM-DD形式のキーに変換
   */
  formatDateKey(date: Date): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      // 無効な日付の場合は現在日時を使用
      const now = getJSTDate();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * カレンダーの日付に表示するスケジュール項目を取得（最大6件）
   */
  getScheduleItemsForDate(
    date: Date
  ): {
    tabName: string;
    count: number;
    tabId: string;
    color: string;
    textColor: string;
  }[] {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return [];
    }
    if (!this.scheduleData) {
      return [];
    }
    const dateKey = this.formatDateKey(date);
    const items = this.scheduleData[dateKey];
    if (!items) {
      return [];
    }

    // タブ名とタブIDのマッピング
    const tabMapping: { [key: string]: string } = {
      賞与支払届: 'bonus',
      随時改定アラート: 'suiji',
      '定時決定（算定基礎届）': 'teiji',
      '年齢到達・資格変更': 'age',
      '産休・育休・休職': 'leave',
      '扶養・氏名・住所変更': 'family',
      徴収不能: 'uncollected',
      前月分の社会保険料納付期限: 'payment',
    };

    const result: {
      tabName: string;
      count: number;
      tabId: string;
      color: string;
      textColor: string;
    }[] = [];
    for (const [tabName, count] of Object.entries(items)) {
      // countのバリデーション
      const validCount = typeof count === 'number' && !isNaN(count) && count > 0 ? count : 0;
      if (validCount === 0) {
        continue;
      }
      
      const tabId = tabMapping[tabName] || '';
      if (tabId) {
        const backgroundColor = this.state.getTabColor(tabId);
        result.push({
          tabName: tabName || '',
          count: validCount,
          tabId,
          color: backgroundColor,
          textColor: this.getTextColorForBackground(backgroundColor),
        });
      }
    }

    // 最大6件まで
    return result.slice(0, 6);
  }

  /**
   * 背景色の明度に応じて、読みやすいテキスト色（白または黒）を返す
   */
  getTextColorForBackground(backgroundColor: string): string {
    if (!backgroundColor || !backgroundColor.startsWith('#')) {
      // 無効な色の場合はデフォルトで黒を返す
      return '#000000';
    }
    // 16進数カラーコードをRGBに変換
    const hex = backgroundColor.replace('#', '');
    // 6文字未満の場合はパディングを追加
    const paddedHex = hex.padStart(6, '0');
    const r = parseInt(paddedHex.substring(0, 2), 16);
    const g = parseInt(paddedHex.substring(2, 4), 16);
    const b = parseInt(paddedHex.substring(4, 6), 16);

    // NaNチェック
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      return '#000000';
    }

    // 相対輝度を計算（WCAG 2.1の公式を使用）
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // 明度が0.5以上なら黒、それ以下なら白
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  /**
   * カレンダーの月を変更
   */
  changeScheduleMonth(delta: number): void {
    // deltaのバリデーション（通常は1または-1）
    if (delta === 0 || isNaN(delta)) {
      return;
    }

    const oldMonth = this.scheduleMonth;
    const oldYear = this.scheduleYear;

    this.scheduleMonth += delta;

    // 月の範囲を調整
    if (this.scheduleMonth > 12) {
      this.scheduleMonth = 1;
      this.scheduleYear++;
    } else if (this.scheduleMonth < 1) {
      this.scheduleMonth = 12;
      this.scheduleYear--;
    }

    // 年が変更された場合のみ年変更イベントを発火
    if (this.scheduleYear !== oldYear) {
      this.scheduleYearChange.emit(this.scheduleYear);
    }

    // 月が変更された場合のみ月変更イベントを発火
    if (this.scheduleMonth !== oldMonth) {
      this.scheduleMonthChange.emit(this.scheduleMonth);
    }
  }

  /**
   * カレンダーの日付をクリックしたときの処理
   */
  onScheduleDateClick(tabId: string): void {
    // 「前月分の社会保険料納付期限」は表示のみ（クリック無効）
    if (!tabId || tabId === 'payment') {
      return;
    }
    this.dateClick.emit(tabId);
  }

  /**
   * カレンダーの日付が現在の月かどうか
   */
  isCurrentMonth(date: Date): boolean {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return false;
    }
    try {
      return this.calendarService.isCurrentMonth(
        date,
        this.scheduleYear,
        this.scheduleMonth
      );
    } catch (error) {
      console.error('[alert-schedule-tab] isCurrentMonthエラー:', error);
      return false;
    }
  }

  /**
   * カレンダーの日付が今日かどうか
   */
  isToday(date: Date): boolean {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return false;
    }
    try {
      return this.calendarService.isToday(date);
    } catch (error) {
      console.error('[alert-schedule-tab] isTodayエラー:', error);
      return false;
    }
  }

  /**
   * カレンダーの日付配列を生成
   */
  getCalendarDays(): Date[] {
    try {
      // scheduleYearとscheduleMonthのバリデーション
      const year = this.scheduleYear && !isNaN(this.scheduleYear) && this.scheduleYear >= 1900 && this.scheduleYear <= 2100
        ? this.scheduleYear
        : new Date().getFullYear();
      const month = this.scheduleMonth && !isNaN(this.scheduleMonth) && this.scheduleMonth >= 1 && this.scheduleMonth <= 12
        ? this.scheduleMonth
        : new Date().getMonth() + 1;
      
      return this.calendarService.getCalendarDays(year, month);
    } catch (error) {
      console.error('[alert-schedule-tab] getCalendarDaysエラー:', error);
      // エラーが発生した場合は現在の月のカレンダーを返す
      const now = new Date();
      return this.calendarService.getCalendarDays(now.getFullYear(), now.getMonth() + 1);
    }
  }

  /**
   * カレンダーの日付を週ごとに分割
   */
  getCalendarWeeks(): Date[][] {
    try {
      const days = this.getCalendarDays();
      if (!days || days.length === 0) {
        return [];
      }
      return this.calendarService.getCalendarWeeks(days);
    } catch (error) {
      console.error('[alert-schedule-tab] getCalendarWeeksエラー:', error);
      return [];
    }
  }
}
