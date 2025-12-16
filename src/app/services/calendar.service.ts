import { Injectable } from '@angular/core';
import { getJSTDate } from '../utils/alerts-helper';

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  /**
   * カレンダーの日付配列を生成
   */
  getCalendarDays(year: number, month: number): Date[] {
    // 入力値のバリデーション
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month: ${month}. Month must be between 1 and 12.`);
    }
    if (year < 1900 || year > 2100) {
      throw new Error(`Invalid year: ${year}. Year must be between 1900 and 2100.`);
    }

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 (日) から 6 (土)
    
    const days: Date[] = [];
    
    // 前月の日付を追加（カレンダーの最初の週を埋める）
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push(new Date(prevYear, prevMonth - 1, prevMonthLastDay - i));
    }
    
    // 今月の日付を追加
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month - 1, day));
    }
    
    // 次月の日付を追加（カレンダーの最後の週を埋める）
    const totalDays = days.length;
    const remainingDays = 42 - totalDays; // 6週間 × 7日 = 42日
    for (let day = 1; day <= remainingDays; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  }

  /**
   * カレンダーの日付を週ごとに分割
   */
  getCalendarWeeks(days: Date[]): Date[][] {
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  }

  /**
   * カレンダーの日付が現在の月かどうか
   */
  isCurrentMonth(date: Date, year: number, month: number): boolean {
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  }

  /**
   * カレンダーの日付が今日かどうか
   */
  isToday(date: Date): boolean {
    const today = getJSTDate();
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate();
  }
}







