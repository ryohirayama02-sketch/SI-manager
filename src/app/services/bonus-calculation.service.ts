import { Injectable } from '@angular/core';
import { BonusService } from './bonus.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import {
  EmployeeEligibilityService,
  AgeFlags,
} from './employee-eligibility.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { MaternityLeaveService } from './maternity-leave.service';
import { SettingsService } from './settings.service';

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
  // 追加: 要件に合わせた戻り値構造
  exemptReasons?: string[]; // 免除理由の配列
  salaryInsteadReasons?: string[]; // 給与扱い理由の配列
  reportRequired?: boolean; // 賞与支払届の提出要否
}

@Injectable({ providedIn: 'root' })
export class BonusCalculationService {
  constructor(
    private bonusService: BonusService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private salaryCalculationService: SalaryCalculationService,
    private maternityLeaveService: MaternityLeaveService,
    private settingsService: SettingsService
  ) {}

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

  calculateStandardBonus(bonusAmount: number): number {
    return Math.floor(bonusAmount / 1000) * 1000;
  }

  async applyBonusCaps(
    standardBonus: number,
    employeeId: string,
    payYear: number
  ): Promise<{
    cappedBonusHealth: number;
    cappedBonusPension: number;
    reason_upper_limit_health: boolean;
    reason_upper_limit_pension: boolean;
  }> {
    const HEALTH_CARE_ANNUAL_LIMIT = 5730000;
    const PENSION_SINGLE_LIMIT = 1500000;

    // 厚生年金：1回150万円上限
    const cappedBonusPension = Math.min(standardBonus, PENSION_SINGLE_LIMIT);
    const reason_upper_limit_pension = standardBonus > PENSION_SINGLE_LIMIT;

    // 健保・介保：年度累計573万円上限（今年支給済の賞与合計を読み取る）
    const existingBonuses = await this.bonusService.getBonusesForResult(
      employeeId,
      payYear
    );
    const existingTotal = existingBonuses.reduce((sum, bonus) => {
      const bonusAmount = bonus.amount || 0;
      const existingStandard = Math.floor(bonusAmount / 1000) * 1000;
      return sum + existingStandard;
    }, 0);

    const remainingLimit = Math.max(
      0,
      HEALTH_CARE_ANNUAL_LIMIT - existingTotal
    );
    const cappedBonusHealth = Math.min(standardBonus, remainingLimit);
    const reason_upper_limit_health = standardBonus > remainingLimit;

    return {
      cappedBonusHealth,
      cappedBonusPension,
      reason_upper_limit_health,
      reason_upper_limit_pension,
    };
  }

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

