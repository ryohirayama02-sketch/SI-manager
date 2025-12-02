import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import {
  SalaryData,
  TeijiKetteiResult,
  SuijiCandidate,
  ExcludedSuijiReason,
  SuijiKouhoResult,
  FixedSalaryChangeSuijiResult,
} from './salary-calculation.service';
import { SalaryAggregationService } from './salary-aggregation.service';
import { GradeDeterminationService } from './grade-determination.service';
import { ExemptionDeterminationService } from './exemption-determination.service';
import { MonthHelperService } from './month-helper.service';

@Injectable({ providedIn: 'root' })
export class SuijiCalculationService {
  constructor(
    private salaryAggregationService: SalaryAggregationService,
    private gradeDeterminationService: GradeDeterminationService,
    private exemptionDeterminationService: ExemptionDeterminationService,
    private monthHelper: MonthHelperService
  ) {}

  /**
   * 給与データのキーを作成
   */
  private getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  // 随時改定ロジック
  getFixed3Months(
    employeeId: string,
    changedMonth: number,
    salaries: { [key: string]: SalaryData }
  ): number[] {
    const values: number[] = [];
    // changedMonthを含む3ヶ月を取得
    for (let i = 0; i < 3; i++) {
      const month = changedMonth + i;
      if (month > 12) break;
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const value = this.salaryAggregationService.getFixedSalaryPublic(salaryData); // fixedSalary を優先
      values.push(value);
    }
    return values;
  }

  getExcludedMonthsForSuiji(
    employeeId: string,
    months: number[],
    salaries: { [key: string]: SalaryData }
  ): number[] {
    const excluded: number[] = [];

    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const fixed = this.salaryAggregationService.getFixedSalaryPublic(salaryData); // fixedSalary を優先
      const total = this.salaryAggregationService.getTotalSalaryPublic(salaryData); // totalSalary を優先

      // 1. 無給月（total 0）
      if (total === 0) {
        excluded.push(month);
        continue;
      }

      // 2. 欠勤控除：前月比20%以上低下
      if (i > 0) {
        const prevMonth = months[i - 1];
        const prevKey = this.getSalaryKey(employeeId, prevMonth);
        const prevSalaryData = salaries[prevKey];
        const prevFixed = this.salaryAggregationService.getFixedSalaryPublic(prevSalaryData); // fixedSalary を優先

        if (prevFixed > 0 && fixed < prevFixed * 0.8) {
          excluded.push(month);
          continue;
        }
      }

      // 3. 産前産後休業月（実装簡略化：totalが0の場合は既に除外）
      // 4. 育児休業月（実装簡略化：totalが0の場合は既に除外）
      // 5. 休職月（実装簡略化：totalが0の場合は既に除外）
    }

