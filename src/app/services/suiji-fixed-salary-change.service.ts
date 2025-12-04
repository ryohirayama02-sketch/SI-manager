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
      const total =
        this.salaryAggregationService.getTotalSalaryPublic(salaryData); // totalSalary を優先（fixed + variable の総額）
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
    const gradeResult = this.gradeDeterminationService.findGrade(
      gradeTable,
      averageSalary
    );
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

    // 適用開始月は「変動月の3ヶ月後」（変動月が1か月目として4か月目が適用開始）
    let applyMonth: number | null = null;
    if (willApply) {
      applyMonth = changeMonth + 3;
      if (applyMonth > 12) {
        applyMonth = applyMonth - 12;
      }
      reasons.push(
        `適用開始月: ${applyMonth}月（変動月${changeMonth}月の3ヶ月後）`
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
}
