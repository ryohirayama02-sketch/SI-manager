import { Injectable } from '@angular/core';
import { MaternityLeaveService } from './maternity-leave.service';
import {
  EmployeeEligibilityService,
  AgeFlags,
} from './employee-eligibility.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { ExemptionDeterminationService } from './exemption-determination.service';
import { Employee } from '../models/employee.model';

/**
 * BonusExemptionService
 *
 * 賞与の免除判定を担当するサービス
 * 産休・育休、退職月、年齢による免除判定を提供
 */
@Injectable({ providedIn: 'root' })
export class BonusExemptionService {
  constructor(
    private maternityLeaveService: MaternityLeaveService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private exemptionDeterminationService: ExemptionDeterminationService
  ) {}

  /**
   * 年齢を計算
   */
  calculateAge(birthDate: string | null | undefined): number {
    if (!birthDate || typeof birthDate !== 'string') {
      return 0;
    }

    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) {
      return 0;
    }

    const today = new Date();
    if (isNaN(today.getTime())) {
      return 0;
    }

    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
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
   * 退職月チェック（退職月で月末在籍なし、または退職後の賞与）
   */
  checkRetirement(
    employee: Employee,
    payDate: Date,
    payYear: number,
    payMonth: number
  ): boolean {
    if (!employee || !employee.retireDate) {
      return false;
    }
    if (!payDate || !(payDate instanceof Date) || isNaN(payDate.getTime())) {
      return false;
    }
    if (isNaN(payYear) || payYear < 1900 || payYear > 2100) {
      return false;
    }
    if (isNaN(payMonth) || payMonth < 1 || payMonth > 12) {
      return false;
    }
    const retireDate = new Date(employee.retireDate);
    if (isNaN(retireDate.getTime())) {
      return false;
    }
    const retireYear = retireDate.getFullYear();
    const retireMonth = retireDate.getMonth() + 1;
    const retireDay = retireDate.getDate();
    const lastDayOfMonth = new Date(payYear, payMonth, 0).getDate();

    // 退職月の次の月以降（退職後の賞与）は保険料0円
    const payMonthKey = payYear * 12 + (payMonth - 1);
    const retireMonthKey = retireYear * 12 + (retireMonth - 1);
    if (payMonthKey > retireMonthKey) {
      return true; // 退職後の賞与
    }

    // 退職月で月末在籍なしの場合
    if (retireYear === payYear && retireMonth === payMonth) {
      return retireDay < lastDayOfMonth;
    }
    return false;
  }

  /**
   * 産休免除チェック
   * 月ベースの判定を使用（月次給与と同じロジック）
   * 開始日が含まれる月は保険料ゼロ、終了日の翌日が含まれる月から保険料発生
   */
  checkMaternityExemption(
    employee: Employee,
    payDate: Date
  ): {
    isExempted: boolean;
    exemptReason?: string;
  } {
    if (!employee) {
      return { isExempted: false };
    }
    if (!payDate || !(payDate instanceof Date) || isNaN(payDate.getTime())) {
      return { isExempted: false };
    }

    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;

    if (isNaN(payYear) || payYear < 1900 || payYear > 2100) {
      return { isExempted: false };
    }
    if (isNaN(payMonth) || payMonth < 1 || payMonth > 12) {
      return { isExempted: false };
    }

    // 月ベースの判定を使用（月次給与と同じロジック）
    const isMaternityLeavePeriod =
      this.employeeLifecycleService.isMaternityLeave(
        employee,
        payYear,
        payMonth
      );

    if (isMaternityLeavePeriod) {
      return {
        isExempted: true,
        exemptReason: '産前産後休業中（健康保険・厚生年金本人分免除）',
      };
    }
    return { isExempted: false };
  }

