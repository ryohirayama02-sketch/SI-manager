import { Injectable } from '@angular/core';
import { BonusValidationService } from './bonus-validation.service';
import { BonusNotificationService } from './bonus-notification.service';
import { BonusCalculationResult } from './bonus-calculation.service';
import { Employee } from '../models/employee.model';

/**
 * BonusCalculationResultBuilderService
 * 
 * 賞与計算結果の組み立てを担当するサービス
 * エラーチェック、届出要否判定、結果オブジェクトの構築を提供
 */
@Injectable({ providedIn: 'root' })
export class BonusCalculationResultBuilderService {
  constructor(
    private validationService: BonusValidationService,
    private notificationService: BonusNotificationService
  ) {}

  /**
   * 賞与支払届の提出要否を判定
   */
  determineReportRequirement(
    isRetiredNoLastDay: boolean,
    isExempted: boolean,
    reason_exempt_maternity: boolean,
    reason_exempt_childcare: boolean,
    isOverAge75: boolean,
    reason_bonus_to_salary: boolean,
    payDate: Date
  ): {
    requireReport: boolean;
    reportReason: string;
    reportDeadline: string | null;
  } {
    return this.notificationService.determineReportRequirement(
      isRetiredNoLastDay,
      isExempted,
      reason_exempt_maternity,
      reason_exempt_childcare,
      isOverAge75,
      reason_bonus_to_salary,
      payDate
    );
  }

  /**
   * 提出期限を計算
   */
  calculateDeadline(payDate: Date): string {
    const deadline = new Date(
      payDate.getFullYear(),
      payDate.getMonth() + 1,
      10
    );
    return deadline.toISOString().split('T')[0];
  }

  /**
   * エラーチェックを実行
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
    bonusCount: number | undefined,
    bonusCountLast12Months: number | undefined
  ): {
    errorMessages: string[];
    warningMessages: string[];
  } {
    return this.validationService.checkErrors(
      employee,
      payDate,
      age,
      isExempted,
      reason_exempt_childcare,
      isOverAge70,
      isOverAge75,
      pensionEmployee,
      healthEmployee,
      careEmployee,
      bonusCount,
      bonusCountLast12Months
    );
  }

  /**
   * 賞与支払届の要否判定（簡易版）
   */
  checkReportRequired(
    standardBonus: number,
    isRetiredNoLastDay: boolean
  ): boolean {
    return this.notificationService.checkReportRequired(
      standardBonus,
      isRetiredNoLastDay
    );
  }

  /**
   * 結果オブジェクトを構築
   */
  buildResult(
    healthEmployee: number,
    healthEmployer: number,
    careEmployee: number,
    careEmployer: number,
    pensionEmployee: number,
    pensionEmployer: number,
    bonusAmount: number,
    deadlineStr: string,
    standardBonus: number,
    cappedBonusHealth: number,
    cappedBonusPension: number,
    isExempted: boolean,
    isRetiredNoLastDay: boolean,
    isOverAge70: boolean,
    isOverAge75: boolean,
    reason_exempt_maternity: boolean,
    reason_exempt_childcare: boolean,
    reason_not_lastday_retired: boolean,
    reason_age70: boolean,
    reason_age75: boolean,
    reason_bonus_to_salary: boolean,
    reason_upper_limit_health: boolean,
    reason_upper_limit_pension: boolean,
    reasons: string[],
    requireReport: boolean,
    reportReason: string,
    reportDeadline: string | null,
    bonusCountLast12Months: number | undefined,
    isSalaryInsteadOfBonus: boolean,
    reason_bonus_to_salary_text: string | undefined,
    exemptReason: string | undefined,
    exemptReasons: string[],
    salaryInsteadReasons: string[],
    errorMessages: string[],
    warningMessages: string[],
    reportRequired: boolean
  ): BonusCalculationResult {
    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      needsNotification: bonusAmount > 0,
      deadline: deadlineStr,
      standardBonus,
      cappedBonusHealth,
      cappedBonusPension,
      isExempted,
      isRetiredNoLastDay,
      isOverAge70,
      isOverAge75,
      reason_exempt_maternity,
      reason_exempt_childcare,
      reason_not_lastday_retired,
      reason_age70,
      reason_age75,
      reason_bonus_to_salary,
      reason_upper_limit_health,
      reason_upper_limit_pension,
      reasons,
      requireReport,
      reportReason,
      reportDeadline,
      bonusCountLast12Months,
      isSalaryInsteadOfBonus,
      reason_bonus_to_salary_text,
      exemptReason,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
      warningMessages: warningMessages.length > 0 ? warningMessages : undefined,
      exemptReasons: exemptReasons.length > 0 ? exemptReasons : undefined,
      salaryInsteadReasons:
        salaryInsteadReasons.length > 0 ? salaryInsteadReasons : undefined,
      reportRequired: reportRequired,
    };
  }
}

