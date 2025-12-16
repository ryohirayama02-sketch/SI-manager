import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { Employee } from '../models/employee.model';
import { EmployeeService } from './employee.service';
import { EmployeeWorkCategoryService } from './employee-work-category.service';
import { RoomIdService } from './room-id.service';

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
  private subscriptionInitialized = false;

  // デバッグ用: 購読者の数を追跡
  private subscriberCount = 0;

  constructor(
    private employeeService: EmployeeService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService,
    private roomIdService: RoomIdService
  ) {
    // 循環依存を避けるため、setTimeoutで遅延させる
    // DIの初期化が完了してから購読を開始することで、循環依存エラーを回避
    setTimeout(() => {
      this.initializeSubscription();
    }, 0);
  }

  /**
   * 購読を初期化（ルームIDが設定されている場合のみ）
   * RoomGuardでルームIDのチェックが行われるため、ここでは設定されている前提で処理
   */
  private initializeSubscription(): void {
    if (this.subscriptionInitialized) {
      return;
    }

    // ルームIDが設定されているかチェック
    // RoomGuardで既にチェックされているが、念のため確認
    if (!this.roomIdService.hasRoomId()) {
      // ルームIDが設定されていない場合は購読をスキップ
      // RoomGuardがリダイレクトを処理するため、ここでは何もしない
      return;
    }

    this.subscriptionInitialized = true;

    try {
      // 従業員情報の変更を監視してeligibilityを再計算
      this.employeeService.observeEmployees().subscribe(async () => {
        await this.recalculateAllEligibility();
      });
    } catch (error) {
      // エラーが発生した場合は購読をスキップ
      console.warn(
        '[EmployeeEligibilityService] 購読の初期化に失敗しました:',
        error
      );
      this.subscriptionInitialized = false;
    }
  }

  /**
   * 全従業員の加入区分を再計算
   */
  private async recalculateAllEligibility(): Promise<void> {
    // ルームIDが設定されているかチェック
    if (!this.roomIdService.hasRoomId()) {
      return;
    }

    try {
      const employees = await this.employeeService.getAllEmployees();

      const eligibilityMap: {
        [employeeId: string]: EmployeeEligibilityResult;
      } = {};

      for (const emp of employees) {
        eligibilityMap[emp.id] = this.checkEligibility(emp);
      }

      this.eligibilitySubject.next(eligibilityMap);
    } catch (error) {
      // ルームIDが設定されていない場合など、エラーが発生した場合はスキップ
      console.warn(
        '[EmployeeEligibilityService] 加入区分の再計算に失敗しました:',
        error
      );
    }
  }

  /**
   * 加入区分の変更を監視する
   * @returns Observable<{ [employeeId: string]: EmployeeEligibilityResult }>
   */
  observeEligibility(): Observable<{
    [employeeId: string]: EmployeeEligibilityResult;
  }> {
    // 購読が初期化されていない場合は初期化を試みる
    if (!this.subscriptionInitialized) {
      this.initializeSubscription();
    }

    // 初回読み込み時に計算を実行（ルームIDが設定されている場合のみ）
    // 非同期で実行されるが、購読は即座に返す（BehaviorSubjectの現在値が発火する）
    if (this.roomIdService.hasRoomId()) {
      // 非同期で実行するが、完了を待たない（購読は即座に返す）
      this.recalculateAllEligibility().catch((error) => {
        console.error('[EmployeeEligibilityService] 初回計算エラー:', error);
      });
    }

    // 購読者の数を追跡（デバッグ用）
    const observable = this.eligibilitySubject.asObservable();
    this.subscriberCount++;

    return observable;
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
        const ageFlags = this.getAgeFlags(age, employee.birthDate, currentDate);
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
    const ageFlags = this.getAgeFlags(age, employee.birthDate, currentDate);
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
   * @param age 年齢
   * @param birthDate 生年月日（70歳到達月の判定に使用）
   * @param currentDate 判定基準日（70歳到達月の判定に使用）
   */
  private getAgeFlags(
    age: number,
    birthDate?: string,
    currentDate?: Date
  ): AgeFlags {
    // 70歳到達月の判定（誕生日の前日が属する月から）
    // 3/1生まれ → 70歳の誕生日は3/1、前日は2/28 → 2月から終了
    // 3/2生まれ → 70歳の誕生日は3/2、前日は3/1 → 3月から終了
    let isNoPension = age >= 70;
    if (birthDate && currentDate && age === 69) {
      // 69歳の場合、70歳到達月かどうかを判定
      const birth = new Date(birthDate);
      const birthYear = birth.getFullYear();
      const birthMonth = birth.getMonth() + 1;
      const birthDay = birth.getDate();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      let isAge70Month: boolean;
      if (birthDay === 1) {
        // 誕生日が月の1日の場合、前月から終了
        if (birthMonth === 1) {
          // 1月1日生まれの場合、前年12月から終了
          isAge70Month =
            (year === birthYear + 69 && month === 12) ||
            (year === birthYear + 70 && month >= birthMonth);
        } else {
          // 2月以降の場合、前月から終了
          isAge70Month = year === birthYear + 70 && month >= birthMonth - 1;
        }
      } else {
        // 誕生日が月の2日以降の場合、誕生月から終了
        isAge70Month = year === birthYear + 70 && month >= birthMonth;
      }

      if (isAge70Month) {
        isNoPension = true;
      }
    }

    // 75歳到達月の判定（誕生日が属する月から）
    // 3/1に75歳になる → 3月から健康保険ゼロ。2月は健康保険あり
    // 3/2に75歳になる → 3月から健康保険ゼロ。2月は健康保険あり
    let isNoHealth = age >= 75;
    if (birthDate && currentDate && age === 74) {
      // 74歳の場合、75歳到達月かどうかを判定
      const birth = new Date(birthDate);
      const birthYear = birth.getFullYear();
      const birthMonth = birth.getMonth() + 1;
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      // 誕生日が属する月から健康保険ゼロ（誕生日の日付に関係なく、誕生月から）
      const isAge75Month =
        (year === birthYear + 75 && month >= birthMonth) ||
        year > birthYear + 75;

      if (isAge75Month) {
        isNoHealth = true;
      }
    }

    return {
      isCare2: age >= 40 && age < 65, // 40〜64歳（介護保険第2号被保険者）
      isCare1: age >= 65, // 65歳以上（介護保険第1号被保険者）
      isNoPension: isNoPension, // 70歳以上（厚生年金停止）
      isNoHealth: isNoHealth, // 75歳以上（健康保険・介護保険停止）
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
