import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { MaternityLeaveService } from './maternity-leave.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';

@Injectable({ providedIn: 'root' })
export class ExemptionDeterminationService {
  constructor(
    private maternityLeaveService: MaternityLeaveService,
    private employeeLifecycleService: EmployeeLifecycleService
  ) {}

  /**
   * 指定年月における年齢を計算する
   * @param birthDate 生年月日（YYYY-MM-DD形式）
   * @param year 年度
   * @param month 月（1-12）
   * @returns 年齢
   */
  calculateAgeForMonth(birthDate: string, year: number, month: number): number {
    const birth = new Date(birthDate);
    const birthYear = birth.getFullYear();
    const birthMonth = birth.getMonth() + 1;
    const birthDay = birth.getDate();

    // その月の1日時点の年齢を計算
    const checkDate = new Date(year, month - 1, 1);
    let age = year - birthYear;
    if (month < birthMonth || (month === birthMonth && 1 < birthDay)) {
      age--;
    }
    return age;
  }

  /**
   * 指定年月が介護保険適用対象かどうかを判定する
   * @param birthDate 生年月日（YYYY-MM-DD形式）
   * @param year 年度
   * @param month 月（1-12）
   * @returns 介護保険適用対象の場合true（第2号被保険者のみ）
   */
  isCareInsuranceApplicable(
    birthDate: string,
    year: number,
    month: number
  ): boolean {
    const careType = this.getCareInsuranceType(birthDate, year, month);
    return careType === 'type2';
  }

  /**
   * 指定年月における介護保険区分を取得する
   * @param birthDate 生年月日（YYYY-MM-DD形式）
   * @param year 年度
   * @param month 月（1-12）
   * @returns 'none' | 'type1' | 'type2'
   *   - 'none': 39歳まで（介護保険適用なし）
   *   - 'type2': 40歳到達月から64歳到達月の前月まで（第2号被保険者、保険料あり）
   *   - 'type1': 65歳到達月以降（第1号被保険者、保険料なし）
   */
  getCareInsuranceType(
    birthDate: string,
    year: number,
    month: number
  ): 'none' | 'type1' | 'type2' {
    const birth = new Date(birthDate);
    const birthYear = birth.getFullYear();
    const birthMonth = birth.getMonth() + 1;
    const birthDay = birth.getDate();

    // その月の1日時点の年齢を計算
    const age = this.calculateAgeForMonth(birthDate, year, month);

    // 40歳到達月の判定（誕生日の前日が属する月から）
    // 8/1生まれ → 40歳の誕生日は8/1、前日は7/31 → 7月から発生
    // 8/2生まれ → 40歳の誕生日は8/2、前日は8/1 → 8月から発生
    let isAge40Month: boolean;
    if (birthDay === 1) {
      // 誕生日が月の1日の場合、前月から発生
      if (birthMonth === 1) {
        // 1月1日生まれの場合、前年12月から発生
        isAge40Month =
          (year === birthYear + 39 && month === 12) ||
          (year === birthYear + 40 && month >= birthMonth) ||
          year > birthYear + 40;
      } else {
        // 2月以降の場合、前月から発生
        isAge40Month =
          (year === birthYear + 40 && month >= birthMonth - 1) ||
          year > birthYear + 40;
      }
    } else {
      // 誕生日が月の2日以降の場合、誕生月から発生
      isAge40Month =
        (year === birthYear + 40 && month >= birthMonth) ||
        year > birthYear + 40;
    }
    // 65歳到達月の判定（誕生日の属する月から）
    const isAge65Month =
      (year === birthYear + 65 && month >= birthMonth) || year > birthYear + 65;

    // 75歳以上は健康保険・介護保険停止
    if (age >= 75) {
      return 'none';
    }

    // 65歳到達月以降は第1号被保険者（保険料なし）
    if (isAge65Month || age >= 65) {
      return 'type1';
    }

    // 40歳到達月から64歳到達月の前月まで第2号被保険者（保険料あり）
    if (isAge40Month || age >= 40) {
      return 'type2';
    }

    // 39歳まで
    return 'none';
  }

  calculateAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }

  /**
   * 指定月が免除月（産前産後休業・育児休業）かどうかを判定する
   * @param emp 従業員情報
   * @param year 年度
   * @param month 月（1-12）
   * @returns 免除月の場合true、それ以外false
   */
  isExemptMonth(emp: Employee, year: number, month: number): boolean {
    // 月単位の免除判定はEmployeeLifecycleServiceの月判定ロジックに統一
    const isMaternity = this.employeeLifecycleService.isMaternityLeave(
      emp,
      year,
      month
    );
    const isChildcare = this.employeeLifecycleService.isChildcareLeave(
      emp,
      year,
      month
    );
    return isMaternity || isChildcare;
  }

  /**
   * 指定年月の免除理由を取得（産休・育休・休職）
   * @param emp 従業員情報
   * @param year 年度
   * @param month 月（1-12）
   * @returns 免除結果（理由を含む）
   */
  getExemptReasonForMonth(
    emp: Employee,
    year: number,
    month: number
  ): { exempt: boolean; reason: string } {
    const isMaternity = this.employeeLifecycleService.isMaternityLeave(
      emp,
      year,
      month
    );
    if (isMaternity) {
      return {
        exempt: true,
        reason: '産前産後休業中（健康保険・厚生年金本人分免除）',
      };
    }

    const isChildcare = this.employeeLifecycleService.isChildcareLeave(
      emp,
      year,
      month
    );
    if (isChildcare) {
      return {
        exempt: true,
        reason: '育児休業中（健康保険・厚生年金本人分免除）',
      };
    }

    return { exempt: false, reason: '' };
  }
}
