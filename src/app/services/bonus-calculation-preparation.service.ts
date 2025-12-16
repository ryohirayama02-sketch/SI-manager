import { Injectable } from '@angular/core';
import { SettingsService } from './settings.service';
import { BonusPremiumCalculationCoreService } from './bonus-premium-calculation-core.service';
import { Employee } from '../models/employee.model';

/**
 * BonusCalculationPreparationService
 *
 * 賞与計算の準備処理を担当するサービス
 * バリデーション、料率取得、標準賞与額計算、上限適用を提供
 */
@Injectable({ providedIn: 'root' })
export class BonusCalculationPreparationService {
  constructor(
    private settingsService: SettingsService,
    private premiumCalculationCore: BonusPremiumCalculationCoreService
  ) {}

  /**
   * 入力値のバリデーション
   */
  validateInput(
    employeeId: string,
    bonusAmount: number,
    paymentDate: string,
    year: number
  ): boolean {
    if (!employeeId) {
      return false;
    }
    if (bonusAmount === null || bonusAmount === undefined || isNaN(bonusAmount) || bonusAmount < 0) {
      return false;
    }
    if (!paymentDate) {
      return false;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return false;
    }
    return true;
  }

  /**
   * 料率を取得
   */
  async getRates(employee: Employee, year: number): Promise<any | null> {
    if (!employee) {
      return null;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return null;
    }
    const prefecture = (employee as any).prefecture || 'tokyo';
    return await this.settingsService.getRates(year.toString(), prefecture);
  }

  /**
   * 標準賞与額を計算
   */
  calculateStandardBonus(bonusAmount: number): number {
    if (bonusAmount === null || bonusAmount === undefined || isNaN(bonusAmount) || bonusAmount < 0) {
      return 0;
    }
    return this.premiumCalculationCore.calculateStandardBonus(bonusAmount);
  }

  /**
   * 上限適用を実行
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
    if (!employeeId) {
      throw new Error('従業員IDが指定されていません');
    }
    if (standardBonus === null || standardBonus === undefined || isNaN(standardBonus) || standardBonus < 0) {
      throw new Error(`無効な標準賞与額が指定されました: ${standardBonus}`);
    }
    if (!payDate || !(payDate instanceof Date) || isNaN(payDate.getTime())) {
      throw new Error('無効な支払日が指定されました');
    }
    return await this.premiumCalculationCore.applyBonusCaps(
      standardBonus,
      employeeId,
      payDate
    );
  }
}
