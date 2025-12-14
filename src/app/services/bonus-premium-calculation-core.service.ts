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
    const PENSION_SINGLE_LIMIT = 1500000;

    // 厚生年金：1回150万円上限
    const cappedBonusPension = Math.min(standardBonus, PENSION_SINGLE_LIMIT);
    const reason_upper_limit_pension = standardBonus > PENSION_SINGLE_LIMIT;

    // 健保・介保：保険年度（4/1〜翌3/31）累計573万円上限
    // 今回の支給日が属する保険年度内の賞与合計を取得
    const roomId = this.roomIdService.requireRoomId();
    const targetYear = payDate.getFullYear();
    const existingBonuses = await this.bonusService.listBonuses(
      roomId,
      employeeId,
      targetYear
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

    // 保険料計算
    // 健康保険の計算方法変更：
    // 介護保険に加入していない場合：標準報酬月額×健保保険料率
    // 介護保険に加入している場合（40歳～64歳）：標準報酬月額×（健康保険料率＋介護保険料率）
    // 50銭未満切り捨て、50銭超切り上げ
    const healthRateEmployee = isCareEligible
      ? rates.health_employee + rates.care_employee
      : rates.health_employee;
    const healthRateEmployer = isCareEligible
      ? rates.health_employer + rates.care_employer
      : rates.health_employer;

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

  /**
   * 給与扱いの場合、標準賞与額を給与に合算する
   */
  async addBonusAsSalary(
    employeeId: string,
    payYear: number,
    payMonth: number,
    standardBonus: number
  ): Promise<void> {
    try {
      await this.salaryCalculationService.addBonusAsSalary(
        employeeId,
        payYear,
        payMonth,
        standardBonus
      );
    } catch (error) {
      console.error('給与への賞与合算処理でエラーが発生しました:', error);
      throw error;
    }
  }
}
