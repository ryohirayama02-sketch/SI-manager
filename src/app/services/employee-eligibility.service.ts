import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

export interface EmployeeEligibilityResult {
  healthInsuranceEligible: boolean;
  pensionEligible: boolean;
  careInsuranceEligible: boolean;
  candidateFlag: boolean; // 加入候補者（3ヶ月連続で実働20時間以上など）
  reasons: string[]; // 判定根拠
}

export interface EmployeeWorkInfo {
  weeklyHours?: number; // 週労働時間
  monthlyWage?: number; // 月額賃金（円）
  expectedEmploymentMonths?: number; // 雇用見込期間（月）
  isStudent?: boolean; // 学生かどうか
  consecutiveMonthsOver20Hours?: number; // 連続で20時間以上働いた月数
}

@Injectable({ providedIn: 'root' })
export class EmployeeEligibilityService {

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
        reasons.push('退職済みのため加入不可');
        return {
          healthInsuranceEligible: false,
          pensionEligible: false,
          careInsuranceEligible: false,
          candidateFlag: false,
          reasons
        };
      }
    }

    // 年齢による判定（下準備）
    const age = this.calculateAge(employee.birthDate, currentDate);
    const isCareInsuranceEligible = this.isCareInsuranceEligibleByAge(age);
    const isPensionEligibleByAge = this.isPensionEligibleByAge(age);
    const isHealthInsuranceEligibleByAge = this.isHealthInsuranceEligibleByAge(age);

    // 1. 週30時間以上 → 加入
    if (workInfo?.weeklyHours && workInfo.weeklyHours >= 30) {
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
    else if (workInfo?.weeklyHours && workInfo.weeklyHours >= 20 && workInfo.weeklyHours < 30) {
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
    else if (workInfo?.weeklyHours && workInfo.weeklyHours < 20) {
      if (workInfo.consecutiveMonthsOver20Hours && workInfo.consecutiveMonthsOver20Hours >= 3) {
        candidateFlag = true;
        reasons.push(`週${workInfo.weeklyHours}時間だが、過去3ヶ月連続で20時間以上働いているため加入候補者`);
      } else {
        reasons.push(`週${workInfo.weeklyHours}時間のため加入対象外`);
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
      reasons
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
    if (workInfo.expectedEmploymentMonths && workInfo.expectedEmploymentMonths > 2) {
      reasons.push(`雇用見込${workInfo.expectedEmploymentMonths}ヶ月（条件: 2ヶ月超）`);
    } else {
      allMet = false;
      if (workInfo.expectedEmploymentMonths !== undefined) {
        reasons.push(`雇用見込${workInfo.expectedEmploymentMonths}ヶ月（条件: 2ヶ月超を満たしていない）`);
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
   * 介護保険の加入可能年齢を判定（40歳以上65歳未満）
   */
  private isCareInsuranceEligibleByAge(age: number): boolean {
    return age >= 40 && age < 65;
  }

  /**
   * 厚生年金の加入可能年齢を判定（70歳未満）
   * 注: 70歳到達月の処理は別で実装予定
   */
  private isPensionEligibleByAge(age: number): boolean {
    return age < 70;
  }

  /**
   * 健康保険・介護保険の加入可能年齢を判定（75歳未満）
   * 注: 75歳到達月の処理は別で実装予定
   */
  private isHealthInsuranceEligibleByAge(age: number): boolean {
    return age < 75;
  }
}

