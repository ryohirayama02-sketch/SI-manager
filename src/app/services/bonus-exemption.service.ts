import { Injectable } from '@angular/core';
import { MaternityLeaveService } from './maternity-leave.service';
import { EmployeeEligibilityService, AgeFlags } from './employee-eligibility.service';
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
    private employeeEligibilityService: EmployeeEligibilityService
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
   */
  checkMaternityExemption(
    employee: Employee,
    payDate: Date
  ): {
    isExempted: boolean;
    exemptReason?: string;
  } {
    const result = this.maternityLeaveService.isExemptForBonus(
      payDate,
      employee
    );
    // 産休のみを判定（育休は除外）
    if (result.exempt && result.reason.includes('産前産後休業')) {
      return {
        isExempted: result.exempt,
        exemptReason: result.exempt ? result.reason : undefined,
      };
    }
    return { isExempted: false };
  }

  /**
   * 育休免除チェック
   */
  checkChildcareExemption(
    employee: Employee,
    payDate: Date
  ): {
    isExempted: boolean;
    exemptReason?: string;
  } {
    const result = this.maternityLeaveService.isExemptForBonus(
      payDate,
      employee
    );

    // 育休の場合は届出と同居の条件を確認
    if (result.exempt && result.reason.includes('育児休業')) {
      const isNotificationSubmitted =
        employee.childcareNotificationSubmitted === true;
      const isLivingTogether = employee.childcareLivingTogether === true;

      if (isNotificationSubmitted && isLivingTogether) {
        return {
          isExempted: result.exempt,
          exemptReason: result.exempt ? result.reason : undefined,
        };
      } else {
        const reasons: string[] = [];
        if (!isNotificationSubmitted) {
          reasons.push('届出未提出');
        }
        if (!isLivingTogether) {
          reasons.push('子と同居していない');
        }
        return {
          isExempted: false,
          exemptReason: `育休中だが${reasons.join('・')}のため免除されません`,
        };
      }
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
  getAgeFlags(
    employee: Employee,
    payDate: Date
  ): AgeFlags {
    const eligibilityResult = this.employeeEligibilityService.checkEligibility(
      employee,
      undefined,
      payDate
    );
    return eligibilityResult.ageFlags;
  }
}




