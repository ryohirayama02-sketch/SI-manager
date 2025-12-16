import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

/**
 * 従業員の労働カテゴリ属性
 */
export type WorkCategory = 'full-time' | 'short-time-worker' | 'non-insured';

/**
 * 勤務区分を判定するサービス（weeklyWorkHoursCategory と賃金/雇用見込/学生区分で決定）
 */
@Injectable({
  providedIn: 'root',
})
export class EmployeeWorkCategoryService {
  /**
   * 従業員の労働カテゴリ属性を判定
   * @param employee 従業員情報
   * @returns 労働カテゴリ属性
   */
  getWorkCategory(employee: Employee): WorkCategory {
    if (!employee) {
      return 'non-insured';
    }
    const category = employee.weeklyWorkHoursCategory;

    // 30時間以上：フルタイム
    if (category === '30hours-or-more') {
      return 'full-time';
    }

    // 20時間未満：保険未加入者
    if (category === 'less-than-20hours') {
      return 'non-insured';
    }

    // 20-30時間：条件により短時間労働者または非加入
    if (category === '20-30hours') {
      // 月額賃金88000以上かつ予定雇用月数2か月超かつ学生でない場合に短時間労働者
      const monthlyWage = (employee.monthlyWage !== undefined && employee.monthlyWage !== null && !isNaN(employee.monthlyWage)) ? employee.monthlyWage : 0;
      const isOverTwoMonths =
        employee.expectedEmploymentMonths === 'over-2months';
      const isStudent = employee.isStudent || false;

      if (monthlyWage >= 88000 && isOverTwoMonths && !isStudent) {
        return 'short-time-worker';
      }

      // 条件を満たさない場合は非加入
      return 'non-insured';
    }

    // デフォルト：非加入
    return 'non-insured';
  }

  /**
   * 従業員がフルタイムかどうか
   * @param employee 従業員情報
   * @returns フルタイムの場合true
   */
  isFullTime(employee: Employee): boolean {
    if (!employee) {
      return false;
    }
    return this.getWorkCategory(employee) === 'full-time';
  }

  /**
   * 従業員が短時間労働者かどうか
   * @param employee 従業員情報
   * @returns 短時間労働者の場合true
   */
  isShortTimeWorker(employee: Employee): boolean {
    if (!employee) {
      return false;
    }
    return this.getWorkCategory(employee) === 'short-time-worker';
  }

  /**
   * 従業員が保険未加入者かどうか
   * @param employee 従業員情報
   * @returns 保険未加入者の場合true
   */
  isNonInsured(employee: Employee): boolean {
    if (!employee) {
      return true;
    }
    return this.getWorkCategory(employee) === 'non-insured';
  }

  /**
   * 従業員が保険加入必須かどうか
   * @param employee 従業員情報
   * @returns 保険加入必須の場合true
   */
  isInsuranceRequired(employee: Employee): boolean {
    if (!employee) {
      return false;
    }
    const category = this.getWorkCategory(employee);
    return category === 'full-time' || category === 'short-time-worker';
  }

  /**
   * 従業員が産休を取得できるかどうか（保険加入者のみ）
   * @param employee 従業員情報
   * @returns 産休取得可能な場合true
   */
  canTakeMaternityLeave(employee: Employee): boolean {
    if (!employee) {
      return false;
    }
    return this.isInsuranceRequired(employee);
  }

  /**
   * 産休中の社会保険料が免除されるかどうか（保険加入者のみ）
   * @param employee 従業員情報
   * @returns 免除される場合true
   */
  isExemptFromPremiumsDuringMaternityLeave(employee: Employee): boolean {
    if (!employee) {
      return false;
    }
    return this.isInsuranceRequired(employee);
  }
}
