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
    if (!employeeId) {
      return { candidate: null, excludedReason: null };
    }
    if (isNaN(changedMonth) || changedMonth < 1 || changedMonth > 12) {
      return { candidate: null, excludedReason: null };
    }
    if (!salaries || typeof salaries !== 'object') {
      return { candidate: null, excludedReason: null };
    }
    if (!gradeTable || !Array.isArray(gradeTable)) {
      return { candidate: null, excludedReason: null };
    }
    if (!employees || !Array.isArray(employees)) {
      return { candidate: null, excludedReason: null };
    }
    if (!year) {
      return { candidate: null, excludedReason: null };
    }
    if (!currentResults || typeof currentResults !== 'object') {
      return { candidate: null, excludedReason: null };
    }
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
      const emp = employees.find((e) => e && e.id === employeeId);
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
      totalValues.push(isNaN(total) ? 0 : total);
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

    // 支払基礎日数17日未満の月が1つでもあれば随時改定を実施しない
    if (excludedMonths.length > 0) {
      const emp = employees.find((e) => e && e.id === employeeId);
      const name = emp?.name || '';
      return {
        candidate: null,
        excludedReason: {
          employeeId,
          name,
          reason: `支払基礎日数17日未満の月（${excludedMonths.join('、')}月）が含まれるため随時改定対象外`,
        },
      };
    }

    // ④ 平均計算（総支給ベース、除外月を除く）
    const validTotals: number[] = [];
    const usedMonths: number[] = [];
    for (let i = 0; i < totalValues.length && i < months.length; i++) {
      const m = months[i];
      const total = totalValues[i];
      if (!excludedMonths.includes(m) && !isNaN(total) && total > 0) {
        validTotals.push(total);
        usedMonths.push(m);
      }
    }
    if (validTotals.length === 0) {
      return { candidate: null, excludedReason: null };
    }
    const totalSum = validTotals.reduce((sum, v) => (isNaN(v) ? sum : sum + v), 0);
    const averageSalary = validTotals.length > 0 ? totalSum / validTotals.length : 0;
    if (isNaN(averageSalary) || averageSalary < 0) {
      return { candidate: null, excludedReason: null };
    }

    // ⑤ 現行等級と新等級の比較
    const currentResult = currentResults[employeeId];
    const currentGrade = (currentResult && !isNaN(currentResult.grade)) ? currentResult.grade : 0;

    const newGradeResult = this.gradeDeterminationService.findGrade(
      gradeTable,
      averageSalary
    );
    if (!newGradeResult || isNaN(newGradeResult.grade)) {
      return { candidate: null, excludedReason: null };
    }

    const newGrade = newGradeResult.grade;
    if (isNaN(newGrade) || isNaN(currentGrade)) {
      return { candidate: null, excludedReason: null };
    }
    const gradeDiff = Math.abs(newGrade - currentGrade);

    // 2等級以上なら随時改定候補とする
    if (gradeDiff >= 2) {
      const emp = employees.find((e) => e && e.id === employeeId);
      const name = emp?.name || '';

      // 適用開始月＝変動月 + 3ヶ月（変動月が1か月目として4か月目が適用開始）
      let applyMonth = changedMonth + 3;
      if (applyMonth > 12) {
        applyMonth = applyMonth - 12;
      }
      if (applyMonth < 1 || applyMonth > 12) {
        return { candidate: null, excludedReason: null };
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
