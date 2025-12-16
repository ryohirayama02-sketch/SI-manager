import { Injectable } from '@angular/core';
import { BonusExemptionService } from './bonus-exemption.service';
import { AgeFlags } from './employee-eligibility.service';
import { Employee } from '../models/employee.model';

/**
 * BonusExemptionCheckService
 *
 * 賞与計算の免除チェックを担当するサービス
 * 退職月、産休・育休、年齢のチェックを提供
 */
@Injectable({ providedIn: 'root' })
export class BonusExemptionCheckService {
  constructor(private exemptionService: BonusExemptionService) {}

  /**
   * 退職月チェック
   */
  checkRetirement(
    employee: Employee,
    payDate: Date,
    payYear: number,
    payMonth: number
  ): boolean {
    if (!employee || !payDate || !(payDate instanceof Date) || isNaN(payDate.getTime())) {
      return false;
    }
    if (isNaN(payYear) || payYear < 1900 || payYear > 2100) {
      return false;
    }
    if (isNaN(payMonth) || payMonth < 1 || payMonth > 12) {
      return false;
    }
    return this.exemptionService.checkRetirement(
      employee,
      payDate,
      payYear,
      payMonth
    );
  }

  /**
   * 産休・育休チェック
   */
  checkMaternityAndChildcareExemptions(
    employee: Employee,
    payDate: Date
  ): {
    reason_exempt_maternity: boolean;
    reason_exempt_childcare: boolean;
    isExempted: boolean;
    exemptReason: string | undefined;
    exemptReasons: string[];
  } {
    if (!employee || !payDate || !(payDate instanceof Date) || isNaN(payDate.getTime())) {
      return {
        reason_exempt_maternity: false,
        reason_exempt_childcare: false,
        isExempted: false,
        exemptReason: undefined,
        exemptReasons: [],
      };
    }
    const maternityResult = this.exemptionService.checkMaternityExemption(
      employee,
      payDate
    );
    const childcareResult = this.exemptionService.checkChildcareExemption(
      employee,
      payDate
    );
    const reason_exempt_maternity = maternityResult.isExempted;
    const reason_exempt_childcare = childcareResult.isExempted;
    const isExempted = reason_exempt_maternity || reason_exempt_childcare;
    const exemptReason =
      maternityResult.exemptReason || childcareResult.exemptReason;

    // 免除理由の配列を作成
    const exemptReasons: string[] = [];
    if (reason_exempt_maternity && maternityResult.exemptReason) {
      exemptReasons.push(maternityResult.exemptReason);
    }
    if (reason_exempt_childcare && childcareResult.exemptReason) {
      exemptReasons.push(childcareResult.exemptReason);
    }

    return {
      reason_exempt_maternity,
      reason_exempt_childcare,
      isExempted,
      exemptReason,
      exemptReasons,
    };
  }

  /**
   * 年齢チェック
   */
  checkAge(
    employee: Employee,
    payDate: Date
  ): {
    age: number;
    isOverAge70: boolean;
    isOverAge75: boolean;
    reason_age70: boolean;
    reason_age75: boolean;
    ageFlags: AgeFlags;
  } {
    if (!employee || !payDate || !(payDate instanceof Date) || isNaN(payDate.getTime())) {
      return {
        age: 0,
        isOverAge70: false,
        isOverAge75: false,
        reason_age70: false,
        reason_age75: false,
        ageFlags: {
          isCare2: false,
          isCare1: false,
          isNoPension: false,
          isNoHealth: false,
        },
      };
    }
    // ageFlags と同じ日付（payDate）で年齢を計算する
    const ageFlags = this.exemptionService.getAgeFlags(employee, payDate);
    // ageFlags は payDate で年齢を計算しているので、同じ日付で年齢を計算する
    if (!employee.birthDate) {
      return {
        age: 0,
        isOverAge70: false,
        isOverAge75: false,
        reason_age70: false,
        reason_age75: false,
        ageFlags,
      };
    }
    const birth = new Date(employee.birthDate);
    if (isNaN(birth.getTime())) {
      return {
        age: 0,
        isOverAge70: false,
        isOverAge75: false,
        reason_age70: false,
        reason_age75: false,
        ageFlags,
      };
    }
    let age = payDate.getFullYear() - birth.getFullYear();
    const monthDiff = payDate.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && payDate.getDate() < birth.getDate())
    ) {
      age--;
    }
    // 年齢の範囲チェック（0-150歳）
    if (age < 0 || age > 150) {
      age = 0;
    }
    const isOverAge70 = ageFlags.isNoPension;
    const isOverAge75 = ageFlags.isNoHealth;

    return {
      age,
      isOverAge70,
      isOverAge75,
      reason_age70: isOverAge70,
      reason_age75: isOverAge75,
      ageFlags,
    };
  }
}
