import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

/**
 * BonusValidationService
 * 
 * 賞与計算のエラーチェックを担当するサービス
 * 年齢、在籍期間、育休条件などの矛盾をチェック
 */
@Injectable({ providedIn: 'root' })
export class BonusValidationService {
  /**
   * エラーチェック
   */
  checkErrors(
    employee: Employee,
    payDate: Date,
    age: number,
    isExempted: boolean,
    reason_exempt_childcare: boolean,
    isOverAge70: boolean,
    isOverAge75: boolean,
    pensionEmployee: number,
    healthEmployee: number,
    careEmployee: number,
    bonusCount: number,
    bonusCountLast12Months: number | undefined
  ): {
    errorMessages: string[];
    warningMessages: string[];
  } {
    const errorMessages: string[] = [];
    const warningMessages: string[] = [];

    // 1. 賞与の支給日が入社前または退職後
    if (employee.joinDate) {
      const joinDate = new Date(employee.joinDate);
      if (payDate < joinDate) {
        errorMessages.push('支給日が在籍期間外です（入社前）');
      }
    }
    if (employee.retireDate) {
      const retireDate = new Date(employee.retireDate);
      if (payDate > retireDate) {
        errorMessages.push('支給日が在籍期間外です（退職後）');
      }
    }

    // 2. 育休 or 産休免除の条件不整合
    if (
      employee.maternityLeaveStart &&
      employee.maternityLeaveEnd &&
      employee.childcareLeaveStart &&
      employee.childcareLeaveEnd
    ) {
      const matStart = new Date(employee.maternityLeaveStart);
      const matEnd = new Date(employee.maternityLeaveEnd);
      const childStart = new Date(employee.childcareLeaveStart);
      const childEnd = new Date(employee.childcareLeaveEnd);

      if (matStart <= childEnd && matEnd >= childStart) {
        const daysBetween =
          (childStart.getTime() - matEnd.getTime()) / (1000 * 60 * 60 * 24);
        if (daysBetween > 30) {
          errorMessages.push('産休・育休の設定が矛盾しています');
        }
      }
    }

    // 育休期間中なのに届出未提出だが免除されている場合のチェック
    if (employee.childcareLeaveStart && employee.childcareLeaveEnd) {
      const childStart = new Date(employee.childcareLeaveStart);
      const childEnd = new Date(employee.childcareLeaveEnd);
      if (payDate >= childStart && payDate <= childEnd) {
        const isNotificationSubmitted =
          employee.childcareNotificationSubmitted === true;
        const isLivingTogether = employee.childcareLivingTogether === true;
        if (
          isExempted &&
          reason_exempt_childcare &&
          (!isNotificationSubmitted || !isLivingTogether)
        ) {
          errorMessages.push(
            '育休期間中で届出未提出または子と同居していないのに、免除されています。設定を確認してください'
          );
        }
      }
    }

    // 4. 70歳以上なのに厚生年金の保険料が計算されている
    if (age >= 70 && pensionEmployee > 0 && !isOverAge70) {
      errorMessages.push('70歳以上は厚生年金保険料は発生しません');
    }

    // 5. 75歳以上なのに健康保険・介護保険が計算されている
    if (age >= 75 && (healthEmployee > 0 || careEmployee > 0) && !isOverAge75) {
      errorMessages.push('75歳以上は健康保険・介護保険は発生しません');
    }

    // 6. 賞与 → 給与扱いの誤判定
    if (
      bonusCountLast12Months !== undefined &&
      Math.abs(bonusCount - (bonusCountLast12Months + 1)) > 2
    ) {
      errorMessages.push('賞与の支給回数ロジックに矛盾があります');
    }

    return { errorMessages, warningMessages };
  }
}

