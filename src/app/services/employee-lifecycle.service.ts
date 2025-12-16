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
    if (!birthDate) {
      return 0;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return 0;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return 0;
    }

    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) {
      return 0;
    }

    const targetDate = new Date(year, month - 1, 1); // 月初日
    if (isNaN(targetDate.getTime())) {
      return 0;
    }

    let age = targetDate.getFullYear() - birth.getFullYear();
    const monthDiff = targetDate.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && targetDate.getDate() < birth.getDate())
    ) {
      age--;
    }

    // 年齢の範囲チェック（0-150歳）
    if (age < 0 || age > 150) {
      return 0;
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
    if (!emp) {
      return false;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return false;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return false;
    }

    // 終了日と終了予定日が両方ある場合は終了日を優先
    const startValue = emp.maternityLeaveStart;
    const endValue =
      emp.maternityLeaveEnd !== undefined &&
      emp.maternityLeaveEnd !== null &&
      emp.maternityLeaveEnd !== ''
        ? emp.maternityLeaveEnd
        : emp.maternityLeaveEndExpected;

    if (!startValue || !endValue) {
      return false;
    }

    const startDate = new Date(startValue);
    const endDate = new Date(endValue);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return false;
    }
    const targetMonthKey = year * 12 + (month - 1);
    const startMonthKey = startDate.getFullYear() * 12 + startDate.getMonth();
    const endMonthKey = endDate.getFullYear() * 12 + endDate.getMonth();

    // 対象月が開始月より前、または終了月より後なら対象外
    if (targetMonthKey < startMonthKey || targetMonthKey > endMonthKey) {
      return false;
    }

    // 開始月は必ず免除対象
    if (targetMonthKey === startMonthKey) {
      return true;
    }

    // 終了月の処理
    if (targetMonthKey === endMonthKey) {
      const endOfEndMonth = new Date(
        endDate.getFullYear(),
        endDate.getMonth() + 1,
        0
      );
      const lastDayOfEndMonth = endOfEndMonth.getDate();

      // 終了日が月末（31日など）の場合、免除対象（保険料ゼロ）
      // 終了日が1-30日の場合、免除対象外（保険料発生）
      return endDate.getDate() === lastDayOfEndMonth;
    }

    // それ以外（開始月と終了月の間）は免除対象
    return true;
  }

  /**
   * 育休期間が14日未満かどうかを判定
   * @param emp 従業員
   * @returns 14日未満の場合true
   */
  private isChildcareLeavePeriodLessThan14Days(emp: Employee): boolean {
    if (!emp) {
      return false;
    }

    const startValue = emp.childcareLeaveStart;
    const endValue =
      emp.childcareLeaveEnd !== undefined &&
      emp.childcareLeaveEnd !== null &&
      emp.childcareLeaveEnd !== ''
        ? emp.childcareLeaveEnd
        : emp.childcareLeaveEndExpected;

    if (!startValue || !endValue) {
      return false;
    }

    const startDate = new Date(startValue);
    const endDate = new Date(endValue);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return false;
    }

    // 開始日から終了日までの日数を計算（開始日と終了日を含む）
    const daysDiff =
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

    return daysDiff < 14 && daysDiff > 0;
  }

  /**
   * 指定月が育休期間中かどうかを判定する
   * @param emp 従業員
   * @param year 年
   * @param month 月（1-12）
   * @returns 育休期間中の場合true
   */
  isChildcareLeave(emp: Employee, year: number, month: number): boolean {
    if (!emp) {
      return false;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return false;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return false;
    }

    // 育休期間が14日未満の場合は免除しない
    if (this.isChildcareLeavePeriodLessThan14Days(emp)) {
      return false;
    }

    // 終了日と終了予定日が両方ある場合は終了日を優先
    const startValue = emp.childcareLeaveStart;
    const endValue =
      emp.childcareLeaveEnd !== undefined &&
      emp.childcareLeaveEnd !== null &&
      emp.childcareLeaveEnd !== ''
        ? emp.childcareLeaveEnd
        : emp.childcareLeaveEndExpected;

    if (!startValue || !endValue) {
      return false;
    }

    const startDate = new Date(startValue);
    const endDate = new Date(endValue);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return false;
    }
    const targetMonthKey = year * 12 + (month - 1);
    const startMonthKey = startDate.getFullYear() * 12 + startDate.getMonth();
    const endMonthKey = endDate.getFullYear() * 12 + endDate.getMonth();

    if (targetMonthKey < startMonthKey || targetMonthKey > endMonthKey) {
      return false;
    }

    // 開始月は必ず免除対象
    if (targetMonthKey === startMonthKey) {
      return true;
    }

    // 終了月の処理
    if (targetMonthKey === endMonthKey) {
      const endOfEndMonth = new Date(
        endDate.getFullYear(),
        endDate.getMonth() + 1,
        0
      );
      const lastDayOfEndMonth = endOfEndMonth.getDate();

      // 終了日が月末（31日など）の場合、免除対象（保険料ゼロ）
      // 終了日が1-30日の場合、免除対象外（保険料発生）
      return endDate.getDate() === lastDayOfEndMonth;
    }

    // それ以外（開始月と終了月の間）は免除対象
    return true;
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

  /**
   * 指定月で月末在籍があるかどうかを判定する（健康保険用）
   * @param emp 従業員
   * @param year 年
   * @param month 月（1-12）
   * @returns 月末在籍がある場合true（退職日が月末の場合、または退職月でない場合）
   */
  isLastDayEligible(emp: Employee, year: number, month: number): boolean {
    if (!emp.retireDate) {
      return true; // 退職日がなければ月末在籍あり
    }

    const retireDate = new Date(emp.retireDate);
    const retireYear = retireDate.getFullYear();
    const retireMonth = retireDate.getMonth() + 1;
    const retireDay = retireDate.getDate();
    const lastDayOfMonth = new Date(year, month, 0).getDate();

    // 退職月でない場合は月末在籍あり
    if (retireYear !== year || retireMonth !== month) {
      return true;
    }

    // 退職日が月末（31日など）の場合、月末在籍あり
    if (retireDay >= lastDayOfMonth) {
      return true;
    }

    // 退職日が月末より前の場合、同月得喪かどうかを確認
    if (emp.joinDate) {
      const joinDate = new Date(emp.joinDate);
      const joinYear = joinDate.getFullYear();
      const joinMonth = joinDate.getMonth() + 1;

      // 同月得喪（入社月と退職月が同じ）の場合、保険料発生
      if (joinYear === retireYear && joinMonth === retireMonth) {
        return true; // 同月得喪の場合は月末在籍ありとして扱う
      }

      // 入社が前年以前で退職日が1/1-1/30の場合、保険料ゼロ
      // 例：2024年12月以前入社で2025年1月1-30日退職 → 保険料ゼロ
      if (
        joinYear < retireYear ||
        (joinYear === retireYear && joinMonth < retireMonth)
      ) {
        return false; // 月末在籍なし
      }
    }

    // その他の場合（退職日が月末より前で、同月得喪でない場合）
    return false; // 月末在籍なし
  }

  /**
   * 従業員情報の日付整合性をチェック
   * @param employee 従業員情報
   * @returns エラーメッセージと警告メッセージの配列
   */
  validateEmployeeDates(employee: {
    birthDate?: string;
    joinDate?: string;
    retireDate?: string;
    maternityLeaveStart?: string;
    maternityLeaveEnd?: string;
    childcareLeaveStart?: string;
    childcareLeaveEnd?: string;
    returnFromLeaveDate?: string;
    leaveOfAbsenceStart?: string;
    leaveOfAbsenceEnd?: string;
    childcareNotificationSubmitted?: boolean;
    childcareLivingTogether?: boolean;
  }): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const birthDate = employee.birthDate ? new Date(employee.birthDate) : null;
    const joinDate = employee.joinDate ? new Date(employee.joinDate) : null;
    const retireDate = employee.retireDate
      ? new Date(employee.retireDate)
      : null;
    const maternityLeaveStart = employee.maternityLeaveStart
      ? new Date(employee.maternityLeaveStart)
      : null;
    const maternityLeaveEnd = employee.maternityLeaveEnd
      ? new Date(employee.maternityLeaveEnd)
      : null;
    const childcareLeaveStart = employee.childcareLeaveStart
      ? new Date(employee.childcareLeaveStart)
      : null;
    const childcareLeaveEnd = employee.childcareLeaveEnd
      ? new Date(employee.childcareLeaveEnd)
      : null;
    const returnFromLeaveDate = employee.returnFromLeaveDate
      ? new Date(employee.returnFromLeaveDate)
      : null;
    const leaveOfAbsenceStart = employee.leaveOfAbsenceStart
      ? new Date(employee.leaveOfAbsenceStart)
      : null;
    const leaveOfAbsenceEnd = employee.leaveOfAbsenceEnd
      ? new Date(employee.leaveOfAbsenceEnd)
      : null;

    // 入社日が生年月日より後かチェック
    if (birthDate && joinDate) {
      if (joinDate < birthDate) {
        errors.push('入社日は生年月日より後である必要があります');
      }
    }

    // 退職日が入社日より後かチェック
    if (joinDate && retireDate) {
      if (retireDate < joinDate) {
        errors.push('退職日は入社日より後である必要があります');
      }
    }

    // 産休開始日 < 終了日
    if (maternityLeaveStart && maternityLeaveEnd) {
      if (maternityLeaveEnd < maternityLeaveStart) {
        errors.push('産休終了日は開始日より後である必要があります');
      }
    }

    // 育休開始日 < 終了日
    if (childcareLeaveStart && childcareLeaveEnd) {
      if (childcareLeaveEnd < childcareLeaveStart) {
        errors.push('育休終了日は開始日より後である必要があります');
      }
    }

    // 産休・育休の日付整合性チェック
    if (
      maternityLeaveStart &&
      maternityLeaveEnd &&
      childcareLeaveStart &&
      childcareLeaveEnd
    ) {
      const daysBetween =
        (childcareLeaveStart.getTime() - maternityLeaveEnd.getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysBetween > 30) {
        errors.push(
          '産休・育休の設定が矛盾しています（産休終了日と育休開始日の間が30日を超えています）'
        );
      }
    }

    // 復職日が入社日より後かチェック
    if (joinDate && returnFromLeaveDate) {
      if (returnFromLeaveDate < joinDate) {
        errors.push('復職日は入社日より後である必要があります');
      }
    }

    // 復職日が退職日より前かチェック
    if (retireDate && returnFromLeaveDate) {
      if (returnFromLeaveDate >= retireDate) {
        errors.push('復職日は退職日より前である必要があります');
      }
    }

    // 休職開始日 < 終了日
    if (leaveOfAbsenceStart && leaveOfAbsenceEnd) {
      if (leaveOfAbsenceEnd < leaveOfAbsenceStart) {
        errors.push('休職終了日は開始日より後である必要があります');
      }
    }

    // 育休期間中なのに届出未提出または子と同居していない場合の警告
    if (childcareLeaveStart && childcareLeaveEnd) {
      const isNotificationSubmitted =
        employee.childcareNotificationSubmitted === true;
      const isLivingTogether = employee.childcareLivingTogether === true;
      if (!isNotificationSubmitted || !isLivingTogether) {
        warnings.push(
          '育休期間が設定されていますが、届出未提出または子と同居していない場合、保険料免除の対象外となります'
        );
      }
    }

    return { errors, warnings };
  }
}
