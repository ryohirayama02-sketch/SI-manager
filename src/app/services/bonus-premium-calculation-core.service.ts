import { Injectable } from '@angular/core';
import { BonusService } from './bonus.service';
import { SettingsService } from './settings.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { RoomIdService } from './room-id.service';
import {
  EmployeeEligibilityService,
  AgeFlags,
} from './employee-eligibility.service';
import { Employee } from '../models/employee.model';

/**
 * BonusPremiumCalculationCoreService
 *
 * 賞与保険料計算のコアロジックを担当するサービス
 * 標準賞与額計算、上限適用、保険料計算を提供
 */
@Injectable({ providedIn: 'root' })
export class BonusPremiumCalculationCoreService {
  constructor(
    private bonusService: BonusService,
    private settingsService: SettingsService,
    private salaryCalculationService: SalaryCalculationService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 標準賞与額を計算（1000円未満切捨て）
   */
  calculateStandardBonus(bonusAmount: number): number {
    return Math.floor(bonusAmount / 1000) * 1000;
  }

  /**
   * 賞与の上限を適用
   * 同じ月に複数回の賞与がある場合は、それらを合算してから上限を適用する
   */
  async applyBonusCaps(
    standardBonus: number,
    employeeId: string,
    payDate: Date
  ): Promise<{
    cappedBonusHealth: number;
    cappedBonusPension: number;
    reason_upper_limit_health: boolean;
    reason_upper_limit_pension: boolean;
  }> {
    const HEALTH_CARE_ANNUAL_LIMIT = 5730000;
    const PENSION_MONTHLY_LIMIT = 1500000; // 厚生年金：月当たり150万円上限

    // standardBonusは既に同じ月の合計標準賞与額として渡されている
    // （bonus-calculation.service.tsで同じ月の賞与を合算してから標準賞与額に変換済み）

    // 厚生年金：月当たり150万円上限
    const cappedBonusPension = Math.min(standardBonus, PENSION_MONTHLY_LIMIT);
    const reason_upper_limit_pension = standardBonus > PENSION_MONTHLY_LIMIT;

    // 健保・介保：保険年度（4/1〜翌3/31）累計573万円上限
    // 今回の支給日が属する保険年度内の賞与合計を取得
    const roomId = this.roomIdService.requireRoomId();
    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;

    // 保険年度の開始年を計算（4月1日〜翌年3月31日）
    // 例：2025年2月 → 保険年度は2024年4月1日〜2025年3月31日 → 開始年は2024
    // 例：2025年4月 → 保険年度は2025年4月1日〜2026年3月31日 → 開始年は2025
    const insuranceYearStart = payMonth >= 4 ? payYear : payYear - 1;
    const insuranceYearEnd = insuranceYearStart + 1;

    console.log(
      '[BonusPremiumCalculationCoreService] applyBonusCaps: 保険年度判定',
      {
        employeeId,
        payDate: payDate.toISOString(),
        payYear,
        payMonth,
        insuranceYearStart,
        insuranceYearEnd,
        insuranceYearRange: `${insuranceYearStart}年4月1日〜${insuranceYearEnd}年3月31日`,
      }
    );

    // 保険年度に含まれる年度の賞与を取得（開始年度と終了年度の両方）
    const bonusesYearStart = await this.bonusService.listBonuses(
      roomId,
      employeeId,
      insuranceYearStart
    );
    const bonusesYearEnd = await this.bonusService.listBonuses(
      roomId,
      employeeId,
      insuranceYearEnd
    );

    // 保険年度の範囲内の賞与のみをフィルタリング
    const insuranceYearStartDate = new Date(insuranceYearStart, 3, 1); // 4月1日
    const insuranceYearEndDate = new Date(insuranceYearEnd, 2, 31, 23, 59, 59); // 3月31日23:59:59

    const allBonuses = [...bonusesYearStart, ...bonusesYearEnd];
    const existingBonuses = allBonuses.filter((bonus) => {
      if (!bonus.payDate) return false;
      const bonusPayDate = new Date(bonus.payDate);
      return (
        bonusPayDate >= insuranceYearStartDate &&
        bonusPayDate <= insuranceYearEndDate
      );
    });

    // 今回計算中の賞与より前の支給日の賞与のみを累計に含める（時系列順に上限を適用）
    // 同じ月の既存賞与は既にstandardBonusに含まれているため、同じ月の賞与は除外する
    const currentPayDate = new Date(payDate);
    currentPayDate.setHours(0, 0, 0, 0); // 時刻を0にして日付のみで比較
    const otherBonuses = existingBonuses.filter((bonus) => {
      if (!bonus.payDate) return false; // payDateがない場合は除外
      const bonusPayDate = new Date(bonus.payDate);
      bonusPayDate.setHours(0, 0, 0, 0); // 時刻を0にして日付のみで比較
      const bonusYear = bonusPayDate.getFullYear();
      const bonusMonth = bonusPayDate.getMonth() + 1;
      // 現在の賞与より前の日付で、かつ同じ月ではない賞与のみ
      return (
        bonusPayDate < currentPayDate &&
        !(bonusYear === payYear && bonusMonth === payMonth)
      );
    });

    const currentPayDateStr = currentPayDate.toISOString().split('T')[0]; // ログ用
    console.log(
      '[BonusPremiumCalculationCoreService] applyBonusCaps: 既存賞与データ',
      {
        employeeId,
        payDate: payDate.toISOString(),
        currentPayDateStr,
        insuranceYearStart,
        insuranceYearEnd,
        insuranceYearRange: `${insuranceYearStart}年4月1日〜${insuranceYearEnd}年3月31日`,
        bonusesYearStartCount: bonusesYearStart.length,
        bonusesYearEndCount: bonusesYearEnd.length,
        allBonusesCount: allBonuses.length,
        existingBonusesCount: existingBonuses.length,
        otherBonusesCount: otherBonuses.length,
        standardBonus,
        existingBonuses: existingBonuses.map((b) => {
          if (!b.payDate) {
            return {
              id: b.id,
              payDate: b.payDate,
              amount: b.amount,
              standardBonusAmount: b.standardBonusAmount,
              bonusPayDate: null,
              isInInsuranceYear: false,
              isExcluded: false,
              isBeforeCurrent: false,
            };
          }
          const bonusPayDate = new Date(b.payDate);
          bonusPayDate.setHours(0, 0, 0, 0);
          const isBeforeCurrent = bonusPayDate < currentPayDate;
          return {
            id: b.id,
            payDate: b.payDate,
            amount: b.amount,
            standardBonusAmount: b.standardBonusAmount,
            bonusPayDate: bonusPayDate,
            isInInsuranceYear:
              bonusPayDate >= insuranceYearStartDate &&
              bonusPayDate <= insuranceYearEndDate,
            isExcluded: !isBeforeCurrent,
            isBeforeCurrent,
          };
        }),
        otherBonuses: otherBonuses.map((b) => ({
          id: b.id,
          payDate: b.payDate,
          amount: b.amount,
          standardBonusAmount: b.standardBonusAmount,
        })),
      }
    );

    const existingTotal = otherBonuses.reduce((sum, bonus) => {
      // 上限適用後の値（cappedBonusHealth）が保存されている場合はそれを使用
      // なければstandardBonusAmountを使用、それもなければamountから計算
      let existingCapped: number;
      if (
        bonus.cappedBonusHealth !== undefined &&
        bonus.cappedBonusHealth !== null
      ) {
        existingCapped = bonus.cappedBonusHealth;
      } else if (
        bonus.standardBonusAmount !== undefined &&
        bonus.standardBonusAmount !== null
      ) {
        existingCapped = bonus.standardBonusAmount;
      } else {
        existingCapped = Math.floor((bonus.amount || 0) / 1000) * 1000;
      }

      console.log(
        '[BonusPremiumCalculationCoreService] applyBonusCaps: 累計に加算',
        {
          employeeId,
          bonusPayDate: bonus.payDate,
          bonusAmount: bonus.amount,
          standardBonusAmount: bonus.standardBonusAmount,
          cappedBonusHealth: bonus.cappedBonusHealth,
          existingCapped,
          sumBefore: sum,
          sumAfter: sum + existingCapped,
        }
      );

      return sum + existingCapped;
    }, 0);

    // 健康保険の上限適用：保険年度累計573万円上限
    // 同じ月の既存賞与は既にstandardBonusに含まれているため、existingTotalをそのまま使用
    const totalExistingForHealth = existingTotal;
    const remainingLimit = Math.max(
      0,
      HEALTH_CARE_ANNUAL_LIMIT - totalExistingForHealth
    );
    const cappedBonusHealth = Math.min(standardBonus, remainingLimit);
    const reason_upper_limit_health = standardBonus > remainingLimit;

    console.log(
      '[BonusPremiumCalculationCoreService] applyBonusCaps: 上限適用結果',
      {
        employeeId,
        payDate: payDate.toISOString(),
        standardBonus,
        HEALTH_CARE_ANNUAL_LIMIT,
        existingTotal,
        totalExistingForHealth,
        remainingLimit,
        cappedBonusHealth,
        reason_upper_limit_health,
        PENSION_MONTHLY_LIMIT,
        cappedBonusPension,
        reason_upper_limit_pension,
      }
    );

    return {
      cappedBonusHealth,
      cappedBonusPension,
      reason_upper_limit_health,
      reason_upper_limit_pension,
    };
  }

  /**
   * 保険料を計算
   */
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
    const actualHealthBase = ageFlags.isNoHealth ? 0 : healthBase;
    const actualPensionBase = ageFlags.isNoPension ? 0 : pensionBase;

    // 介護保険は40〜64歳のみ（ageFlags.isCare2）
    const isCareEligible = ageFlags.isCare2;
    console.log('[BonusPremiumCalculationCoreService] 介護保険加入判定', {
      age,
      ageFlags,
      isCare2: ageFlags.isCare2,
      isCareEligible,
      healthBase,
    });

    // 保険料計算
    // 健康保険の計算方法：
    // 介護保険に加入していない場合（40歳未満・65歳以上）：標準賞与額×健保保険料率
    // 介護保険に加入している場合（40歳～64歳）：標準賞与額×（健康保険料率＋介護保険料率）
    // 50銭未満切り捨て、50銭超切り上げ
    const healthRateEmployee = isCareEligible
      ? rates.health_employee + rates.care_employee
      : rates.health_employee;
    console.log('[BonusPremiumCalculationCoreService] 健康保険料率', {
      isCareEligible,
      healthRateEmployee,
      health_employee_rate: rates.health_employee,
      care_employee_rate: rates.care_employee,
    });
    const healthRateEmployer = isCareEligible
      ? rates.health_employer + rates.care_employer
      : rates.health_employer;

    // 検証: 65歳以上（isCare2=false）の場合、健康保険料率に介護保険料率が含まれていないことを確認
    if (age >= 65 && !ageFlags.isCare2) {
      if (healthRateEmployee !== rates.health_employee) {
        console.error(
          '[BonusPremiumCalculationCoreService] 検証エラー: 65歳以上で健康保険料率に介護保険料率が含まれています',
          {
            age,
            ageFlags,
            isCare2: ageFlags.isCare2,
            healthRateEmployee,
            expectedHealthRate: rates.health_employee,
            care_employee_rate: rates.care_employee,
          }
        );
        // エラーをログに記録するが、計算は続行（本番環境での影響を最小化）
      }
    }

    // 健康保険：総額を計算 → 折半 → それぞれ50銭ルールで丸める
    const healthTotal =
      actualHealthBase * (healthRateEmployee + healthRateEmployer);
    const healthHalf = healthTotal / 2;
    const healthEmployee = this.roundWith50SenRule(healthHalf);
    const healthEmployer = this.roundWith50SenRule(healthHalf);

    // 介護保険は健康保険に含まれるため、個別の値は0とする（後方互換性のため残す）
    const careEmployee = 0;
    const careEmployer = 0;

    // 厚生年金：個人分を計算 → 50銭ルールで丸める → 会社分 = 総額 - 個人分
    const pensionTotal =
      actualPensionBase * (rates.pension_employee + rates.pension_employer);
    const pensionHalf = pensionTotal / 2;
    const pensionEmployee = this.roundWith50SenRule(pensionHalf);
    const pensionEmployer = pensionTotal - pensionEmployee;

    // 最終検証: 65歳以上の場合、計算結果が正しいことを確認
    if (age >= 65 && !ageFlags.isCare2 && actualHealthBase > 0) {
      // 期待される健康保険料（健康保険料率のみ）
      const expectedHealthTotal =
        actualHealthBase * (rates.health_employee + rates.health_employer);
      const expectedHealthHalf = expectedHealthTotal / 2;
      const expectedHealthEmployee =
        this.roundWith50SenRule(expectedHealthHalf);

      // 誤った計算（介護保険料率を含む場合）の期待値
      const incorrectHealthTotal =
        actualHealthBase *
        (rates.health_employee +
          rates.care_employee +
          rates.health_employer +
          rates.care_employer);
      const incorrectHealthHalf = incorrectHealthTotal / 2;
      const incorrectHealthEmployee =
        this.roundWith50SenRule(incorrectHealthHalf);

      // 計算結果が誤った値と一致する場合はエラーをログに記録
      if (Math.abs(healthEmployee - incorrectHealthEmployee) < 1) {
        console.error(
          '[BonusPremiumCalculationCoreService] 検証エラー: 65歳以上の健康保険料に介護保険料が含まれている可能性があります',
          {
            age,
            ageFlags,
            isCare2: ageFlags.isCare2,
            actualHealthBase,
            calculatedHealthEmployee: healthEmployee,
            expectedHealthEmployee,
            incorrectHealthEmployee,
            healthRateEmployee,
            rates: {
              health_employee: rates.health_employee,
              care_employee: rates.care_employee,
            },
          }
        );
      }

      console.log('[BonusPremiumCalculationCoreService] 65歳以上検証結果', {
        age,
        isCare2: ageFlags.isCare2,
        calculatedHealthEmployee: healthEmployee,
        expectedHealthEmployee,
        difference: Math.abs(healthEmployee - expectedHealthEmployee),
      });
    }

    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
    };
  }

  /**
   * 1円未満を50銭ルールで丸める
   * - 0.50以下 → 切り捨て
   * - 0.50より大きい → 切り上げ
   * @param amount 丸める金額
   * @returns 丸め後の金額
   */
  private roundWith50SenRule(amount: number): number {
    const floor = Math.floor(amount);
    const diff = amount - floor;

    if (diff > 0.5 + 1e-9) {
      return floor + 1;
    }
    return floor;
  }

  /**
   * 理由の配列を生成
   */
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


    if (reason_upper_limit_health) {
      reasons.push(
        `健保・介保の年度上限（573万円）を適用しました（標準賞与額: ${standardBonus.toLocaleString()}円 → 上限適用後: ${cappedBonusHealth.toLocaleString()}円）`
      );
    }

    if (reason_upper_limit_pension) {
      reasons.push(
        `厚生年金の月当たり上限（150万円）を適用しました（標準賞与額: ${standardBonus.toLocaleString()}円 → 上限適用後: ${cappedBonusPension.toLocaleString()}円）`
      );
    }

    return reasons;
  }

}