  checkMaternityExemption(
    employee: Employee,
    payDate: Date
  ): {
    isExempted: boolean;
    exemptReason?: string;
  } {
    // maternityLeaveService.isExemptForBonus を使用して統一
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

  checkChildcareExemption(
    employee: Employee,
    payDate: Date
  ): {
    isExempted: boolean;
    exemptReason?: string;
  } {
    // maternityLeaveService.isExemptForBonus を使用して統一
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

  async checkSalaryInsteadOfBonus(
    employeeId: string,
    payDate: Date
  ): Promise<{
    isSalaryInsteadOfBonus: boolean;
    reason_bonus_to_salary_text?: string;
    bonusCountLast12Months: number;
    bonusCount: number;
    salaryInsteadReasons: string[];
  }> {
    // 過去12ヶ月（支給日ベース）の賞与を取得（今回の支給日を含む）
    const bonusesLast12Months = await this.bonusService.getBonusesLast12Months(
      employeeId,
      payDate
    );
    // 今回の支給日を含めた過去12ヶ月の賞与回数
    const bonusCountLast12Months = bonusesLast12Months.length;
    // 今回を含む総回数（過去12ヶ月の回数と同じ）
    const bonusCount = bonusCountLast12Months;

    const salaryInsteadReasons: string[] = [];
    let isSalaryInsteadOfBonus = false;
    let reason_bonus_to_salary_text: string | undefined = undefined;

    // 過去12ヶ月の賞与支給回数から判定
    // 3回以内 → 賞与扱い
    // 4回以上 → 給与扱い（賞与保険料なし）
    if (bonusCountLast12Months >= 4) {
      isSalaryInsteadOfBonus = true;
      reason_bonus_to_salary_text = `過去12ヶ月の賞与支給回数が${bonusCountLast12Months}回（4回以上）のため、今回の支給は賞与ではなく給与として扱われます。`;
      salaryInsteadReasons.push(
        `過去12ヶ月の賞与支給回数が${bonusCountLast12Months}回（4回以上）のため給与扱い`
      );
    } else {
      // 3回以内は賞与扱い
      salaryInsteadReasons.push(
        `過去12ヶ月の賞与支給回数が${bonusCountLast12Months}回（3回以内）のため賞与扱い`
      );
    }

    return {
      isSalaryInsteadOfBonus,
      reason_bonus_to_salary_text,
      bonusCountLast12Months,
      bonusCount,
      salaryInsteadReasons,
    };
  }

  calculatePremiums(
    healthBase: number,
    pensionBase: number,
    age: number,
    ageFlags: AgeFlags,
    rates: any
  ): {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
  } {
    // 年齢到達の例外処理（ageFlags を使用）
    // ageFlags.isNoHealth（75歳以上） → 健保・介保も0円
    const actualHealthBase = ageFlags.isNoHealth ? 0 : healthBase;
    // ageFlags.isNoPension（70歳以上） → 厚生年金は0円
    const actualPensionBase = ageFlags.isNoPension ? 0 : pensionBase;

    // 介護保険は40〜64歳のみ（ageFlags.isCare2）
    const isCareEligible = ageFlags.isCare2;

    // 保険料計算
    // 健康保険：総額を計算 → 折半 → それぞれ10円未満切り捨て
    const healthTotal = actualHealthBase * (rates.health_employee + rates.health_employer);
    const healthHalf = healthTotal / 2;
    const healthEmployee = Math.floor(healthHalf / 10) * 10; // 10円未満切り捨て
    const healthEmployer = Math.floor(healthHalf / 10) * 10; // 10円未満切り捨て
    
    // 介護保険：総額を計算 → 折半 → それぞれ10円未満切り捨て
    const careTotal = isCareEligible
      ? actualHealthBase * (rates.care_employee + rates.care_employer)
      : 0;
    const careHalf = careTotal / 2;
    const careEmployee = isCareEligible
      ? Math.floor(careHalf / 10) * 10 // 10円未満切り捨て
      : 0;
    const careEmployer = isCareEligible
      ? Math.floor(careHalf / 10) * 10 // 10円未満切り捨て
      : 0;
    
    // 厚生年金：個人分を計算 → 10円未満切り捨て → 会社分 = 総額 - 個人分
    const pensionTotal = actualPensionBase * (rates.pension_employee + rates.pension_employer);
    const pensionHalf = pensionTotal / 2;
    const pensionEmployee = Math.floor(pensionHalf / 10) * 10; // 個人分：10円未満切り捨て
    const pensionEmployer = pensionTotal - pensionEmployee; // 会社分 = 総額 - 個人分

    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
    };
  }

  buildReasons(
    reason_exempt_maternity: boolean,
    reason_exempt_childcare: boolean,
    reason_not_lastday_retired: boolean,
    reason_age70: boolean,
    reason_age75: boolean,
    reason_bonus_to_salary: boolean,
    reason_upper_limit_health: boolean,
    reason_upper_limit_pension: boolean,
    standardBonus: number,
    cappedBonusHealth: number,
    cappedBonusPension: number
  ): string[] {
    const reasons: string[] = [];

    if (reason_exempt_maternity) {
      reasons.push('産前産後休業中のため、賞与保険料は免除されます');
    }

    if (reason_exempt_childcare) {
      reasons.push('育児休業中のため、賞与保険料は免除されます');
    }

    if (reason_not_lastday_retired) {
      reasons.push(
        '退職日の関係で月末在籍がないため、賞与は社会保険料の対象外です'
      );
      reasons.push('退職月の月末在籍が無いため賞与支払届は不要');
    }

    if (reason_age70) {
      reasons.push('70歳到達月のため厚生年金の賞与保険料は停止されます');
    }

    if (reason_age75) {
      reasons.push('75歳到達月のため健保・介保の賞与保険料は停止されます');
    }

    if (reason_bonus_to_salary) {
      reasons.push(
        '過去1年間の賞与支給回数が3回を超えているため、今回の支給は賞与ではなく給与として扱われます。'
      );
    }

    if (reason_upper_limit_health) {
      reasons.push(
        `健保・介保の年度上限（573万円）を適用しました（標準賞与額: ${standardBonus.toLocaleString()}円 → 上限適用後: ${cappedBonusHealth.toLocaleString()}円）`
      );
    }

    if (reason_upper_limit_pension) {
      reasons.push(
        `厚生年金の1回あたり上限（150万円）を適用しました（標準賞与額: ${standardBonus.toLocaleString()}円 → 上限適用後: ${cappedBonusPension.toLocaleString()}円）`
      );
    }

    return reasons;
  }

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
    let requireReport = true;
    let reportReason = '';
    let reportDeadline: string | null = null;

    if (isRetiredNoLastDay) {
      requireReport = false;
      reportReason = '退職月の月末在籍が無いため賞与支払届は不要です';
    } else if (isExempted) {
      requireReport = false;
      if (reason_exempt_maternity) {
        reportReason =
          '産前産後休業中の賞与は免除対象のため賞与支払届は不要です';
      } else if (reason_exempt_childcare) {
        reportReason = '育児休業中の賞与は免除対象のため賞与支払届は不要です';
      } else {
        reportReason = '産休/育休中の賞与は免除対象のため賞与支払届は不要です';
      }
    } else if (isOverAge75) {
      requireReport = false;
      reportReason =
        '75歳到達月で健康保険・介護保険の資格喪失のため賞与支払届は不要です';
    } else if (reason_bonus_to_salary) {
      requireReport = false;
      reportReason =
        '年度内4回目以降の賞与は給与扱いとなるため賞与支払届は不要です';
    } else {
      requireReport = true;
      reportReason =
        '支給された賞与は社会保険の対象となるため、賞与支払届が必要です';

      const deadlineDate = new Date(payDate);
      deadlineDate.setDate(deadlineDate.getDate() + 5);
      reportDeadline = deadlineDate.toISOString().split('T')[0];
    }

    return { requireReport, reportReason, reportDeadline };
  }

