import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import {
  SalaryData,
  TeijiKetteiResult,
  SuijiCandidate,
  ExcludedSuijiReason,
} from './salary-calculation.service';
import { GradeDeterminationService } from './grade-determination.service';
import { SuijiDetectionService } from './suiji-detection.service';
import { SuijiCalculationCoreService } from './suiji-calculation-core.service';
import { SalaryAggregationService } from './salary-aggregation.service';

/**
 * SuijiKetteiCalculationService
 *
 * 随時改定のメイン処理を担当するサービス
 * 資格取得後3ヶ月以内の除外判定、固定給取得、除外月判定、平均計算、等級比較を統合
 */
@Injectable({ providedIn: 'root' })
export class SuijiKetteiCalculationService {
  constructor(
    private gradeDeterminationService: GradeDeterminationService,
    private suijiDetectionService: SuijiDetectionService,
    private suijiCalculationCoreService: SuijiCalculationCoreService,
    private salaryAggregationService: SalaryAggregationService
  ) {}

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
      this.suijiDetectionService.isWithin3MonthsAfterJoin(
        employeeId,
        changedMonth,
        employees,
        year
      )
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

    // ② 変動月を含む3ヶ月の総支給（欠勤控除差引後）を取得
    const months: number[] = [];
    const totalValues: number[] = [];
    for (let i = 0; i < 3; i++) {
      const month = changedMonth + i;
      if (month > 12) break;
      months.push(month);
      const key = `${employeeId}_${month}`;
      const total = this.salaryAggregationService.getTotalSalaryPublic(
        salaries[key]
      );
      totalValues.push(total);
    }

    if (totalValues.length === 0) {
      return { candidate: null, excludedReason: null };
    }

    // ③ 除外月判定（支払基礎日数17日未満）
    const excludedMonths =
      this.suijiCalculationCoreService.getExcludedMonthsForSuiji(
        employeeId,
        months,
        salaries
      );

    // ④ 平均計算（総支給ベース、除外月を除く）
    const validTotals: number[] = [];
    const usedMonths: number[] = [];
    for (let i = 0; i < totalValues.length; i++) {
      const m = months[i];
      if (!excludedMonths.includes(m) && totalValues[i] > 0) {
        validTotals.push(totalValues[i]);
        usedMonths.push(m);
      }
    }
    if (validTotals.length === 0) {
      return { candidate: null, excludedReason: null };
    }
    const averageSalary =
      validTotals.reduce((sum, v) => sum + v, 0) / validTotals.length;

    // ⑤ 現行等級と新等級の比較
    const currentResult = currentResults[employeeId];
    const currentGrade = currentResult?.grade || 0;

    const newGradeResult = this.gradeDeterminationService.findGrade(
      gradeTable,
      averageSalary
    );
    if (!newGradeResult) {
      return { candidate: null, excludedReason: null };
    }

    const newGrade = newGradeResult.grade;
    const gradeDiff = Math.abs(newGrade - currentGrade);

    // 2等級以上なら随時改定候補とする
    if (gradeDiff >= 2) {
      const emp = employees.find((e) => e.id === employeeId);
      const name = emp?.name || '';

      // 適用開始月＝変動月 + 3ヶ月（変動月が1か月目として4か月目が適用開始）
      let applyMonth = changedMonth + 3;
      if (applyMonth > 12) {
        applyMonth = applyMonth - 12;
      }

      return {
        candidate: {
          employeeId,
          name,
          changedMonth,
          avgFixed: averageSalary, // フィールド名は既存のまま利用
          currentGrade,
          newGrade,
          gradeDiff,
          applyMonth,
          excludedMonths,
          fixedValues: totalValues, // フィールド名は既存のまま利用
        },
        excludedReason: null,
      };
    }

    return { candidate: null, excludedReason: null };
  }
}
