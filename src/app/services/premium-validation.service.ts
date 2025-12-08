import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

/**
 * PremiumValidationService
 * 
 * 年齢関連のエラーチェックを担当するサービス
 * 年齢による停止判定の矛盾をチェック
 */
@Injectable({ providedIn: 'root' })
export class PremiumValidationService {
  /**
   * 年齢関連の矛盾をチェックする
   */
  validateAgeRelatedErrors(
    emp: Employee,
    monthlyPremiums: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      };
    },
    errorMessages: { [employeeId: string]: string[] },
    year: number,
    ageCache: { [month: number]: number }
  ): void {
    // 70歳以上なのに厚生年金の保険料が計算されている
    for (let month = 1; month <= 12; month++) {
      const premiums = monthlyPremiums[month];
      const age = ageCache[month];
      
      if (premiums && age >= 70 && premiums.pensionEmployee > 0) {
        if (!errorMessages[emp.id]) errorMessages[emp.id] = [];
        errorMessages[emp.id].push(
          `${month}月：70歳以上は厚生年金保険料は発生しません`
        );
      }

      // 75歳以上なのに健康保険・介護保険が計算されている
      if (
        premiums &&
        age >= 75 &&
        (premiums.healthEmployee > 0 || premiums.careEmployee > 0)
      ) {
        if (!errorMessages[emp.id]) errorMessages[emp.id] = [];
        errorMessages[emp.id].push(
          `${month}月：75歳以上は健康保険・介護保険は発生しません`
        );
      }
    }
  }
}