  /**
   * 賞与支払届の要否を判定する（簡易版）
   * @param standardBonus 標準賞与額
   * @param isRetiredNoLastDay 支給月の月末在籍がないか
   * @returns 提出が必要な場合true
   */
  checkReportRequired(
    standardBonus: number,
    isRetiredNoLastDay: boolean
  ): boolean {
    // 標準賞与額が1,000円未満 → false
    if (standardBonus < 1000) {
      return false;
    }

    // 支給月の月末在籍がfalse → false
    if (isRetiredNoLastDay) {
      return false;
    }

    // 上記以外 → true（育休・産休免除でも提出必要）
    return true;
  }

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
    const payDay = payDate.getDate();
    const lastDayOfMonth = new Date(payYear, payMonth, 0).getDate();

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
    const standardBonus = this.calculateStandardBonus(bonusAmount);

    // 2. 上限適用（年度累計を考慮）
    const caps = await this.applyBonusCaps(standardBonus, employeeId, payYear);
    const {
      cappedBonusHealth,
      cappedBonusPension,
      reason_upper_limit_health,
      reason_upper_limit_pension,
    } = caps;

    // 3. 退職月チェック
    const isRetiredNoLastDay = this.checkRetirement(
      employee,
      payDate,
      payYear,
      payMonth
    );
    const reason_not_lastday_retired = isRetiredNoLastDay;

    // 4. 産休・育休チェック
    const maternityResult = this.checkMaternityExemption(employee, payDate);
    const childcareResult = this.checkChildcareExemption(employee, payDate);
    const reason_exempt_maternity = maternityResult.isExempted;
    const reason_exempt_childcare = childcareResult.isExempted;
    const isExempted = reason_exempt_maternity || reason_exempt_childcare;
    const exemptReason =
      maternityResult.exemptReason || childcareResult.exemptReason;

    // 免除理由の配列を作成
    const exemptReasons: string[] = [];
    // 退職月の賞与の扱い：月末在籍がない場合 → すべての保険料を0円にし、exemptReasonsに追加
    if (isRetiredNoLastDay) {
      exemptReasons.push('退職月のため社保対象外（月末在籍なし）');
    }
    if (reason_exempt_maternity && maternityResult.exemptReason) {
      exemptReasons.push(maternityResult.exemptReason);
    }
    if (reason_exempt_childcare && childcareResult.exemptReason) {
      exemptReasons.push(childcareResult.exemptReason);
    }

    // 5. 年齢チェック（employee-eligibility.service を使用）
    const age = this.calculateAge(employee.birthDate);
    const eligibilityResult = this.employeeEligibilityService.checkEligibility(
      employee,
      undefined,
      payDate
    );
    const ageFlags = eligibilityResult.ageFlags;
    const isOverAge70 = ageFlags.isNoPension;
    const isOverAge75 = ageFlags.isNoHealth;
    const reason_age70 = isOverAge70;
    const reason_age75 = isOverAge75;

    // 6. 賞与→給与扱いチェック（先に判定）
    const salaryResult = await this.checkSalaryInsteadOfBonus(
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

    // 給与扱い時は全保険料0円 + salaryInsteadReasons に理由を push（既に checkSalaryInsteadOfBonus で設定済み）
    // 給与扱いの場合、標準賞与額を給与に合算する
    if (isSalaryInsteadOfBonus) {
      try {
        await this.salaryCalculationService.addBonusAsSalary(
          employeeId,
          payYear,
          payMonth,
          standardBonus
        );
      } catch (error) {
        // エラーは上位でハンドリング（ログ出力などは上位で行う）
        console.error('給与への賞与合算処理でエラーが発生しました:', error);
      }
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
      // 健保・介保は年度累計上限適用済みの値（cappedBonusHealth）
      healthBase = cappedBonusHealth;
      // 厚年は1回上限適用済みの値（cappedBonusPension）
      pensionBase = cappedBonusPension;
    }

    // 8. 保険料計算（上限適用済みの標準賞与額ベースで計算し、年齢到達処理を適用）
    const premiums = this.calculatePremiums(
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
    const reasons = this.buildReasons(
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
    const reportResult = this.determineReportRequirement(
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
    const errorCheck = this.checkErrors(
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
    const reportRequired = this.checkReportRequired(
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
