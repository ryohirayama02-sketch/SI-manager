import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { SalaryData, SuijiKouhoResult } from './salary-calculation.service';
import { SalaryAggregationService } from './salary-aggregation.service';
import { GradeDeterminationService } from './grade-determination.service';
import { MonthHelperService } from './month-helper.service';

/**
 * SuijiDetectionService
 *
 * 固定的賃金の変動検出を担当するサービス
 * 給与データから固定的賃金の変動を検出し、随時改定の候補を判定
 */
@Injectable({ providedIn: 'root' })
export class SuijiDetectionService {
  constructor(
    private salaryAggregationService: SalaryAggregationService,
    private gradeDeterminationService: GradeDeterminationService,
    private monthHelper: MonthHelperService
  ) {}

  /**
   * 給与データのキーを作成
   */
  private getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 固定的賃金の変動を検出する
   * @param employeeId 従業員ID
   * @param salaries 給与データ
   * @returns 変動があった月のリスト
   */
  detectFixedSalaryChanges(
    employeeId: string,
    salaries: { [key: string]: SalaryData }
  ): number[] {
    const changeMonths: number[] = [];
    let prevFixed = 0;

    // 1月から12月まで順にチェック
    for (let month = 1; month <= 12; month++) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const currentFixed =
        this.salaryAggregationService.getFixedSalaryPublic(salaryData); // fixedSalary を優先

      // 前月と比較して変動があったか判定
      if (month > 1 && prevFixed > 0 && currentFixed !== prevFixed) {
        changeMonths.push(month);
      }

      // 初月または前月のfixedが0の場合は、現在のfixedを記録
      if (month === 1 || prevFixed === 0) {
        prevFixed = currentFixed;
      } else {
        prevFixed = currentFixed;
      }
    }

