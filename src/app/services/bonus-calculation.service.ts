import { Injectable } from '@angular/core';
import { BonusPremiumCalculationCoreService } from './bonus-premium-calculation-core.service';
import { BonusNotificationService } from './bonus-notification.service';
import { BonusCalculationPreparationService } from './bonus-calculation-preparation.service';
import { BonusExemptionCheckService } from './bonus-exemption-check.service';
import { BonusPremiumCalculationOrchestrationService } from './bonus-premium-calculation-orchestration.service';
import { BonusCalculationResultBuilderService } from './bonus-calculation-result-builder.service';
import { EmployeeWorkCategoryService } from './employee-work-category.service';
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
    private premiumCalculationCore: BonusPremiumCalculationCoreService,
    private notificationService: BonusNotificationService,
    private preparationService: BonusCalculationPreparationService,
    private exemptionCheckService: BonusExemptionCheckService,
    private premiumOrchestrationService: BonusPremiumCalculationOrchestrationService,
    private resultBuilderService: BonusCalculationResultBuilderService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService
  ) {}

  async calculateBonus(
    employee: Employee,
    employeeId: string,
    bonusAmount: number,
    paymentDate: string,
    year: number
  ): Promise<BonusCalculationResult | null> {
    // バリデーション
    if (
      !this.preparationService.validateInput(
        employeeId,
        bonusAmount,
        paymentDate,
        year
      )
    ) {
      return null;
    }

    const payDate = new Date(paymentDate);
    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;

    // 勤務区分（社会保険非加入かどうか）
    const isNonInsured =
      this.employeeWorkCategoryService.isNonInsured(employee);

    // 勤務区分が社会保険未加入の場合は全保険料を0円にする
    if (isNonInsured) {
      const reasons: string[] = [
        '勤務区分が「社会保険未加入」のため保険料は0円',
      ];
      return this.resultBuilderService.buildResult(
        0, // healthEmployee
        0, // healthEmployer
        0, // careEmployee
        0, // careEmployer
        0, // pensionEmployee
        0, // pensionEmployer
        bonusAmount,
        this.resultBuilderService.calculateDeadline(payDate),
        0, // standardBonus
        0, // cappedBonusHealth
        0, // cappedBonusPension
        false, // isExempted
        false, // isRetiredNoLastDay
        false, // isOverAge70
        false, // isOverAge75
        false, // reason_exempt_maternity
        false, // reason_exempt_childcare
        false, // reason_not_lastday_retired
        false, // reason_age70
        false, // reason_age75
        false, // reason_bonus_to_salary
        false, // reason_upper_limit_health
        false, // reason_upper_limit_pension
        reasons,
        false, // requireReport
        '', // reportReason
        null, // reportDeadline
        0, // bonusCountLast12Months
        false, // isSalaryInsteadOfBonus
        undefined, // reason_bonus_to_salary_text
        undefined, // exemptReason
        [], // exemptReasons
        [], // salaryInsteadReasons
        [], // errorMessages
        [], // warningMessages
        false // reportRequired
      );
    }

    // 料率を取得
    const rates = await this.preparationService.getRates(employee, year);
    if (!rates) {
      return null;
    }

    // 標準賞与額を計算
    const standardBonus =
      this.preparationService.calculateStandardBonus(bonusAmount);

    // 上限適用（保険年度ベースで集計するため、payDateを渡す）
    console.log('[BonusCalculationService] 上限適用前', {
      employeeId,
      employeeName: employee.name,
      bonusAmount,
      standardBonus,
      payDate: payDate.toISOString(),
    });

    const caps = await this.preparationService.applyBonusCaps(
      standardBonus,
      employeeId,
      payDate
    );
    const {
      cappedBonusHealth,
      cappedBonusPension,
      reason_upper_limit_health,
      reason_upper_limit_pension,
    } = caps;

    console.log('[BonusCalculationService] 上限適用後', {
      employeeId,
      employeeName: employee.name,
      standardBonus,
      cappedBonusHealth,
      cappedBonusPension,
      reason_upper_limit_health,
      reason_upper_limit_pension,
    });

    // 退職月チェック
    const isRetiredNoLastDay = this.exemptionCheckService.checkRetirement(
      employee,
      payDate,
      payYear,
      payMonth
    );
    const reason_not_lastday_retired = isRetiredNoLastDay;

    // 産休・育休チェック
    const maternityChildcareResult =
      this.exemptionCheckService.checkMaternityAndChildcareExemptions(
        employee,
        payDate
      );
    const {
      reason_exempt_maternity,
      reason_exempt_childcare,
      isExempted,
      exemptReason,
      exemptReasons: maternityChildcareExemptReasons,
    } = maternityChildcareResult;

    // 免除理由の配列を作成
    const exemptReasons: string[] = [];
    if (isRetiredNoLastDay) {
      exemptReasons.push('退職月のため社保対象外（月末在籍なし）');
    }
    exemptReasons.push(...maternityChildcareExemptReasons);

    // 年齢チェック
    console.log('[BonusCalculationService] 年齢チェック開始', {
      employeeId: employee.id,
      employeeName: employee.name,
      birthDate: employee.birthDate,
      payDate: payDate.toISOString(),
    });
    const ageResult = this.exemptionCheckService.checkAge(employee, payDate);
    const {
      age,
      isOverAge70,
      isOverAge75,
      reason_age70,
      reason_age75,
      ageFlags,
    } = ageResult;
    console.log('[BonusCalculationService] 年齢チェック結果', {
      age,
      ageFlags,
      isCare2: ageFlags.isCare2,
      isCare1: ageFlags.isCare1,
      isNoPension: ageFlags.isNoPension,
      isNoHealth: ageFlags.isNoHealth,
    });

    // 賞与→給与扱いチェック
    const salaryResult =
      await this.notificationService.checkSalaryInsteadOfBonus(
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

    // 給与扱いの場合、標準賞与額を給与に合算
    if (isSalaryInsteadOfBonus) {
      await this.premiumCalculationCore.addBonusAsSalary(
        employeeId,
        payYear,
        payMonth,
        standardBonus
      );
    }

    // 保険料計算のベース額を決定
    console.log('[BonusCalculationService] ベース額決定前', {
      employeeId,
      employeeName: employee.name,
      isRetiredNoLastDay,
      isExempted,
      isSalaryInsteadOfBonus,
      cappedBonusHealth,
      cappedBonusPension,
    });

    const { healthBase, pensionBase } =
      this.premiumOrchestrationService.determinePremiumBases(
        isRetiredNoLastDay,
        isExempted,
        isSalaryInsteadOfBonus,
        cappedBonusHealth,
        cappedBonusPension
      );

    console.log('[BonusCalculationService] ベース額決定後', {
      employeeId,
      employeeName: employee.name,
      healthBase,
      pensionBase,
    });

    // 保険料を計算
    console.log('[BonusCalculationService] 保険料計算開始', {
      healthBase,
      pensionBase,
      age,
      ageFlags,
      isCare2: ageFlags.isCare2,
      rates: {
        health_employee: rates.health_employee,
        care_employee: rates.care_employee,
      },
    });
    const premiums = this.premiumOrchestrationService.calculatePremiums(
      healthBase,
      pensionBase,
      age,
      ageFlags,
      rates
    );
    console.log('[BonusCalculationService] 保険料計算結果', {
      healthEmployee: premiums.healthEmployee,
      careEmployee: premiums.careEmployee,
    });
    const {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
    } = premiums;

    // 理由の配列を生成
    const reasons = this.premiumOrchestrationService.buildReasons(
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

    // 賞与支払届の提出要否判定
    const reportResult = this.resultBuilderService.determineReportRequirement(
      isRetiredNoLastDay,
      isExempted,
      reason_exempt_maternity,
      reason_exempt_childcare,
      isOverAge75,
      reason_bonus_to_salary,
      payDate
    );
    const { requireReport, reportReason, reportDeadline } = reportResult;

    // 提出期限を計算
    const deadlineStr = this.resultBuilderService.calculateDeadline(payDate);

    // エラーチェック
    const { errorMessages, warningMessages } =
      this.resultBuilderService.checkErrors(
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

    // 賞与支払届の要否判定（簡易版）
    const reportRequired = this.resultBuilderService.checkReportRequired(
      standardBonus,
      isRetiredNoLastDay
    );

    // 結果を構築
    return this.resultBuilderService.buildResult(
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      bonusAmount,
      deadlineStr,
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
      exemptReasons,
      salaryInsteadReasons,
      errorMessages,
      warningMessages,
      reportRequired
    );
  }
}
