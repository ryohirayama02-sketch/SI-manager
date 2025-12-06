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
    const retired = this.lifecycle.isRetiredInMonth(emp, year, month);
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
    const flags = this.getStoppingFlags(emp, year, month, age);

    let {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
    } = input;

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