    return excluded;
  }

  calculateAverageForSuiji(
    fixedValues: number[],
    excludedMonths: number[],
    months: number[]
  ): number | null {
    const validValues: number[] = [];

    for (let i = 0; i < fixedValues.length; i++) {
      const month = months[i];
      if (!excludedMonths.includes(month) && fixedValues[i] > 0) {
        validValues.push(fixedValues[i]);
      }
    }

    // 特例対応
    if (validValues.length === 0) return null;
    if (validValues.length === 1) return validValues[0];
    if (validValues.length === 2) {
      return Math.round((validValues[0] + validValues[1]) / 2);
    }
    // 3ヶ月揃えば平均
    const total = validValues.reduce((sum, v) => sum + v, 0);
    return Math.round(total / validValues.length);
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
      const currentFixed = this.salaryAggregationService.getFixedSalaryPublic(salaryData); // fixedSalary を優先

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
   * 随時改定（固定的賃金の変動）を判定する
   * @param employeeId 従業員ID
   * @param changeMonth 変動月
   * @param salaries 給与データ
   * @param gradeTable 標準報酬月額テーブル
   * @param currentGrade 現行等級
   * @returns 随時改定判定結果
   */
  calculateFixedSalaryChangeSuiji(
    employeeId: string,
    changeMonth: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    currentGrade: number
  ): FixedSalaryChangeSuijiResult {
    const reasons: string[] = [];

    // 変動月 + 前後3ヶ月（変動月・翌月・翌々月）で平均報酬を取得
    const targetMonths: number[] = [];
    for (let i = 0; i < 3; i++) {
      const month = changeMonth + i;
      if (month > 12) {
        reasons.push(
          `${changeMonth}月の変動では、3ヶ月分のデータが揃わない（${month}月が存在しない）`
        );
        return {
          changeMonth,
          averageSalary: 0,
          currentGrade,
          newGrade: 0,
          diff: 0,
          willApply: false,
          applyMonth: null,
          reasons,
        };
      }
      targetMonths.push(month);
    }

    // 3ヶ月分の給与データを取得（総支給額：固定＋非固定）
    const totalSalaryValues: number[] = [];
    for (const month of targetMonths) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const total = this.salaryAggregationService.getTotalSalaryPublic(salaryData); // totalSalary を優先（fixed + variable の総額）
      totalSalaryValues.push(total);
    }

    // 3ヶ月揃わない場合は算定不可
    if (totalSalaryValues.length !== 3) {
      reasons.push(`${changeMonth}月の変動では、3ヶ月分のデータが揃わない`);
      return {
        changeMonth,
        averageSalary: 0,
        currentGrade,
        newGrade: 0,
        diff: 0,
        willApply: false,
        applyMonth: null,
        reasons,
      };
    }

    // 平均報酬を計算（総支給額で平均）
    const total = totalSalaryValues.reduce((sum, v) => sum + v, 0);
    const rawAverage = Math.round(total / totalSalaryValues.length);
    // 標準報酬月額の四捨五入処理（1000円未満四捨五入）
    const averageSalary = Math.round(rawAverage / 1000) * 1000;
    reasons.push(
      `${targetMonths.join(
        '・'
      )}月の平均報酬: ${averageSalary.toLocaleString()}円`
    );

    // 新等級を判定
    const gradeResult = this.gradeDeterminationService.findGrade(gradeTable, averageSalary);
    if (!gradeResult) {
      reasons.push('標準報酬月額テーブルに該当する等級が見つかりません');
      return {
        changeMonth,
        averageSalary,
        currentGrade,
        newGrade: 0,
        diff: 0,
        willApply: false,
        applyMonth: null,
        reasons,
      };
    }

    const newGrade = gradeResult.grade;
    const diff = Math.abs(newGrade - currentGrade);

    // 2等級以上の差 → 随時改定成立
    const willApply = diff >= 2;
    if (willApply) {
      reasons.push(
        `現行等級${currentGrade} → 新等級${newGrade}（${diff}等級差）により随時改定成立`
      );
    } else {
      reasons.push(
        `現行等級${currentGrade} → 新等級${newGrade}（${diff}等級差）により随時改定不成立（2等級以上差が必要）`
      );
    }

    // 適用開始月は「変動月の4ヶ月後」
    let applyMonth: number | null = null;
    if (willApply) {
      applyMonth = changeMonth + 4;
      if (applyMonth > 12) {
        applyMonth = applyMonth - 12;
      }
      reasons.push(
        `適用開始月: ${applyMonth}月（変動月${changeMonth}月の4ヶ月後）`
      );
    }

    return {
      changeMonth,
      averageSalary,
      currentGrade,
      newGrade,
      diff,
      willApply,
      applyMonth,
      reasons,
    };
  }

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

  calculateSuijiKetteiCore(
    employeeId: string,
    changedMonth: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    employees: Employee[],
    year: string,
    currentResults: { [employeeId: string]: TeijiKetteiResult }
  ): {
    candidate: SuijiCandidate | null;
    excludedReason: ExcludedSuijiReason | null;
  } {
    // 追加：資格取得時決定 資格取得直後なら除外
    // ⑥ 資格取得月〜その後3ヶ月間は随時改定判定の対象外
    if (
      this.isWithin3MonthsAfterJoin(employeeId, changedMonth, employees, year)
    ) {
      const emp = employees.find((e) => e.id === employeeId);
      const name = emp?.name || '';
      return {
        candidate: null,
        excludedReason: {
          employeeId,
          name,
          reason: '資格取得後3か月以内',
        },
      };
    }

    // ② 変動月を含む3ヶ月のfixedを取得
    const fixedValues = this.getFixed3Months(
      employeeId,
      changedMonth,
      salaries
    );
    const months = [];
    for (let i = 0; i < 3; i++) {
      const month = changedMonth + i;
      if (month > 12) break;
      months.push(month);
    }

    if (fixedValues.length === 0) {
      return { candidate: null, excludedReason: null };
    }

    // ③ 除外月判定
    const excludedMonths = this.getExcludedMonthsForSuiji(
      employeeId,
      months,
      salaries
    );

    // ④ 平均計算（特例対応）
    const avgFixed = this.calculateAverageForSuiji(
      fixedValues,
      excludedMonths,
      months
    );
    if (avgFixed === null || avgFixed === 0) {
      return { candidate: null, excludedReason: null };
    }

    // ⑤ 現行等級と新等級の比較
    const currentResult = currentResults[employeeId];
    const currentGrade = currentResult?.grade || 0;

    const newGradeResult = this.gradeDeterminationService.findGrade(gradeTable, avgFixed);
    if (!newGradeResult) {
      return { candidate: null, excludedReason: null };
    }

    const newGrade = newGradeResult.grade;
    const gradeDiff = Math.abs(newGrade - currentGrade);

    // 2等級以上なら随時改定候補とする
    if (gradeDiff >= 2) {
      const emp = employees.find((e) => e.id === employeeId);
      const name = emp?.name || '';

      // 適用開始月＝変動月 + 4ヶ月
      let applyMonth = changedMonth + 4;
      if (applyMonth > 12) {
        applyMonth = applyMonth - 12;
      }

      return {
        candidate: {
          employeeId,
          name,
          changedMonth,
          avgFixed,
          currentGrade,
          newGrade,
          gradeDiff,
          applyMonth,
          excludedMonths,
          fixedValues,
        },
        excludedReason: null,
      };
    }

    return { candidate: null, excludedReason: null };
  }

  /**
   * 復職（産休・育休終了）に伴う固定的賃金の変動を検出し、随時改定候補を判定する
   * @param employeeId 従業員ID
   * @param salaries 給与データ
   * @param gradeTable 標準報酬月額テーブル
   * @param employees 従業員リスト
   * @param year 年
   * @param currentResults 現行の定時決定結果
   * @returns 随時改定候補結果のリスト
   */
  checkRehabSuiji(
    employeeId: string,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    employees: Employee[],
    year: string,
    currentResults: { [employeeId: string]: TeijiKetteiResult }
  ): SuijiKouhoResult[] {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return [];

    // 復職月判定（産休・育休終了日から）
    let returnMonth: number | null = null;
    let returnYear: number | null = null;

    // 産休終了日または育休終了日から復職月を取得
    if (emp.maternityLeaveEnd) {
      const matEndDate = new Date(emp.maternityLeaveEnd);
      returnMonth = this.monthHelper.getPayMonth(matEndDate);
      returnYear = this.monthHelper.getPayYear(matEndDate);
    } else if (emp.childcareLeaveEnd) {
      const childEndDate = new Date(emp.childcareLeaveEnd);
      returnMonth = this.monthHelper.getPayMonth(childEndDate);
      returnYear = this.monthHelper.getPayYear(childEndDate);
    } else if (emp.returnFromLeaveDate) {
      const returnDate = new Date(emp.returnFromLeaveDate);
      returnMonth = this.monthHelper.getPayMonth(returnDate);
      returnYear = this.monthHelper.getPayYear(returnDate);
    }

    // 復職情報がない場合はスキップ
    if (!returnMonth || !returnYear) return [];

    // 復職年が現在の年と異なる場合はスキップ
    if (parseInt(year) !== returnYear) return [];

    const results: SuijiKouhoResult[] = [];

    // 復職月・翌月・翌々月を監視対象とする
    const targetMonths = [returnMonth, returnMonth + 1, returnMonth + 2].filter(
      (m) => m <= 12
    );

    // 各監視対象月で固定的賃金の変動を検出
    for (const month of targetMonths) {
      const result = this.checkFixedSalaryChangeForMonth(
        employeeId,
        month,
        salaries,
        gradeTable,
        employees,
        year,
        currentResults
      );

      if (result && result.isEligible) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 特定の月における固定的賃金の変動を検出し、随時改定候補を判定する
   */
  private checkFixedSalaryChangeForMonth(
    employeeId: string,
    month: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    employees: Employee[],
    year: string,
    currentResults: { [employeeId: string]: TeijiKetteiResult }
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
      prevFixed = this.salaryAggregationService.getFixedSalaryPublic(prevSalaryData); // fixedSalary を優先
    }

    // 当月の固定的賃金を取得
    const currentKey = this.getSalaryKey(employeeId, month);
    const currentSalaryData = salaries[currentKey];
    const currentFixed = this.salaryAggregationService.getFixedSalaryPublic(currentSalaryData); // fixedSalary を優先

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
    for (const targetMonth of targetMonths) {
      const key = this.getSalaryKey(employeeId, targetMonth);
      const salaryData = salaries[key];
      const total = this.salaryAggregationService.getTotalSalaryPublic(salaryData); // totalSalary を優先（fixed + variable の総支給）
      totalSalaryValues.push(total);
    }

    // 3ヶ月平均を計算（総支給額で平均）
    const total = totalSalaryValues.reduce((sum, v) => sum + v, 0);
    const rawAverage = Math.round(total / totalSalaryValues.length);
    // 標準報酬月額の四捨五入処理（1000円未満四捨五入）
    const averageSalary = Math.round(rawAverage / 1000) * 1000;
    reasons.push(
      `${targetMonths.join(
        '・'
      )}月の平均報酬: ${averageSalary.toLocaleString()}円`
    );

    // 現行等級を取得
    const currentResult = currentResults[employeeId];
    const currentGrade = currentResult?.grade || 0;

    // 新等級を判定
    const gradeResult = this.gradeDeterminationService.findGrade(gradeTable, averageSalary);
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

    // 適用開始月は「変動月の4ヶ月後」
    let applyStartMonth = month + 4;
    if (applyStartMonth > 12) {
      applyStartMonth = applyStartMonth - 12;
    }
    reasons.push(
      `適用開始月: ${applyStartMonth}月（変動月${month}月の4ヶ月後）`
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

  getRehabHighlightMonths(employee: Employee, year: string): number[] {
    if (!employee.returnFromLeaveDate) return [];

    const returnDate = new Date(employee.returnFromLeaveDate);
    const returnYear = this.monthHelper.getPayYear(returnDate);
    const returnMonth = this.monthHelper.getPayMonth(returnDate);

    // 復職年が現在の年と異なる場合は空配列
    if (parseInt(year) !== returnYear) return [];

    // 復職月・翌月・翌々月を返す（12月を超えたら無視）
    const result: number[] = [];
    for (let i = 0; i < 3; i++) {
      const month = returnMonth + i;
      if (month <= 12) {
        result.push(month);
      }
    }
    return result;
  }
}

