import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { EmployeeLifecycleService } from './employee-lifecycle.service';

export interface EffectiveBonusPremiumInput {
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
}

export interface PremiumStoppingResult {
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;

  isRetired: boolean;
  isMaternityLeave: boolean;
  isChildcareLeave: boolean;
  isPensionStopped: boolean;
  isHealthStopped: boolean;
}

@Injectable({ providedIn: 'root' })
export class PremiumStoppingRuleService {
  constructor(private lifecycle: EmployeeLifecycleService) {}

  /**
   * 停止フラグのみを判定して返す
   */
  getStoppingFlags(
    emp: Employee,
    year: number,
    month: number,
    age: number
  ): {
    isRetired: boolean;
    isMaternityLeave: boolean;
    isChildcareLeave: boolean;
    isPensionStopped: boolean;
    isHealthStopped: boolean;
  } {
    if (!emp) {
      return {
        isRetired: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isPensionStopped: false,
        isHealthStopped: false,
      };
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return {
        isRetired: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isPensionStopped: false,
        isHealthStopped: false,
      };
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return {
        isRetired: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isPensionStopped: false,
        isHealthStopped: false,
      };
    }
    if (age === undefined || age === null || isNaN(age) || age < 0 || age > 150) {
      return {
        isRetired: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isPensionStopped: false,
        isHealthStopped: false,
      };
    }
    // 退職月以降を判定（退職日が属する月の次の月以降も含む）
    let retired = false;
    if (emp.retireDate) {
      const retireDate = new Date(emp.retireDate);
      if (isNaN(retireDate.getTime())) {
        // 無効な日付の場合は退職扱いしない
      } else {
        const retireYear = retireDate.getFullYear();
        const retireMonth = retireDate.getMonth() + 1;

      // 退職日が属する月の次の月以降は退職済みとして扱う
      const targetMonthKey = year * 12 + (month - 1);
      const retireMonthKey = retireYear * 12 + (retireMonth - 1);

        // 退職月の次の月以降（退職月より後）は退職済み
        if (targetMonthKey > retireMonthKey) {
          retired = true;
        } else if (targetMonthKey === retireMonthKey) {
          // 退職月の場合は、月末在籍がない場合のみ退職扱い
          // 月末在籍がある場合は保険料発生（9月30日退職なら9月は保険料発生）
          const isLastDayEligible = this.lifecycle.isLastDayEligible(emp, year, month);
          retired = !isLastDayEligible;
        }
      }
    }

    const maternityLeave = this.lifecycle.isMaternityLeave(emp, year, month);
    const childcareLeave = this.lifecycle.isChildcareLeave(emp, year, month);
    const pensionStopped = age >= 70;
    const healthStopped = age >= 75;

    return {
      isRetired: retired,
      isMaternityLeave: maternityLeave,
      isChildcareLeave: childcareLeave,
      isPensionStopped: pensionStopped,
      isHealthStopped: healthStopped,
    };
  }

  /**
   * 賞与・給与保険料に適用される停止ルールを一元化
   */
  applyStoppingRules(
    emp: Employee,
    year: number,
    month: number,
    age: number,
    input: EffectiveBonusPremiumInput
  ): PremiumStoppingResult {
    if (!emp || !input) {
      return {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        isRetired: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isPensionStopped: false,
        isHealthStopped: false,
      };
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        isRetired: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isPensionStopped: false,
        isHealthStopped: false,
      };
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        isRetired: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isPensionStopped: false,
        isHealthStopped: false,
      };
    }
    if (age === undefined || age === null || isNaN(age) || age < 0 || age > 150) {
      return {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        isRetired: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isPensionStopped: false,
        isHealthStopped: false,
      };
    }
    const flags = this.getStoppingFlags(emp, year, month, age);

    let {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
    } = input;

    // NaNチェック
    if (healthEmployee === undefined || healthEmployee === null || isNaN(healthEmployee) || healthEmployee < 0) healthEmployee = 0;
    if (healthEmployer === undefined || healthEmployer === null || isNaN(healthEmployer) || healthEmployer < 0) healthEmployer = 0;
    if (careEmployee === undefined || careEmployee === null || isNaN(careEmployee) || careEmployee < 0) careEmployee = 0;
    if (careEmployer === undefined || careEmployer === null || isNaN(careEmployer) || careEmployer < 0) careEmployer = 0;
    if (pensionEmployee === undefined || pensionEmployee === null || isNaN(pensionEmployee) || pensionEmployee < 0) pensionEmployee = 0;
    if (pensionEmployer === undefined || pensionEmployer === null || isNaN(pensionEmployer) || pensionEmployer < 0) pensionEmployer = 0;

    // 退職月 → 最優先で全停止
    if (flags.isRetired) {
      return {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        isRetired: true,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isPensionStopped: false,
        isHealthStopped: false,
      };
    }

    // 産休・育休 → 本人負担は0（事業主負担は課す）
    if (flags.isMaternityLeave || flags.isChildcareLeave) {
      healthEmployee = 0;
      careEmployee = 0;
      pensionEmployee = 0;
    }

    // 70歳以上（厚生年金停止）
    if (flags.isPensionStopped) {
      pensionEmployee = 0;
      pensionEmployer = 0;
    }

    // 75歳以上（健保・介護保険停止）
    if (flags.isHealthStopped) {
      healthEmployee = 0;
      healthEmployer = 0;
      careEmployee = 0;
      careEmployer = 0;
    }

    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      isRetired: false,
      isMaternityLeave: flags.isMaternityLeave,
      isChildcareLeave: flags.isChildcareLeave,
      isPensionStopped: flags.isPensionStopped,
      isHealthStopped: flags.isHealthStopped,
    };
  }
}
