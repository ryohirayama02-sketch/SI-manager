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
    private suijiCalculationCoreService: SuijiCalculationCoreService
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
    const fixedValues = this.suijiCalculationCoreService.getFixed3Months(
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
    const excludedMonths = this.suijiCalculationCoreService.getExcludedMonthsForSuiji(
      employeeId,
      months,
      salaries
    );

    // ④ 平均計算（特例対応）
    const avgFixed = this.suijiCalculationCoreService.calculateAverageForSuiji(
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



