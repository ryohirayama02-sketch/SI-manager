import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

/**
 * 従業員の労働カテゴリ属性
 */
export type WorkCategory = 'full-time' | 'short-time-worker' | 'non-insured';

/**
 * 従業員の労働カテゴリ属性を判定するサービス
 */
@Injectable({
  providedIn: 'root'
})
export class EmployeeWorkCategoryService {
  /**
   * 従業員の労働カテゴリ属性を判定
   * @param employee 従業員情報
   * @returns 労働カテゴリ属性
   */
  getWorkCategory(employee: Employee): WorkCategory {
    const category = employee.weeklyWorkHoursCategory;

    // 30時間以上：フルタイム
    if (category === '30hours-or-more') {
      return 'full-time';
    }

    // 20時間未満：保険未加入者
    if (category === 'less-than-20hours') {
      return 'non-insured';
    }

    // 20-30時間：条件により短時間労働者またはフルタイム
    if (category === '20-30hours') {
      // 月額賃金88000以上かつ予定雇用月数2か月以上かつ学生でない場合に短時間労働者
      const monthlyWage = employee.monthlyWage || 0;
      const expectedMonths = employee.expectedEmploymentMonths || 0;
      const isStudent = employee.isStudent || false;

      if (monthlyWage >= 88000 && expectedMonths >= 2 && !isStudent) {
        return 'short-time-worker';
      } else {
        // 条件を満たさない場合はフルタイムとして扱う
        return 'full-time';
      }
    }

    // デフォルト：フルタイム（後方互換性のため）
    return 'full-time';
  }

  /**
   * 従業員がフルタイムかどうか
   * @param employee 従業員情報
   * @returns フルタイムの場合true
   */
  isFullTime(employee: Employee): boolean {
    return this.getWorkCategory(employee) === 'full-time';
  }

  /**
   * 従業員が短時間労働者かどうか
   * @param employee 従業員情報
   * @returns 短時間労働者の場合true
   */
  isShortTimeWorker(employee: Employee): boolean {
    return this.getWorkCategory(employee) === 'short-time-worker';
  }

  /**
   * 従業員が保険未加入者かどうか
   * @param employee 従業員情報
   * @returns 保険未加入者の場合true
   */
  isNonInsured(employee: Employee): boolean {
    return this.getWorkCategory(employee) === 'non-insured';
  }

  /**
   * 従業員が保険加入必須かどうか
   * @param employee 従業員情報
   * @returns 保険加入必須の場合true
   */
  isInsuranceRequired(employee: Employee): boolean {
    const category = this.getWorkCategory(employee);
    return category === 'full-time' || category === 'short-time-worker';
  }

  /**
   * 従業員が産休を取得できるかどうか（フルタイムのみ）
   * @param employee 従業員情報
   * @returns 産休取得可能な場合true
   */
  canTakeMaternityLeave(employee: Employee): boolean {
    return this.isFullTime(employee);
  }

  /**
   * 産休中の社会保険料が免除されるかどうか（保険未加入者は免除されない）
   * @param employee 従業員情報
   * @returns 免除される場合true
   */
  isExemptFromPremiumsDuringMaternityLeave(employee: Employee): boolean {
    // 保険未加入者は産休中の社会保険料もなし（免除の概念がない）
    return !this.isNonInsured(employee);
  }
}

