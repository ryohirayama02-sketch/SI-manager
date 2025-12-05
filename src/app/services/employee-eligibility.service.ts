import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { Employee } from '../models/employee.model';
import { EmployeeService } from './employee.service';
import { EmployeeWorkCategoryService } from './employee-work-category.service';

export type AgeCategory = 'normal' | 'care-2nd' | 'care-1st' | 'no-pension' | 'no-health';

export interface AgeFlags {
  isCare2: boolean;     // 40〜64歳（介護保険第2号被保険者）
  isCare1: boolean;     // 65歳以上（介護保険第1号被保険者）
  isNoPension: boolean; // 70歳以上（厚生年金停止）
  isNoHealth: boolean;  // 75歳以上（健康保険・介護保険停止）
}

export interface EmployeeEligibilityResult {
  healthInsuranceEligible: boolean;
  pensionEligible: boolean;
  careInsuranceEligible: boolean;
  candidateFlag: boolean; // 加入候補者（3ヶ月連続で実働20時間以上など）
  reasons: string[]; // 判定根拠
  ageCategory: AgeCategory; // 年齢区分
  ageFlags: AgeFlags; // 年齢フラグ
}

export interface EmployeeWorkInfo {
  weeklyHours?: number; // 週労働時間
  monthlyWage?: number; // 月額賃金（円）
  expectedEmploymentMonths?: number | string; // 雇用見込期間（月）または選択値（'within-2months' | 'over-2months'）
  isStudent?: boolean; // 学生かどうか
  consecutiveMonthsOver20Hours?: number; // 連続で20時間以上働いた月数
}

@Injectable({ providedIn: 'root' })
export class EmployeeEligibilityService {
  private eligibilitySubject = new BehaviorSubject<{ [employeeId: string]: EmployeeEligibilityResult }>({});

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
    const eligibilityMap: { [employeeId: string]: EmployeeEligibilityResult } = {};
    
    for (const emp of employees) {
      const workInfo = {
        weeklyHours: emp.weeklyHours,
        monthlyWage: emp.monthlyWage,
        expectedEmploymentMonths: emp.expectedEmploymentMonths,
        isStudent: emp.isStudent,
        consecutiveMonthsOver20Hours: emp.consecutiveMonthsOver20Hours,
      };
      eligibilityMap[emp.id] = this.checkEligibility(emp, workInfo);
    }
    
