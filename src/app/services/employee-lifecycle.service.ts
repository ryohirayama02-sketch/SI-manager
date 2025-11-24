import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

/**
 * 従業員のライフサイクル（年齢、産休、育休、退職）に関する判定を行うサービス
 * 複数のサービスで共通して使用されるロジックを集約
 */
@Injectable({ providedIn: 'root' })
export class EmployeeLifecycleService {
  /**
   * 従業員の生年月日から指定月の年齢を計算する
   * @param birthDate 生年月日
   * @param year 年
   * @param month 月（1-12）
   * @returns 年齢
   */
  getAgeAtMonth(birthDate: Date | string, year: number, month: number): number {
    const birth = new Date(birthDate);
    const targetDate = new Date(year, month - 1, 1); // 月初日
    let age = targetDate.getFullYear() - birth.getFullYear();
    const monthDiff = targetDate.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && targetDate.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }

  /**
   * 指定月が産休期間中かどうかを判定する
   * @param emp 従業員
   * @param year 年
   * @param month 月（1-12）
   * @returns 産休期間中の場合true
   */
  isMaternityLeave(emp: Employee, year: number, month: number): boolean {
    if (!emp.maternityLeaveStart || !emp.maternityLeaveEnd) {
      return false;
    }

    const startDate = new Date(emp.maternityLeaveStart);
    const endDate = new Date(emp.maternityLeaveEnd);
    const targetDate = new Date(year, month - 1, 1); // 月初日
    const targetEndDate = new Date(year, month, 0); // 月末日

    // 対象月が産休期間と重複しているか判定
    return targetDate <= endDate && targetEndDate >= startDate;
  }

  /**
   * 指定月が育休期間中かどうかを判定する
   * @param emp 従業員
   * @param year 年
   * @param month 月（1-12）
   * @returns 育休期間中の場合true
   */
  isChildcareLeave(emp: Employee, year: number, month: number): boolean {
    if (!emp.childcareLeaveStart || !emp.childcareLeaveEnd) {
      return false;
    }

    const startDate = new Date(emp.childcareLeaveStart);
    const endDate = new Date(emp.childcareLeaveEnd);
    const targetDate = new Date(year, month - 1, 1); // 月初日
    const targetEndDate = new Date(year, month, 0); // 月末日

    // 対象月が育休期間と重複しているか判定
    return targetDate <= endDate && targetEndDate >= startDate;
  }

  /**
   * 指定月が退職月（資格喪失月）かどうかを判定する
   * @param emp 従業員
   * @param year 年
   * @param month 月（1-12）
   * @returns 退職月の場合true（月末在籍なし）
   */
  isRetiredInMonth(emp: Employee, year: number, month: number): boolean {
    if (!emp.retireDate) {
      return false;
    }

    const retireDate = new Date(emp.retireDate);
    const retireYear = retireDate.getFullYear();
    const retireMonth = retireDate.getMonth() + 1; // getMonth()は0-11なので+1

    // 退職日が指定年月の範囲内か判定
    return retireYear === year && retireMonth === month;
  }
}