  /**
   * 育休期間が14日未満かどうかを判定
   * @param employee 従業員情報
   * @returns 14日未満の場合true
   */
  private isChildcareLeavePeriodLessThan14Days(employee: Employee): boolean {
    if (!employee) {
      return false;
    }

    const startValue = employee.childcareLeaveStart;
    const endValue =
      employee.childcareLeaveEnd ?? employee.childcareLeaveEndExpected;

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
   * 育休免除チェック
   * 月ベースの判定を使用（月次給与と同じロジック）
   * 開始日が含まれる月は保険料ゼロ、終了日の翌日が含まれる月から保険料発生
   * 届出・同居条件の確認は不要（月次給与入力と同じ）
   * ただし、育休期間が14日未満の場合は免除しない
   */
  checkChildcareExemption(
    employee: Employee,
    payDate: Date
  ): {
    isExempted: boolean;
    exemptReason?: string;
  } {
    if (!employee) {
      return { isExempted: false };
    }
    if (!payDate || !(payDate instanceof Date) || isNaN(payDate.getTime())) {
      return { isExempted: false };
    }

    // 育休期間が14日未満の場合は免除しない
    if (this.isChildcareLeavePeriodLessThan14Days(employee)) {
      return { isExempted: false };
    }

    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;

    if (isNaN(payYear) || payYear < 1900 || payYear > 2100) {
      return { isExempted: false };
    }
    if (isNaN(payMonth) || payMonth < 1 || payMonth > 12) {
      return { isExempted: false };
    }

    // 月ベースの判定を使用（月次給与と同じロジック）
    const isChildcareLeavePeriod =
      this.employeeLifecycleService.isChildcareLeave(
        employee,
        payYear,
        payMonth
      );

    if (isChildcareLeavePeriod) {
      return {
        isExempted: true,
        exemptReason: '育児休業中（健康保険・厚生年金本人分免除）',
      };
    }

    return { isExempted: false };
  }

  /**
   * 70歳到達チェック
   */
  checkOverAge70(
    employee: Employee,
    payYear: number,
    payMonth: number
  ): boolean {
    if (!employee || !employee.birthDate) {
      return false;
    }
    if (isNaN(payYear) || payYear < 1900 || payYear > 2100) {
      return false;
    }
    if (isNaN(payMonth) || payMonth < 1 || payMonth > 12) {
      return false;
    }
    const birthDate = new Date(employee.birthDate);
    if (isNaN(birthDate.getTime())) {
      return false;
    }
    const birthYear = birthDate.getFullYear();
    const birthMonth = birthDate.getMonth() + 1;
    const age70Year = birthYear + 70;
    return payYear === age70Year && payMonth >= birthMonth;
  }

  /**
   * 75歳到達チェック
   */
  checkOverAge75(
    employee: Employee,
    payYear: number,
    payMonth: number
  ): boolean {
    if (!employee || !employee.birthDate) {
      return false;
    }
    if (isNaN(payYear) || payYear < 1900 || payYear > 2100) {
      return false;
    }
    if (isNaN(payMonth) || payMonth < 1 || payMonth > 12) {
      return false;
    }
    const birthDate = new Date(employee.birthDate);
    if (isNaN(birthDate.getTime())) {
      return false;
    }
    const birthYear = birthDate.getFullYear();
    const birthMonth = birthDate.getMonth() + 1;
    const age75Year = birthYear + 75;
    return payYear === age75Year && payMonth >= birthMonth;
  }

  /**
   * 年齢フラグを取得
   * 賞与の場合も月次給与と同じように、支給月が40歳到達月かどうかで判定する
   */
  getAgeFlags(employee: Employee, payDate: Date): AgeFlags {
    const defaultAgeFlags: AgeFlags = {
      isCare2: false,
      isCare1: false,
      isNoPension: false,
      isNoHealth: false,
    };

    if (!employee) {
      return defaultAgeFlags;
    }
    if (!payDate || !(payDate instanceof Date) || isNaN(payDate.getTime())) {
      return defaultAgeFlags;
    }

    // 支給月の1日時点の年齢で判定（月次給与と同じロジック）
    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;

    if (isNaN(payYear) || payYear < 1900 || payYear > 2100) {
      return defaultAgeFlags;
    }
    if (isNaN(payMonth) || payMonth < 1 || payMonth > 12) {
      return defaultAgeFlags;
    }

    const payMonthFirstDay = new Date(payYear, payMonth - 1, 1);
    if (isNaN(payMonthFirstDay.getTime())) {
      return defaultAgeFlags;
    }

    const eligibilityResult = this.employeeEligibilityService.checkEligibility(
      employee,
      payMonthFirstDay
    );

    // 支給月が40歳到達月かどうかを判定（月次給与と同じロジック）
    const careType = this.exemptionDeterminationService.getCareInsuranceType(
      employee.birthDate,
      payYear,
      payMonth
    );

    // 介護保険第2号被保険者（40〜64歳）の判定
    // careTypeが'type2'の場合は、isCare2をtrueにする
    const ageFlags: AgeFlags = {
      ...eligibilityResult.ageFlags,
      isCare2: careType === 'type2',
    };

    return ageFlags;
  }
}