    this.eligibilitySubject.next(eligibilityMap);
  }

  /**
   * 加入区分の変更を監視する
   * @returns Observable<{ [employeeId: string]: EmployeeEligibilityResult }>
   */
  observeEligibility(): Observable<{ [employeeId: string]: EmployeeEligibilityResult }> {
    // 初回読み込み時に計算を実行
    this.recalculateAllEligibility();
    return this.eligibilitySubject.asObservable();
  }

  /**
   * 従業員の社会保険加入資格を判定する
   * @param employee 従業員情報
   * @param workInfo 労働情報（週労働時間、月額賃金など）
   * @param currentDate 判定基準日（デフォルト: 今日）
   */
  checkEligibility(
    employee: Employee,
    workInfo?: EmployeeWorkInfo,
    currentDate: Date = new Date()
  ): EmployeeEligibilityResult {
    const reasons: string[] = [];
    let healthInsuranceEligible = false;
    let pensionEligible = false;
    let careInsuranceEligible = false;
    let candidateFlag = false;

    // 退職済みの場合は加入不可
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
          candidateFlag: false,
          reasons,
          ageCategory,
          ageFlags
        };
      }
    }

    // 年齢による判定（下準備）
    const age = this.calculateAge(employee.birthDate, currentDate);
    const ageFlags = this.getAgeFlags(age);
    const ageCategory = this.getAgeCategory(age);
    const isCareInsuranceEligible = this.isCareInsuranceEligible(age);
    const isCareInsuranceStopped = this.isCareInsuranceStopped(age);
    const isPensionStopped = this.isPensionStopped(age);
    const isHealthAndCareStopped = this.isHealthAndCareStopped(age);
    
    const isPensionEligibleByAge = !isPensionStopped;
    const isHealthInsuranceEligibleByAge = !isHealthAndCareStopped;

    // 新しい週の所定労働時間カテゴリに基づく判定
    const workCategory = this.employeeWorkCategoryService.getWorkCategory(employee);
    
    // 保険未加入者の場合
    if (workCategory === 'non-insured') {
      reasons.push('週20時間未満のため加入対象外');
      if (workInfo?.consecutiveMonthsOver20Hours && workInfo.consecutiveMonthsOver20Hours >= 3) {
        candidateFlag = true;
        reasons.push('過去3ヶ月連続で20時間以上働いているため加入候補者');
      }
    }
    // フルタイムまたは短時間労働者の場合（保険加入必須）
    else if (workCategory === 'full-time' || workCategory === 'short-time-worker') {
      if (workCategory === 'full-time') {
        reasons.push('週30時間以上のため加入対象');
      } else {
        reasons.push('短時間労働者（週20-30時間、月額賃金8.8万円以上、雇用見込2ヶ月超、学生でない）のため加入対象');
      }
      
      healthInsuranceEligible = isHealthInsuranceEligibleByAge;
      pensionEligible = isPensionEligibleByAge;
      careInsuranceEligible = isCareInsuranceEligible;
      
      if (!isHealthInsuranceEligibleByAge) {
        reasons.push('75歳以上のため健康保険・介護保険は加入不可');
      }
      if (!isPensionEligibleByAge) {
        reasons.push('70歳以上のため厚生年金は加入不可');
      }
    }
    // 後方互換性: weeklyHoursが存在する場合の従来の判定
    else if (workInfo?.weeklyHours) {
      // 1. 週30時間以上 → 加入
      if (workInfo.weeklyHours >= 30) {
        healthInsuranceEligible = isHealthInsuranceEligibleByAge;
        pensionEligible = isPensionEligibleByAge;
        careInsuranceEligible = isCareInsuranceEligible;
        reasons.push(`週${workInfo.weeklyHours}時間のため加入対象`);
        if (!isHealthInsuranceEligibleByAge) {
          reasons.push('75歳以上のため健康保険・介護保険は加入不可');
        }
        if (!isPensionEligibleByAge) {
          reasons.push('70歳以上のため厚生年金は加入不可');
        }
      }
      // 2. 特定適用事業所の短時間労働者（週20〜30時間未満）判定
      else if (workInfo.weeklyHours >= 20 && workInfo.weeklyHours < 30) {
        const shortTimeConditions = this.checkShortTimeWorkerConditions(workInfo, employee);
        
        if (shortTimeConditions.allMet) {
          healthInsuranceEligible = isHealthInsuranceEligibleByAge;
          pensionEligible = isPensionEligibleByAge;
          careInsuranceEligible = isCareInsuranceEligible;
          reasons.push(...shortTimeConditions.reasons);
          if (!isHealthInsuranceEligibleByAge) {
            reasons.push('75歳以上のため健康保険・介護保険は加入不可');
          }
          if (!isPensionEligibleByAge) {
            reasons.push('70歳以上のため厚生年金は加入不可');
          }
        } else {
          reasons.push(...shortTimeConditions.reasons);
          reasons.push('特定適用事業所の短時間労働者条件を満たしていないため加入不可');
        }
      }
      // 3. 週20時間未満だが「3ヶ月連続で実働20時間以上」の場合 → 加入候補者アラート
      else if (workInfo.weeklyHours < 20) {
        if (workInfo.consecutiveMonthsOver20Hours && workInfo.consecutiveMonthsOver20Hours >= 3) {
          candidateFlag = true;
          reasons.push(`週${workInfo.weeklyHours}時間だが、過去3ヶ月連続で20時間以上働いているため加入候補者`);
        } else {
          reasons.push(`週${workInfo.weeklyHours}時間のため加入対象外`);
        }
      }
    }
    // 労働時間情報がない場合
    else {
      if (employee.isShortTime) {
        reasons.push('短時間労働者として登録されているが、労働時間情報がないため判定不可');
      } else {
        reasons.push('労働時間情報がないため判定不可');
      }
    }

    return {
      healthInsuranceEligible,
      pensionEligible,
      careInsuranceEligible,
      candidateFlag,
      reasons,
      ageCategory,
      ageFlags
    };
  }

  /**
   * 特定適用事業所の短時間労働者条件をチェック
   * - 週20時間以上
   * - 月額賃金 8.8万円以上
   * - 2ヶ月超の雇用見込
   * - 学生でない
   */
  private checkShortTimeWorkerConditions(
    workInfo: EmployeeWorkInfo,
    employee: Employee
  ): { allMet: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let allMet = true;

    // 週20時間以上（既にチェック済み）
    if (workInfo.weeklyHours && workInfo.weeklyHours >= 20) {
      reasons.push(`週${workInfo.weeklyHours}時間（条件: 20時間以上）`);
    } else {
      allMet = false;
      reasons.push('週20時間未満のため条件不適合');
    }

    // 月額賃金 8.8万円以上
    if (workInfo.monthlyWage && workInfo.monthlyWage >= 88000) {
      reasons.push(`月額賃金${workInfo.monthlyWage.toLocaleString()}円（条件: 8.8万円以上）`);
    } else {
      allMet = false;
      if (workInfo.monthlyWage) {
        reasons.push(`月額賃金${workInfo.monthlyWage.toLocaleString()}円（条件: 8.8万円以上を満たしていない）`);
      } else {
        reasons.push('月額賃金情報がない（条件: 8.8万円以上）');
      }
    }

    // 2ヶ月超の雇用見込
    const isOver2Months = this.isExpectedEmploymentOver2Months(workInfo.expectedEmploymentMonths);
    if (isOver2Months) {
      if (typeof workInfo.expectedEmploymentMonths === 'string') {
        reasons.push('2か月を超える見込み（条件: 2ヶ月超）');
      } else {
        reasons.push(`雇用見込${workInfo.expectedEmploymentMonths}ヶ月（条件: 2ヶ月超）`);
      }
    } else {
      allMet = false;
      if (workInfo.expectedEmploymentMonths !== undefined && workInfo.expectedEmploymentMonths !== null) {
        if (typeof workInfo.expectedEmploymentMonths === 'string') {
          reasons.push('2か月以内（条件: 2ヶ月超を満たしていない）');
        } else {
          reasons.push(`雇用見込${workInfo.expectedEmploymentMonths}ヶ月（条件: 2ヶ月超を満たしていない）`);
        }
      } else {
        reasons.push('雇用見込期間情報がない（条件: 2ヶ月超）');
      }
    }

    // 学生でない
    if (workInfo.isStudent === false || workInfo.isStudent === undefined) {
      reasons.push('学生ではない（条件: 学生でない）');
    } else {
      allMet = false;
      reasons.push('学生のため条件不適合（条件: 学生でない）');
    }

    return { allMet, reasons };
  }

  /**
   * 雇用見込期間が2ヶ月超かどうかを判定
   * @param expectedEmploymentMonths 雇用見込期間（数値または選択値）
   * @returns 2ヶ月超の場合true
   */
  private isExpectedEmploymentOver2Months(expectedEmploymentMonths?: number | string | null): boolean {
    if (expectedEmploymentMonths === undefined || expectedEmploymentMonths === null) {
      return false;
    }
    // 文字列の場合（選択式）
    if (typeof expectedEmploymentMonths === 'string') {
      return expectedEmploymentMonths === 'over-2months';
    }
    // 数値の場合（後方互換性のため）
    return expectedEmploymentMonths > 2;
  }

  /**
   * 年齢を計算する
   */
  private calculateAge(birthDate: string, currentDate: Date): number {
    const birth = new Date(birthDate);
    let age = currentDate.getFullYear() - birth.getFullYear();
    const monthDiff = currentDate.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * 年齢フラグを取得
   */
  private getAgeFlags(age: number): AgeFlags {
    return {
      isCare2: age >= 40 && age < 65,      // 40〜64歳（介護保険第2号被保険者）
      isCare1: age >= 65,                  // 65歳以上（介護保険第1号被保険者）
      isNoPension: age >= 70,              // 70歳以上（厚生年金停止）
      isNoHealth: age >= 75                // 75歳以上（健康保険・介護保険停止）
    };
  }

  /**
   * 年齢区分を取得
   */
  private getAgeCategory(age: number): AgeCategory {
    if (age >= 75) {
      return 'no-health';      // 75歳以上：健康保険・介護保険停止
    } else if (age >= 70) {
      return 'no-pension';     // 70歳以上：厚生年金停止
    } else if (age >= 65) {
      return 'care-1st';       // 65歳以上：介護保険第1号被保険者
    } else if (age >= 40) {
      return 'care-2nd';       // 40〜64歳：介護保険第2号被保険者
    } else {
      return 'normal';        // 40歳未満：通常
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

