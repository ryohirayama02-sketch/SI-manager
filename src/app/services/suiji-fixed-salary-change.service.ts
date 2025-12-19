import { Injectable } from '@angular/core';
import {
  SalaryData,
  FixedSalaryChangeSuijiResult,
} from './salary-calculation.service';
import { SalaryAggregationService } from './salary-aggregation.service';
import { GradeDeterminationService } from './grade-determination.service';

/**
 * SuijiFixedSalaryChangeService
 *
 * 固定的賃金の変動による随時改定判定を担当するサービス
 * 変動月を含む3ヶ月の平均報酬を計算し、等級差を判定
 */
@Injectable({ providedIn: 'root' })
export class SuijiFixedSalaryChangeService {
  constructor(
    private salaryAggregationService: SalaryAggregationService,
    private gradeDeterminationService: GradeDeterminationService
  ) {}

  /**
   * 給与データのキーを作成
   */
  private getSalaryKey(employeeId: string, month: number): string {
    if (!employeeId) {
      throw new Error('従業員IDが指定されていません');
    }
    if (isNaN(month) || month < 1 || month > 12) {
      throw new Error(`無効な月が指定されました: ${month}`);
    }
    return `${employeeId}_${month}`;
  }

  /**
   * 随時改定（固定的賃金の変動）を判定する
   */
  calculateFixedSalaryChangeSuiji(
    employeeId: string,
    changeMonth: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    currentGrade: number
  ): FixedSalaryChangeSuijiResult {
    if (!employeeId) {
      throw new Error('従業員IDが指定されていません');
    }
    if (isNaN(changeMonth) || changeMonth < 1 || changeMonth > 12) {
      throw new Error(`無効な変更月が指定されました: ${changeMonth}`);
    }
    if (!salaries || typeof salaries !== 'object') {
      throw new Error('給与データが指定されていません');
    }
    if (!gradeTable || !Array.isArray(gradeTable)) {
      throw new Error('標準報酬等級表が指定されていません');
    }
    if (isNaN(currentGrade) || currentGrade < 0) {
      throw new Error(`無効な現在等級が指定されました: ${currentGrade}`);
    }
    const reasons: string[] = [];

    // 変動月 + 前後3ヶ月（変動月・翌月・翌々月）で平均報酬を取得
    // 年度を跨ぐ場合も考慮（変動月が11月や12月の場合）
    console.log(
      `[SUIJI_CALC] START | employeeId=${employeeId} | changeMonth=${changeMonth} | currentGrade=${currentGrade} | salaries keys=${Object.keys(
        salaries
      ).join(',')}`
    );
    const targetMonths: number[] = [];
    for (let i = 0; i < 3; i++) {
      const month = changeMonth + i;
      targetMonths.push(month);
    }
    console.log(
      `[SUIJI_CALC] TARGET_MONTHS | employeeId=${employeeId} | changeMonth=${changeMonth} | targetMonths=[${targetMonths.join(
        ','
      )}]`
    );

    // 3ヶ月分の給与データを取得（総支給額：固定＋非固定）
    const totalSalaryValues: number[] = [];
    for (let i = 0; i < targetMonths.length; i++) {
      const month = targetMonths[i];
      let key: string;

      // 年度を跨ぐ場合の処理
      if (month > 12) {
        // 翌年度の月として取得（例：13月 → 1月、14月 → 2月）
        const nextYearMonth = month - 12;
        key = this.getSalaryKey(employeeId, nextYearMonth);
        console.log(
          `[SUIJI_CALC] CROSS_YEAR_MONTH | employeeId=${employeeId} | changeMonth=${changeMonth} | month=${month} | nextYearMonth=${nextYearMonth} | key=${key}`
        );
      } else {
        key = this.getSalaryKey(employeeId, month);
        console.log(
          `[SUIJI_CALC] SAME_YEAR_MONTH | employeeId=${employeeId} | changeMonth=${changeMonth} | month=${month} | key=${key}`
        );
      }

      const salaryData = salaries[key];
      const total =
        this.salaryAggregationService.getTotalSalaryPublic(salaryData); // totalSalary を優先（fixed + variable の総額）
      console.log(
        `[SUIJI_CALC] SALARY_DATA | employeeId=${employeeId} | changeMonth=${changeMonth} | month=${month} | key=${key} | hasData=${!!salaryData} | total=${total} | data=${
          salaryData ? JSON.stringify(salaryData) : 'null'
        }`
      );
      totalSalaryValues.push(isNaN(total) ? 0 : total);
    }
    console.log(
      `[SUIJI_CALC] TOTAL_SALARY_VALUES | employeeId=${employeeId} | changeMonth=${changeMonth} | totalSalaryValues=[${totalSalaryValues.join(
        ','
      )}] | length=${totalSalaryValues.length}`
    );

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
    const total = totalSalaryValues.reduce(
      (sum, v) => (isNaN(v) ? sum : sum + v),
      0
    );
    // 円未満は切り捨て
    const averageSalary =
      totalSalaryValues.length > 0
        ? Math.floor(total / totalSalaryValues.length)
        : 0;
    if (isNaN(averageSalary) || averageSalary < 0) {
      reasons.push('平均報酬の計算に失敗しました');
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
    reasons.push(
      `${targetMonths.join(
        '・'
      )}月の平均報酬: ${averageSalary.toLocaleString()}円`
    );

    // 新等級を判定
    const gradeResult = this.gradeDeterminationService.findGrade(
      gradeTable,
      averageSalary
    );
    if (!gradeResult || isNaN(gradeResult.grade)) {
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
    if (isNaN(newGrade) || isNaN(currentGrade)) {
      reasons.push('等級の計算に失敗しました');
      return {
        changeMonth,
        averageSalary,
        currentGrade: 0,
        newGrade: 0,
        diff: 0,
        willApply: false,
        applyMonth: null,
        reasons,
      };
    }
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

    // 適用開始月は「変動月の3ヶ月後」（変動月が1か月目として4か月目が適用開始）
    let applyMonth: number | null = null;
    if (willApply) {
      applyMonth = changeMonth + 3;
      if (applyMonth > 12) {
        applyMonth = applyMonth - 12;
      }
      if (applyMonth < 1 || applyMonth > 12) {
        applyMonth = null;
        reasons.push('適用開始月の計算に失敗しました');
      } else {
        reasons.push(
          `適用開始月: ${applyMonth}月（変動月${changeMonth}月の3ヶ月後）`
        );
      }
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
}
