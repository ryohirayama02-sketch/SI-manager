import { Injectable } from '@angular/core';
import { MaternityLeaveService } from './maternity-leave.service';
import {
  EmployeeEligibilityService,
  AgeFlags,
} from './employee-eligibility.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
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
    private employeeLifecycleService: EmployeeLifecycleService
  ) {}

  /**
   * 年齢を計算
   */
  calculateAge(birthDate: string): number {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }

  /**
   * 退職月チェック
   */
  checkRetirement(
    employee: Employee,
    payDate: Date,
    payYear: number,
    payMonth: number
  ): boolean {
    if (!employee.retireDate) {
      return false;
    }
    const retireDate = new Date(employee.retireDate);
    const retireYear = retireDate.getFullYear();
    const retireMonth = retireDate.getMonth() + 1;
    const retireDay = retireDate.getDate();
    const lastDayOfMonth = new Date(payYear, payMonth, 0).getDate();

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
    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;

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
   * 育休免除チェック
   * 月ベースの判定を使用（月次給与と同じロジック）
   * 開始日が含まれる月は保険料ゼロ、終了日の翌日が含まれる月から保険料発生
   * 届出・同居条件の確認は不要（月次給与入力と同じ）
   */
  checkChildcareExemption(
    employee: Employee,
    payDate: Date
  ): {
    isExempted: boolean;
    exemptReason?: string;
  } {
    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;

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
    const birthDate = new Date(employee.birthDate);
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
    const birthDate = new Date(employee.birthDate);
    const birthYear = birthDate.getFullYear();
    const birthMonth = birthDate.getMonth() + 1;
    const age75Year = birthYear + 75;
    return payYear === age75Year && payMonth >= birthMonth;
  }

  /**
   * 年齢フラグを取得
   */
  getAgeFlags(employee: Employee, payDate: Date): AgeFlags {
    const eligibilityResult = this.employeeEligibilityService.checkEligibility(
      employee,
      payDate
    );
    return eligibilityResult.ageFlags;
  }
}
