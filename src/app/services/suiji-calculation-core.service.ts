import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import {
  SalaryData,
  TeijiKetteiResult,
  SuijiCandidate,
  ExcludedSuijiReason,
  FixedSalaryChangeSuijiResult,
} from './salary-calculation.service';
import { SalaryAggregationService } from './salary-aggregation.service';
import { GradeDeterminationService } from './grade-determination.service';
import { SuijiDetectionService } from './suiji-detection.service';

/**
 * SuijiCalculationCoreService
 * 
 * 随時改定計算のコアロジックを担当するサービス
 * 固定給の取得、除外月判定、平均計算、等級判定を提供
 */
@Injectable({ providedIn: 'root' })
export class SuijiCalculationCoreService {
  constructor(
    private salaryAggregationService: SalaryAggregationService,
    private gradeDeterminationService: GradeDeterminationService,
    private suijiDetectionService: SuijiDetectionService
  ) {}

  /**
   * 給与データのキーを作成
   */
  private getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 変動月を含む3ヶ月の固定給を取得
   */
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

  /**
   * 随時改定の除外月を判定する
   */
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

  /**
   * 随時改定用の平均を計算（特例対応）
   */
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

  /**
   * 随時改定のメイン処理
   */
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
      this.suijiDetectionService.isWithin3MonthsAfterJoin(employeeId, changedMonth, employees, year)
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
}

