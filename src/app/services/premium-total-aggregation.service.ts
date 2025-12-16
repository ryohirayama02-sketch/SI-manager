import { Injectable } from '@angular/core';
import { MonthlyTotal, CompanyMonthlyTotal } from './payment-summary-types';

export interface PremiumDeltaInput {
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
}

@Injectable({ providedIn: 'root' })
export class PremiumTotalAggregationService {
  /**
   * 月次合計（MonthlyTotal）に従業員・事業主分を加算したオブジェクトを返す
   */
  addToMonthlyTotal(
    current: MonthlyTotal,
    delta: PremiumDeltaInput
  ): MonthlyTotal {
    if (!current || !delta) {
      return current || {
        health: 0,
        care: 0,
        pension: 0,
        total: 0,
        isPensionStopped: false,
        isHealthStopped: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isRetired: false,
      };
    }

    const currentHealth = current.health ?? 0;
    const currentCare = current.care ?? 0;
    const currentPension = current.pension ?? 0;
    const currentTotal = current.total ?? 0;

    const deltaHealthEmployee = delta.healthEmployee ?? 0;
    const deltaHealthEmployer = delta.healthEmployer ?? 0;
    const deltaCareEmployee = delta.careEmployee ?? 0;
    const deltaCareEmployer = delta.careEmployer ?? 0;
    const deltaPensionEmployee = delta.pensionEmployee ?? 0;
    const deltaPensionEmployer = delta.pensionEmployer ?? 0;

    // NaNチェック
    const safeDeltaHealthEmployee = isNaN(deltaHealthEmployee) || deltaHealthEmployee < 0 ? 0 : deltaHealthEmployee;
    const safeDeltaHealthEmployer = isNaN(deltaHealthEmployer) || deltaHealthEmployer < 0 ? 0 : deltaHealthEmployer;
    const safeDeltaCareEmployee = isNaN(deltaCareEmployee) || deltaCareEmployee < 0 ? 0 : deltaCareEmployee;
    const safeDeltaCareEmployer = isNaN(deltaCareEmployer) || deltaCareEmployer < 0 ? 0 : deltaCareEmployer;
    const safeDeltaPensionEmployee = isNaN(deltaPensionEmployee) || deltaPensionEmployee < 0 ? 0 : deltaPensionEmployee;
    const safeDeltaPensionEmployer = isNaN(deltaPensionEmployer) || deltaPensionEmployer < 0 ? 0 : deltaPensionEmployer;

    const health = currentHealth + safeDeltaHealthEmployee + safeDeltaHealthEmployer;
    const care = currentCare + safeDeltaCareEmployee + safeDeltaCareEmployer;
    const pension = currentPension + safeDeltaPensionEmployee + safeDeltaPensionEmployer;
    const total = health + care + pension;

    return {
      ...current,
      health,
      care,
      pension,
      total,
    };
  }

  /**
   * 会社全体の月次合計（CompanyMonthlyTotal）に加算したオブジェクトを返す
   */
  addToCompanyMonthlyTotal(
    current: CompanyMonthlyTotal,
    delta: PremiumDeltaInput
  ): CompanyMonthlyTotal {
    if (!current || !delta) {
      return current || {
        healthTotal: 0,
        careTotal: 0,
        pensionTotal: 0,
        total: 0,
      };
    }

    const currentHealthTotal = current.healthTotal ?? 0;
    const currentCareTotal = current.careTotal ?? 0;
    const currentPensionTotal = current.pensionTotal ?? 0;

    const deltaHealthEmployee = delta.healthEmployee ?? 0;
    const deltaHealthEmployer = delta.healthEmployer ?? 0;
    const deltaCareEmployee = delta.careEmployee ?? 0;
    const deltaCareEmployer = delta.careEmployer ?? 0;
    const deltaPensionEmployee = delta.pensionEmployee ?? 0;
    const deltaPensionEmployer = delta.pensionEmployer ?? 0;

    // NaNチェック
    const safeDeltaHealthEmployee = isNaN(deltaHealthEmployee) || deltaHealthEmployee < 0 ? 0 : deltaHealthEmployee;
    const safeDeltaHealthEmployer = isNaN(deltaHealthEmployer) || deltaHealthEmployer < 0 ? 0 : deltaHealthEmployer;
    const safeDeltaCareEmployee = isNaN(deltaCareEmployee) || deltaCareEmployee < 0 ? 0 : deltaCareEmployee;
    const safeDeltaCareEmployer = isNaN(deltaCareEmployer) || deltaCareEmployer < 0 ? 0 : deltaCareEmployer;
    const safeDeltaPensionEmployee = isNaN(deltaPensionEmployee) || deltaPensionEmployee < 0 ? 0 : deltaPensionEmployee;
    const safeDeltaPensionEmployer = isNaN(deltaPensionEmployer) || deltaPensionEmployer < 0 ? 0 : deltaPensionEmployer;

    const healthTotal = currentHealthTotal + safeDeltaHealthEmployee + safeDeltaHealthEmployer;
    const careTotal = currentCareTotal + safeDeltaCareEmployee + safeDeltaCareEmployer;
    const pensionTotal = currentPensionTotal + safeDeltaPensionEmployee + safeDeltaPensionEmployer;
    const total = healthTotal + careTotal + pensionTotal;

    return {
      ...current,
      healthTotal,
      careTotal,
      pensionTotal,
      total,
    };
  }
}