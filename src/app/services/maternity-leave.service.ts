import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

export interface ExemptResult {
  exempt: boolean;
  reason: string;
}

@Injectable({ providedIn: 'root' })
export class MaternityLeaveService {
  /**
   * 指定日が産前産後休業中かどうかを判定
   * @param date 判定対象日
   * @param employee 従業員情報
   * @returns 免除結果
   */
  isMaternityLeave(date: Date, employee: Employee): ExemptResult {
    if (!employee.maternityLeaveStart || !employee.maternityLeaveEnd) {
      return { exempt: false, reason: '' };
    }
    
    const startDate = new Date(employee.maternityLeaveStart);
    const endDate = new Date(employee.maternityLeaveEnd);
    
    // 日付のみで比較（時刻を無視）
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    if (checkDate >= start && checkDate <= end) {
      return {
        exempt: true,
        reason: '産前産後休業中（健康保険・厚生年金本人分免除）'
      };
    }
    
    return { exempt: false, reason: '' };
  }

  /**
   * 指定日が育児休業中かどうかを判定
   * @param date 判定対象日
   * @param employee 従業員情報
   * @returns 免除結果
   */
  isChildcareLeave(date: Date, employee: Employee): ExemptResult {
    if (!employee.childcareLeaveStart || !employee.childcareLeaveEnd) {
      return { exempt: false, reason: '' };
    }
    
    const startDate = new Date(employee.childcareLeaveStart);
    const endDate = new Date(employee.childcareLeaveEnd);
    
    // 日付のみで比較（時刻を無視）
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    if (checkDate >= start && checkDate <= end) {
      return {
        exempt: true,
        reason: '育児休業中（健康保険・厚生年金本人分免除）'
      };
    }
    
    return { exempt: false, reason: '' };
  }

  /**
   * 指定日の免除理由を取得
   * @param date 判定対象日
   * @param employee 従業員情報
   * @returns 免除結果
   */
  getExemptReason(date: Date, employee: Employee): ExemptResult {
    // 産休を優先チェック
    const maternityResult = this.isMaternityLeave(date, employee);
    if (maternityResult.exempt) {
      return maternityResult;
    }
    
    // 育休をチェック
    const childcareResult = this.isChildcareLeave(date, employee);
    if (childcareResult.exempt) {
      return childcareResult;
    }
    
    return { exempt: false, reason: '' };
  }

  /**
   * 指定年月の給与が免除対象かどうかを判定
   * @param year 年
   * @param month 月（1〜12）
   * @param employee 従業員情報
   * @returns 免除結果
   */
  isExemptForSalary(year: number, month: number, employee: Employee): ExemptResult {
    // 月の1日を基準に判定
    const checkDate = new Date(year, month - 1, 1);
    return this.getExemptReason(checkDate, employee);
  }

  /**
   * 指定支給日の賞与が免除対象かどうかを判定
   * @param payDate 支給日
   * @param employee 従業員情報
   * @returns 免除結果
   */
  isExemptForBonus(payDate: Date, employee: Employee): ExemptResult {
    return this.getExemptReason(payDate, employee);
  }
}

