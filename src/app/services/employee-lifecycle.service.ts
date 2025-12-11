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
    // 終了日と終了予定日が両方ある場合は終了日を優先
    const startValue = emp.maternityLeaveStart;
    const endValue =
      emp.maternityLeaveEnd !== undefined && emp.maternityLeaveEnd !== null && emp.maternityLeaveEnd !== ''
        ? emp.maternityLeaveEnd
        : emp.maternityLeaveEndExpected;

    if (!startValue || !endValue) {
      return false;
    }

    const startDate = new Date(startValue);
    const endDate = new Date(endValue);
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

    // 終了月は、終了日が月末の場合のみ免除対象
    if (targetMonthKey === endMonthKey) {
      const endOfEndMonth = new Date(
        endDate.getFullYear(),
        endDate.getMonth() + 1,
        0
      );
      return endDate.getDate() === endOfEndMonth.getDate();
    }

    // それ以外（開始月と終了月の間）は免除対象
    return true;
  }

  /**
   * 指定月が育休期間中かどうかを判定する
   * @param emp 従業員
   * @param year 年
   * @param month 月（1-12）
   * @returns 育休期間中の場合true
   */
  isChildcareLeave(emp: Employee, year: number, month: number): boolean {
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
    const targetMonthKey = year * 12 + (month - 1);
    const startMonthKey = startDate.getFullYear() * 12 + startDate.getMonth();
    const endMonthKey = endDate.getFullYear() * 12 + endDate.getMonth();

    if (targetMonthKey < startMonthKey || targetMonthKey > endMonthKey) {
      return false;
    }

    if (targetMonthKey === startMonthKey) {
      return true;
    }

    if (targetMonthKey === endMonthKey) {
      const endOfEndMonth = new Date(
        endDate.getFullYear(),
        endDate.getMonth() + 1,
        0
      );
      return endDate.getDate() === endOfEndMonth.getDate();
    }

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

    // 退職月で、退職日が月末より前の場合、月末在籍なし（false）
    // 退職日が月末の場合、月末在籍あり（true）
    if (retireYear === year && retireMonth === month) {
      return retireDay >= lastDayOfMonth; // 月末在籍ありの場合はtrue
    }

    return true; // 退職月でない場合は月末在籍あり
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
