import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';
import { BonusPremiumCalculationCoreService } from './bonus-premium-calculation-core.service';
import { BonusExemptionService } from './bonus-exemption.service';
import { BonusNotificationService } from './bonus-notification.service';
import { BonusValidationService } from './bonus-validation.service';
import { Employee } from '../models/employee.model';

export interface BonusCalculationResult {
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  needsNotification: boolean;
  deadline: string;
  standardBonus?: number;
  cappedBonusHealth?: number;
  cappedBonusPension?: number;
  isExempted?: boolean;
  isRetiredNoLastDay?: boolean;
  isOverAge70?: boolean;
  isOverAge75?: boolean;
  reason_exempt_maternity?: boolean;
  reason_exempt_childcare?: boolean;
  reason_not_lastday_retired?: boolean;
  reason_age70?: boolean;
  reason_age75?: boolean;
  reason_bonus_to_salary?: boolean;
  reason_upper_limit_health?: boolean;
  reason_upper_limit_pension?: boolean;
  reasons?: string[];
  requireReport?: boolean;
  reportReason?: string;
  reportDeadline?: string | null;
  bonusCountLast12Months?: number;
  isSalaryInsteadOfBonus?: boolean;
  reason_bonus_to_salary_text?: string;
  exemptReason?: string;
  errorMessages?: string[];
  warningMessages?: string[];
  exemptReasons?: string[];
  salaryInsteadReasons?: string[];
  reportRequired?: boolean;
}

/**
 * BonusCalculationService
 * 
 * 賞与計算を担当するサービス（オーケストレーション）
 * 賞与保険料計算、免除判定、届出要否判定、エラーチェックの各サービスを統合して提供
 */
@Injectable({ providedIn: 'root' })
export class BonusCalculationService {
  constructor(
    private settingsService: SettingsService,
    private premiumCalculationCore: BonusPremiumCalculationCoreService,
    private exemptionService: BonusExemptionService,
    private notificationService: BonusNotificationService,
    private validationService: BonusValidationService
  ) {}

