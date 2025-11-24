import { Injectable } from '@angular/core';

export interface PayMonthResult {
  month: number;   // 1〜12
  year: number;
  key: string;     // "2025-05"
  reason: string;  // 判定基準（支給日基準なら "支給日基準で決定"）
}

@Injectable({ providedIn: 'root' })
export class MonthHelperService {
  /**
   * 支給日から給与月を取得（支給日基準）
   * @param payDate 支給日
   * @returns 給与月（1〜12）
   */
  getPayMonth(payDate: Date): number {
    return payDate.getMonth() + 1;
  }

  /**
   * 支給日から年を取得
   * @param payDate 支給日
   * @returns 年
   */
  getPayYear(payDate: Date): number {
    return payDate.getFullYear();
  }

  /**
   * 年と月からキーを生成
   * @param year 年
   * @param month 月（1〜12）
   * @returns "2025-01" 形式のキー
   */
  getYearMonthKey(year: number, month: number): string {
    const monthStr = month.toString().padStart(2, '0');
    return `${year}-${monthStr}`;
  }

  /**
   * 支給日から給与月情報を取得（支給日基準）
   * @param payDate 支給日
   * @returns 給与月情報
   */
  getPayMonthInfo(payDate: Date): PayMonthResult {
    const year = this.getPayYear(payDate);
    const month = this.getPayMonth(payDate);
    const key = this.getYearMonthKey(year, month);
    
    return {
      month,
      year,
      key,
      reason: '支給日基準で決定'
    };
  }
}

