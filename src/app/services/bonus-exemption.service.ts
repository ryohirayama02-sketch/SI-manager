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
   * 育休期間が14日未満かどうかを判定
   * @param employee 従業員情報
   * @returns 14日未満の場合true
   */
  private isChildcareLeavePeriodLessThan14Days(employee: Employee): boolean {
    const startValue = employee.childcareLeaveStart;
    const endValue =
      employee.childcareLeaveEnd ?? employee.childcareLeaveEndExpected;

    if (!startValue || !endValue) {
      return false;
    }

    const startDate = new Date(startValue);
    const endDate = new Date(endValue);
    // 開始日から終了日までの日数を計算（開始日と終了日を含む）
    const daysDiff =
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

    return daysDiff < 14;
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
    // 育休期間が14日未満の場合は免除しない
    if (this.isChildcareLeavePeriodLessThan14Days(employee)) {
      return { isExempted: false };
    }

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
   * 賞与の場合も月次給与と同じように、支給月が40歳到達月かどうかで判定する
   */
  getAgeFlags(employee: Employee, payDate: Date): AgeFlags {
    console.log('[BonusExemptionService] getAgeFlags 開始', {
      employeeId: employee.id,
      employeeName: employee.name,
      birthDate: employee.birthDate,
      payDate: payDate.toISOString(),
    });

    // 支給月の1日時点の年齢で判定（月次給与と同じロジック）
    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;
    const payMonthFirstDay = new Date(payYear, payMonth - 1, 1);

    console.log('[BonusExemptionService] 支給月情報', {
      payYear,
      payMonth,
      payMonthFirstDay: payMonthFirstDay.toISOString(),
    });

    const eligibilityResult = this.employeeEligibilityService.checkEligibility(
      employee,
      payMonthFirstDay
    );

    // 支給月が40歳到達月かどうかを判定（月次給与と同じロジック）
    console.log('[BonusExemptionService] getCareInsuranceType を呼び出し', {
      birthDate: employee.birthDate,
      payYear,
      payMonth,
    });
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

    console.log('[BonusExemptionService] getAgeFlags 結果', {
      payYear,
      payMonth,
      careType,
      originalAgeFlags: eligibilityResult.ageFlags,
      adjustedAgeFlags: ageFlags,
      isCare2: ageFlags.isCare2,
      ageCategory: eligibilityResult.ageCategory,
      birthDate: employee.birthDate,
    });

    return ageFlags;
  }
}