  async calculateBonus(
    employee: Employee,
    employeeId: string,
    bonusAmount: number,
    paymentDate: string,
    year: number
  ): Promise<BonusCalculationResult | null> {
    if (
      !employeeId ||
      bonusAmount === null ||
      bonusAmount < 0 ||
      !paymentDate ||
      !year
    ) {
      return null;
    }

    const payDate = new Date(paymentDate);
    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;

    // 料率を年度テーブルから取得
    const prefecture = (employee as any).prefecture || 'tokyo';
    const rates = await this.settingsService.getRates(
      year.toString(),
      prefecture
    );
    if (!rates) {
      return null;
    }

    // 1. 標準賞与額（1000円未満切捨て）
    const standardBonus = this.premiumCalculationCore.calculateStandardBonus(bonusAmount);

    // 2. 上限適用（年度累計を考慮）
    const caps = await this.premiumCalculationCore.applyBonusCaps(standardBonus, employeeId, payYear);
    const {
      cappedBonusHealth,
      cappedBonusPension,
      reason_upper_limit_health,
      reason_upper_limit_pension,
    } = caps;

    // 3. 退職月チェック
    const isRetiredNoLastDay = this.exemptionService.checkRetirement(
      employee,
      payDate,
      payYear,
      payMonth
    );
    const reason_not_lastday_retired = isRetiredNoLastDay;

    // 4. 産休・育休チェック
    const maternityResult = this.exemptionService.checkMaternityExemption(employee, payDate);
    const childcareResult = this.exemptionService.checkChildcareExemption(employee, payDate);
    const reason_exempt_maternity = maternityResult.isExempted;
    const reason_exempt_childcare = childcareResult.isExempted;
    const isExempted = reason_exempt_maternity || reason_exempt_childcare;
    const exemptReason =
      maternityResult.exemptReason || childcareResult.exemptReason;

    // 免除理由の配列を作成
    const exemptReasons: string[] = [];
    if (isRetiredNoLastDay) {
      exemptReasons.push('退職月のため社保対象外（月末在籍なし）');
    }
    if (reason_exempt_maternity && maternityResult.exemptReason) {
      exemptReasons.push(maternityResult.exemptReason);
    }
    if (reason_exempt_childcare && childcareResult.exemptReason) {
      exemptReasons.push(childcareResult.exemptReason);
    }

    // 5. 年齢チェック
    const age = this.exemptionService.calculateAge(employee.birthDate);
    const ageFlags = this.exemptionService.getAgeFlags(employee, payDate);
    const isOverAge70 = ageFlags.isNoPension;
    const isOverAge75 = ageFlags.isNoHealth;
    const reason_age70 = isOverAge70;
    const reason_age75 = isOverAge75;

    // 6. 賞与→給与扱いチェック（先に判定）
    const salaryResult = await this.notificationService.checkSalaryInsteadOfBonus(
      employeeId,
      payDate
    );
    const {
      isSalaryInsteadOfBonus,
      reason_bonus_to_salary_text,
      bonusCountLast12Months,
      bonusCount,
      salaryInsteadReasons,
    } = salaryResult;
    const reason_bonus_to_salary = isSalaryInsteadOfBonus;

    // 給与扱い時は全保険料0円 + salaryInsteadReasons に理由を push
    // 給与扱いの場合、標準賞与額を給与に合算する
    if (isSalaryInsteadOfBonus) {
      await this.premiumCalculationCore.addBonusAsSalary(
        employeeId,
        payYear,
        payMonth,
        standardBonus
      );
    }

    // 7. 保険料計算のベース額を決定
    let healthBase = 0;
    let pensionBase = 0;

    // 退職月（月末在籍なし）の場合、すべての保険料を0円にする
    if (isRetiredNoLastDay) {
      healthBase = 0;
      pensionBase = 0;
    }
    // 産休・育休免除の場合
    else if (isExempted) {
      healthBase = 0;
      pensionBase = 0;
    }
    // 給与扱いの場合（過去12ヶ月で4回以上）
    else if (isSalaryInsteadOfBonus) {
      healthBase = 0;
      pensionBase = 0;
    }
    // 通常の場合（上限適用済みの標準賞与額を使用）
    else {
      healthBase = cappedBonusHealth;
      pensionBase = cappedBonusPension;
    }

    // 8. 保険料計算（上限適用済みの標準賞与額ベースで計算し、年齢到達処理を適用）
    const premiums = this.premiumCalculationCore.calculatePremiums(
      healthBase,
      pensionBase,
      age,
      ageFlags,
      rates
    );
    const {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
    } = premiums;

    // 9. 理由の配列を生成
    const reasons = this.premiumCalculationCore.buildReasons(
      reason_exempt_maternity,
      reason_exempt_childcare,
      reason_not_lastday_retired,
      reason_age70,
      reason_age75,
      reason_bonus_to_salary,
      reason_upper_limit_health,
      reason_upper_limit_pension,
      standardBonus,
      cappedBonusHealth,
      cappedBonusPension
    );

    if (reason_exempt_maternity || reason_exempt_childcare) {
      reasons.push('産休/育休中の賞与は免除対象のため賞与支払届は不要');
    }

    // 10. 賞与支払届の提出要否判定
    const reportResult = this.notificationService.determineReportRequirement(
      isRetiredNoLastDay,
      isExempted,
      reason_exempt_maternity,
      reason_exempt_childcare,
      isOverAge75,
      reason_bonus_to_salary,
      payDate
    );
    const { requireReport, reportReason, reportDeadline } = reportResult;

    // 11. 賞与支払届が必要か（賞与額が0より大きい場合）
    const needsNotification = bonusAmount > 0;

    // 12. 提出期限（支給日の翌月10日）
    const deadline = new Date(
      payDate.getFullYear(),
      payDate.getMonth() + 1,
      10
    );
    const deadlineStr = deadline.toISOString().split('T')[0];

    // 13. エラーチェック
    const errorCheck = this.validationService.checkErrors(
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
    const { errorMessages, warningMessages } = errorCheck;

    // 14. 賞与支払届の要否判定（簡易版）
    const reportRequired = this.notificationService.checkReportRequired(
      standardBonus,
      isRetiredNoLastDay
    );

    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      needsNotification,
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
