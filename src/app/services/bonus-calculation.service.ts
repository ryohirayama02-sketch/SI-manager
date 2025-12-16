import { Injectable } from '@angular/core';
import { BonusPremiumCalculationCoreService } from './bonus-premium-calculation-core.service';
import { BonusNotificationService } from './bonus-notification.service';
import { BonusCalculationPreparationService } from './bonus-calculation-preparation.service';
import { BonusExemptionCheckService } from './bonus-exemption-check.service';
import { BonusPremiumCalculationOrchestrationService } from './bonus-premium-calculation-orchestration.service';
import { BonusCalculationResultBuilderService } from './bonus-calculation-result-builder.service';
import { EmployeeWorkCategoryService } from './employee-work-category.service';
import { BonusService } from './bonus.service';
import { RoomIdService } from './room-id.service';
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
    private employeeWorkCategoryService: EmployeeWorkCategoryService,
    private bonusService: BonusService,
    private roomIdService: RoomIdService
  ) {}

  async calculateBonus(
    employee: Employee,
    employeeId: string,
    bonusAmount: number,
    paymentDate: string,
    year: number
  ): Promise<BonusCalculationResult | null> {
    // バリデーション
    if (!employee || !employeeId) {
      return null;
    }
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
    if (isNaN(payDate.getTime())) {
      return null;
    }
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

    // 同じ月の既存賞与を取得して合算
    const roomId = this.roomIdService.requireRoomId();
    const sameMonthBonuses = await this.bonusService.listBonuses(
      roomId,
      employeeId,
      payYear
    );
    
    // 同じ月の既存賞与をフィルタリング（今回計算中の賞与より前の日付のみ）
    const currentPayDate = new Date(payDate);
    currentPayDate.setHours(0, 0, 0, 0);
    
    const sameMonthExistingBonuses = sameMonthBonuses.filter((bonus) => {
      if (!bonus || !bonus.payDate) return false;
      const bonusPayDate = new Date(bonus.payDate);
      if (isNaN(bonusPayDate.getTime())) return false;
      bonusPayDate.setHours(0, 0, 0, 0);
      const bonusYear = bonusPayDate.getFullYear();
      const bonusMonth = bonusPayDate.getMonth() + 1;
      // 同じ年月で、かつ今回の賞与より前の日付
      return (
        bonusYear === payYear &&
        bonusMonth === payMonth &&
        bonusPayDate < currentPayDate
      );
    });

    // 同じ月の既存賞与の金額を合算
    const sameMonthTotalAmount = sameMonthExistingBonuses.reduce(
      (sum, bonus) => {
        if (!bonus) return sum;
        const amount = bonus.amount;
        if (amount === null || amount === undefined || isNaN(amount) || amount < 0) {
          return sum;
        }
        return sum + amount;
      },
      0
    );

    // 今回の賞与を含めた同じ月の合計金額
    const totalAmountForMonth = sameMonthTotalAmount + bonusAmount;

    // 合算後の金額を標準賞与額に変換（1000円未満切捨て）
    const standardBonus =
      this.preparationService.calculateStandardBonus(totalAmountForMonth);

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
      // 退職月で月末在籍なし、または退職後の賞与の場合
      if (employee.retireDate) {
        const payMonthKey = payYear * 12 + (payMonth - 1);
        const retireDate = new Date(employee.retireDate);
        const retireYear = retireDate.getFullYear();
        const retireMonth = retireDate.getMonth() + 1;
        const retireMonthKey = retireYear * 12 + (retireMonth - 1);
        if (payMonthKey > retireMonthKey) {
          exemptReasons.push('退職後の賞与のため社保対象外');
        } else {
          exemptReasons.push('退職月のため社保対象外（月末在籍なし）');
        }
      } else {
        exemptReasons.push('退職月のため社保対象外（月末在籍なし）');
      }
    }
    exemptReasons.push(...maternityChildcareExemptReasons);

    // 年齢チェック
    const ageResult = this.exemptionCheckService.checkAge(employee, payDate);
    const {
      age,
      isOverAge70,
      isOverAge75,
      reason_age70,
      reason_age75,
      ageFlags,
    } = ageResult;

    // 賞与支給回数の取得（表示用）
    // roomIdは既に151行目で宣言済み
    const targetYears = [payDate.getFullYear() - 1, payDate.getFullYear()];
    let bonusesLast12Months: any[] = [];
    for (const y of targetYears) {
      if (isNaN(y) || y < 1900 || y > 2100) continue;
      const list = await this.bonusService.listBonuses(roomId, employeeId, y);
      if (list && Array.isArray(list)) {
        bonusesLast12Months.push(...list);
      }
    }
    const bonusCountLast12Months = bonusesLast12Months.length;
    const bonusCount = bonusCountLast12Months;
    const isSalaryInsteadOfBonus = false;
    const reason_bonus_to_salary_text = undefined;
    const salaryInsteadReasons: string[] = [];
    const reason_bonus_to_salary = false;

    // 保険料計算のベース額を決定
    const { healthBase, pensionBase } =
      this.premiumOrchestrationService.determinePremiumBases(
        isRetiredNoLastDay,
        isExempted,
        isSalaryInsteadOfBonus,
        cappedBonusHealth,
        cappedBonusPension
      );

    // 保険料を計算
    const premiums = this.premiumOrchestrationService.calculatePremiums(
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
