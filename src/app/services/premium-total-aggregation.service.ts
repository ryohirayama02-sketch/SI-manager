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
    const health =
      (current.health || 0) + (delta.healthEmployee + delta.healthEmployer);
    const care =
      (current.care || 0) + (delta.careEmployee + delta.careEmployer);
    const pension =
      (current.pension || 0) +
      (delta.pensionEmployee + delta.pensionEmployer);
    const total = (current.total || 0) + (health - (current.health || 0)) + (care - (current.care || 0)) + (pension - (current.pension || 0));

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
    const healthTotal =
      (current.healthTotal || 0) + (delta.healthEmployee + delta.healthEmployer);
    const careTotal =
      (current.careTotal || 0) + (delta.careEmployee + delta.careEmployer);
    const pensionTotal =
      (current.pensionTotal || 0) +
      (delta.pensionEmployee + delta.pensionEmployer);
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


