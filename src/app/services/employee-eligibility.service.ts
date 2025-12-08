import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { Employee } from '../models/employee.model';
import { EmployeeService } from './employee.service';
import { EmployeeWorkCategoryService } from './employee-work-category.service';

export type AgeCategory =
  | 'normal'
  | 'care-2nd'
  | 'care-1st'
  | 'no-pension'
  | 'no-health';

export interface AgeFlags {
  isCare2: boolean; // 40〜64歳（介護保険第2号被保険者）
  isCare1: boolean; // 65歳以上（介護保険第1号被保険者）
  isNoPension: boolean; // 70歳以上（厚生年金停止）
  isNoHealth: boolean; // 75歳以上（健康保険・介護保険停止）
}

export interface EmployeeEligibilityResult {
  healthInsuranceEligible: boolean;
  pensionEligible: boolean;
  careInsuranceEligible: boolean;
  reasons: string[]; // 判定根拠
  ageCategory: AgeCategory; // 年齢区分
  ageFlags: AgeFlags; // 年齢フラグ
}

@Injectable({ providedIn: 'root' })
export class EmployeeEligibilityService {
  private eligibilitySubject = new BehaviorSubject<{
    [employeeId: string]: EmployeeEligibilityResult;
  }>({});

  constructor(
    private employeeService: EmployeeService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService
  ) {
    // 従業員情報の変更を監視してeligibilityを再計算
    this.employeeService.observeEmployees().subscribe(async () => {
      await this.recalculateAllEligibility();
    });
  }

  /**
   * 全従業員の加入区分を再計算
   */
  private async recalculateAllEligibility(): Promise<void> {
    const employees = await this.employeeService.getAllEmployees();
    const eligibilityMap: { [employeeId: string]: EmployeeEligibilityResult } =
      {};

    for (const emp of employees) {
      eligibilityMap[emp.id] = this.checkEligibility(emp);
    }

    this.eligibilitySubject.next(eligibilityMap);
  }

  /**
   * 加入区分の変更を監視する
   * @returns Observable<{ [employeeId: string]: EmployeeEligibilityResult }>
   */
  observeEligibility(): Observable<{
    [employeeId: string]: EmployeeEligibilityResult;
  }> {
    // 初回読み込み時に計算を実行
    this.recalculateAllEligibility();
    return this.eligibilitySubject.asObservable();
  }

  /**
   * 従業員の社会保険加入資格を判定する
   * @param employee 従業員情報
   * @param currentDate 判定基準日（デフォルト: 今日）
   */
  checkEligibility(
    employee: Employee,
    currentDate: Date = new Date()
  ): EmployeeEligibilityResult {
    const reasons: string[] = [];
    let healthInsuranceEligible = false;
    let pensionEligible = false;
    let careInsuranceEligible = false;

    // STEP1: 退職済み判定
    if (employee.retireDate) {
      const retireDate = new Date(employee.retireDate);
      if (retireDate <= currentDate) {
        const age = this.calculateAge(employee.birthDate, currentDate);
        const ageFlags = this.getAgeFlags(age);
        const ageCategory = this.getAgeCategory(age);
        reasons.push('退職済みのため加入不可');
        return {
          healthInsuranceEligible: false,
          pensionEligible: false,
          careInsuranceEligible: false,
          reasons,
          ageCategory,
          ageFlags,
        };
      }
    }

    // STEP2: 年齢フラグ取得
    const age = this.calculateAge(employee.birthDate, currentDate);
    const ageFlags = this.getAgeFlags(age);
    const ageCategory = this.getAgeCategory(age);
    const isCareInsuranceEligible = this.isCareInsuranceEligible(age);
    const isHealthAndCareStopped = this.isHealthAndCareStopped(age);
    const isPensionStopped = this.isPensionStopped(age);

    // STEP3: 勤務区分による加入判定
    const workCategory =
      this.employeeWorkCategoryService.getWorkCategory(employee);

    if (workCategory === 'non-insured') {
      reasons.push('勤務区分が社会保険非加入のため加入不可');
    } else {
      if (workCategory === 'full-time') {
        reasons.push('勤務区分がフルタイムのため加入対象');
      } else if (workCategory === 'short-time-worker') {
        reasons.push(
          '勤務区分が短時間労働者（特定適用）に該当するため加入対象'
        );
      }

      healthInsuranceEligible = !isHealthAndCareStopped;
      pensionEligible = !isPensionStopped;
      careInsuranceEligible =
        isCareInsuranceEligible && !isHealthAndCareStopped;

      if (!healthInsuranceEligible) {
        reasons.push('75歳以上のため健康保険・介護保険は加入不可');
      }
      if (!pensionEligible) {
        reasons.push('70歳以上のため厚生年金は加入不可');
      }
    }
    return {
      healthInsuranceEligible,
      pensionEligible,
      careInsuranceEligible,
      reasons,
      ageCategory,
      ageFlags,
    };
  }

  /**
   * 年齢を計算する
   */
  private calculateAge(birthDate: string, currentDate: Date): number {
    const birth = new Date(birthDate);
    let age = currentDate.getFullYear() - birth.getFullYear();
    const monthDiff = currentDate.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && currentDate.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }

  /**
   * 年齢フラグを取得
   */
  private getAgeFlags(age: number): AgeFlags {
    return {
      isCare2: age >= 40 && age < 65, // 40〜64歳（介護保険第2号被保険者）
      isCare1: age >= 65, // 65歳以上（介護保険第1号被保険者）
      isNoPension: age >= 70, // 70歳以上（厚生年金停止）
      isNoHealth: age >= 75, // 75歳以上（健康保険・介護保険停止）
    };
  }

  /**
   * 年齢区分を取得
   */
  private getAgeCategory(age: number): AgeCategory {
    if (age >= 75) {
      return 'no-health'; // 75歳以上：健康保険・介護保険停止
    } else if (age >= 70) {
      return 'no-pension'; // 70歳以上：厚生年金停止
    } else if (age >= 65) {
      return 'care-1st'; // 65歳以上：介護保険第1号被保険者
    } else if (age >= 40) {
      return 'care-2nd'; // 40〜64歳：介護保険第2号被保険者
    } else {
      return 'normal'; // 40歳未満：通常
    }
  }

  /**
   * 介護保険の加入可能年齢を判定（40歳以上65歳未満）
   * 40歳到達月：介護保険料徴収開始
   */
  isCareInsuranceEligible(age: number): boolean {
    return age >= 40 && age < 65;
  }

  /**
   * 介護保険の徴収停止を判定（65歳）
   * 65歳到達月：介護保険料徴収終了（第1号へ移行）
   */
  isCareInsuranceStopped(age: number): boolean {
    return age >= 65;
  }

  /**
   * 厚生年金の徴収停止を判定（70歳）
   * 70歳到達月：厚生年金保険料徴収停止
   */
  isPensionStopped(age: number): boolean {
    return age >= 70;
  }

  /**
   * 健康保険・介護保険の徴収停止を判定（75歳）
   * 75歳到達月：健康保険・介護保険徴収停止
   */
  isHealthAndCareStopped(age: number): boolean {
    return age >= 75;
  }
}