    return changeMonths;
  }

  /**
   * 資格取得後3ヶ月以内かどうかを判定する
   */
  isWithin3MonthsAfterJoin(
    employeeId: string,
    changedMonth: number,
    employees: Employee[],
    year: string
  ): boolean {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp || !emp.joinDate) return false;

    const joinDate = new Date(emp.joinDate);
    const joinYear = this.monthHelper.getPayYear(joinDate);
    const joinMonth = this.monthHelper.getPayMonth(joinDate);

    // 追加：資格取得時決定 資格取得月〜その後3ヶ月間は随時改定対象外
    // 変動月が入社年と同じ場合のみ判定
    if (parseInt(year) === joinYear) {
      const monthsDiff = changedMonth - joinMonth;
      // 資格取得月（monthsDiff === 0）から3ヶ月後（monthsDiff === 3）まで除外
      return monthsDiff >= 0 && monthsDiff <= 3;
    }

    return false;
  }

  /**
   * 特定の月における固定的賃金の変動を検出し、随時改定候補を判定する
   */
  checkFixedSalaryChangeForMonth(
    employeeId: string,
    month: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    employees: Employee[],
    year: string,
    currentResults: { [employeeId: string]: any }
  ): SuijiKouhoResult | null {
    const reasons: string[] = [];

    // 追加：資格取得時決定 資格取得直後なら除外
    // 資格取得月〜その後3ヶ月間は随時改定判定の対象外
    if (this.isWithin3MonthsAfterJoin(employeeId, month, employees, year)) {
      reasons.push('資格取得後3か月以内のため随時改定不可');
      return {
        employeeId,
        changeMonth: month,
        averageSalary: 0,
        currentGrade: 0,
        newGrade: 0,
        diff: 0,
        applyStartMonth: 0,
        reasons,
        isEligible: false,
      };
    }

    // 前月の固定的賃金を取得
    const prevMonth = month > 1 ? month - 1 : null;
    let prevFixed = 0;
    if (prevMonth) {
      const prevKey = this.getSalaryKey(employeeId, prevMonth);
      const prevSalaryData = salaries[prevKey];
      prevFixed =
        this.salaryAggregationService.getFixedSalaryPublic(prevSalaryData); // fixedSalary を優先
    }

    // 当月の固定的賃金を取得
    const currentKey = this.getSalaryKey(employeeId, month);
    const currentSalaryData = salaries[currentKey];
    const currentFixed =
      this.salaryAggregationService.getFixedSalaryPublic(currentSalaryData); // fixedSalary を優先

    // 固定的賃金の変動がない場合はスキップ
    if (prevFixed === 0 || currentFixed === prevFixed) {
      return null;
    }

    // 変動理由を記録
    reasons.push(
      `固定的賃金が${prevFixed.toLocaleString()}円 → ${currentFixed.toLocaleString()}円に変動`
    );

    // 変動月を含む3ヶ月（変動月・翌月・翌々月）で平均報酬を取得
    const targetMonths: number[] = [];
    for (let i = 0; i < 3; i++) {
      const targetMonth = month + i;
      if (targetMonth > 12) {
        reasons.push(
          `${month}月の変動では、3ヶ月分のデータが揃わない（${targetMonth}月が存在しない）`
        );
        return {
          employeeId,
          changeMonth: month,
          averageSalary: 0,
          currentGrade: 0,
          newGrade: 0,
          diff: 0,
          applyStartMonth: 0,
          reasons,
          isEligible: false,
        };
      }
      targetMonths.push(targetMonth);
    }

    // 3ヶ月分の給与データを取得（総支給額：固定＋非固定）
    const totalSalaryValues: number[] = [];
    const workingDaysList: number[] = [];
    for (const targetMonth of targetMonths) {
      const key = this.getSalaryKey(employeeId, targetMonth);
      const salaryData = salaries[key];
      const total =
        this.salaryAggregationService.getTotalSalaryPublic(salaryData); // totalSalary を優先（fixed + variable の総支給）
      totalSalaryValues.push(total);
      const workingDays = salaryData?.workingDays;
      workingDaysList.push(workingDays ?? 0);
    }

    // 支払基礎日数17日未満（0日を含む）が1つでもあれば随時改定無効
    const invalidByWorkingDays = workingDaysList.some(
      (wd) => wd < 17
    );
    if (invalidByWorkingDays) {
      reasons.push('支払基礎日数17日未満の月が含まれるため随時改定対象外');
      return {
        employeeId,
        changeMonth: month,
        averageSalary: 0,
        currentGrade: 0,
        newGrade: 0,
        diff: 0,
        applyStartMonth: 0,
        reasons,
        isEligible: false,
      };
    }

    // 3ヶ月平均を計算（総支給額で平均）
    const total = totalSalaryValues.reduce((sum, v) => sum + v, 0);
    // 円未満は切り捨て
    const averageSalary = Math.floor(total / totalSalaryValues.length);
    reasons.push(
      `${targetMonths.join(
        '・'
      )}月の平均報酬: ${averageSalary.toLocaleString()}円`
    );

    // 現行等級を取得
    const currentResult = currentResults[employeeId];
    const currentGrade = currentResult?.grade || 0;

    // 新等級を判定
    const gradeResult = this.gradeDeterminationService.findGrade(
      gradeTable,
      averageSalary
    );
    if (!gradeResult) {
      reasons.push('標準報酬月額テーブルに該当する等級が見つかりません');
      return {
        employeeId,
        changeMonth: month,
        averageSalary,
        currentGrade,
        newGrade: 0,
        diff: 0,
        applyStartMonth: 0,
        reasons,
        isEligible: false,
      };
    }

    const newGrade = gradeResult.grade;
    const diff = Math.abs(newGrade - currentGrade);

    // 2等級以上の差 → 随時改定成立
    const isEligible = diff >= 2;
    if (isEligible) {
      reasons.push(
        `現行等級${currentGrade} → 新等級${newGrade}（${diff}等級差）により随時改定成立`
      );
    } else {
      reasons.push(
        `現行等級${currentGrade} → 新等級${newGrade}（${diff}等級差）により随時改定不成立（2等級以上差が必要）`
      );
    }

    // 適用開始月は「変動月の3ヶ月後」（変動月が1か月目として4か月目が適用開始）
    let applyStartMonth = month + 3;
    if (applyStartMonth > 12) {
      applyStartMonth = applyStartMonth - 12;
    }
    reasons.push(
      `適用開始月: ${applyStartMonth}月（変動月${month}月の3ヶ月後）`
    );

    return {
      employeeId,
      changeMonth: month,
      averageSalary,
      currentGrade,
      newGrade,
      diff,
      applyStartMonth,
      reasons,
      isEligible,
    };
  }
}
