import { Injectable } from '@angular/core';
import { BonusPremiumCalculationCoreService } from './bonus-premium-calculation-core.service';
import { BonusExemptionCheckService } from './bonus-exemption-check.service';
import { BonusNotificationService } from './bonus-notification.service';
import { AgeFlags } from './employee-eligibility.service';
import { Employee } from '../models/employee.model';

/**
 * BonusPremiumCalculationOrchestrationService
 * 
 * 賞与保険料計算のオーケストレーションを担当するサービス
 * 保険料計算のベース額決定、保険料計算、理由生成を提供
 */
@Injectable({ providedIn: 'root' })
export class BonusPremiumCalculationOrchestrationService {
  constructor(
    private premiumCalculationCore: BonusPremiumCalculationCoreService,
    private exemptionCheckService: BonusExemptionCheckService,
    private notificationService: BonusNotificationService
  ) {}

  /**
   * 保険料計算のベース額を決定
   */
  determinePremiumBases(
    isRetiredNoLastDay: boolean,
    isExempted: boolean,
    isSalaryInsteadOfBonus: boolean,
    cappedBonusHealth: number,
    cappedBonusPension: number
  ): {
    healthBase: number;
    pensionBase: number;
  } {
    // 退職月（月末在籍なし）の場合、すべての保険料を0円にする
    if (isRetiredNoLastDay) {
      return { healthBase: 0, pensionBase: 0 };
    }
    // 産休・育休免除の場合
    if (isExempted) {
      return { healthBase: 0, pensionBase: 0 };
    }
    // 通常の場合（上限適用済みの標準賞与額を使用）
    return {
      healthBase: cappedBonusHealth,
      pensionBase: cappedBonusPension,
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
    return this.premiumCalculationCore.calculatePremiums(
      healthBase,
      pensionBase,
      age,
      ageFlags,
      rates
    );
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

    return reasons;
  }
}

