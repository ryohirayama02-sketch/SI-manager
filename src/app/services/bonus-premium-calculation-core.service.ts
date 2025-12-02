import { Injectable } from '@angular/core';
import { BonusService } from './bonus.service';
import { SettingsService } from './settings.service';
import { SalaryCalculationService } from './salary-calculation.service';
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
    private employeeEligibilityService: EmployeeEligibilityService
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
    // 健康保険：総額を計算 → 折半 → それぞれ10円未満切り捨て
    const healthTotal =
      actualHealthBase * (rates.health_employee + rates.health_employer);
    const healthHalf = healthTotal / 2;
    const healthEmployee = Math.floor(healthHalf / 10) * 10;
    const healthEmployer = Math.floor(healthHalf / 10) * 10;

    // 介護保険：総額を計算 → 折半 → それぞれ10円未満切り捨て
    const careTotal = isCareEligible
      ? actualHealthBase * (rates.care_employee + rates.care_employer)
      : 0;
    const careHalf = careTotal / 2;
    const careEmployee = isCareEligible ? Math.floor(careHalf / 10) * 10 : 0;
    const careEmployer = isCareEligible ? Math.floor(careHalf / 10) * 10 : 0;

    // 厚生年金：個人分を計算 → 10円未満切り捨て → 会社分 = 総額 - 個人分
    const pensionTotal =
      actualPensionBase * (rates.pension_employee + rates.pension_employer);
    const pensionHalf = pensionTotal / 2;
    const pensionEmployee = Math.floor(pensionHalf / 10) * 10;
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
