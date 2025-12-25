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
    if (!employeeId) {
      throw new Error('従業員IDが指定されていません');
    }
    if (isNaN(month) || month < 1 || month > 12) {
      throw new Error(`無効な月が指定されました: ${month}`);
    }
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
    if (!employeeId) {
      return [];
    }
    if (!salaries || typeof salaries !== 'object') {
      return [];
    }
    const changeMonths: number[] = [];
    let prevFixed = 0; // 基準固定費（支払基礎日数17日未満の月はスキップして維持）

    // 1月から12月まで順にチェック
    for (let month = 1; month <= 12; month++) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const currentFixed =
        this.salaryAggregationService.getFixedSalaryPublic(salaryData); // fixedSalary を優先
      const workingDays = salaryData?.workingDays;

      // 支払基礎日数が17日未満の月は固定費のチェックをスキップ（基準固定費は維持）
      if (workingDays !== undefined && !isNaN(workingDays) && workingDays < 17) {
        // この月はスキップ。prevFixedは維持されたまま次の月へ
        continue;
      }

      // 前月と比較して変動があったか判定
      if (month > 1 && !isNaN(prevFixed) && prevFixed > 0 && !isNaN(currentFixed) && currentFixed !== prevFixed) {
        changeMonths.push(month);
      }

      // 初月または前月のfixedが0の場合は、現在のfixedを記録
      if (month === 1 || prevFixed === 0) {
        prevFixed = isNaN(currentFixed) ? 0 : currentFixed;
      } else {
        prevFixed = isNaN(currentFixed) ? prevFixed : currentFixed;
      }
    }

    return changeMonths;
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
    if (!employeeId) {
      return null;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return null;
    }
    if (!salaries || typeof salaries !== 'object') {
      return null;
    }
    if (!gradeTable || !Array.isArray(gradeTable)) {
      return null;
    }
    if (!employees || !Array.isArray(employees)) {
      return null;
    }
    if (!year) {
      return null;
    }
    if (!currentResults || typeof currentResults !== 'object') {
      return null;
    }
    const reasons: string[] = [];

    // 前月の固定的賃金を取得（支払基礎日数17日未満の月はスキップして、その前の有効な月を基準にする）
    const prevMonth = month > 1 ? month - 1 : null;
    let prevFixed = 0;
    if (prevMonth) {
      // 前月から遡って、支払基礎日数17日以上の月の固定費を基準にする
      for (let checkMonth = prevMonth; checkMonth >= 1; checkMonth--) {
        const checkKey = this.getSalaryKey(employeeId, checkMonth);
        const checkSalaryData = salaries[checkKey];
        const checkWorkingDays = checkSalaryData?.workingDays;
        
        // 支払基礎日数が17日未満の月はスキップ
        if (checkWorkingDays !== undefined && !isNaN(checkWorkingDays) && checkWorkingDays < 17) {
          continue;
        }
        
        // 有効な月の固定費を基準にする
        prevFixed =
          this.salaryAggregationService.getFixedSalaryPublic(checkSalaryData); // fixedSalary を優先
        if (isNaN(prevFixed)) {
          prevFixed = 0;
        }
        break;
      }
    }

    // 当月の固定的賃金を取得
    const currentKey = this.getSalaryKey(employeeId, month);
    const currentSalaryData = salaries[currentKey];
    const currentFixed =
      this.salaryAggregationService.getFixedSalaryPublic(currentSalaryData); // fixedSalary を優先
    const currentWorkingDays = currentSalaryData?.workingDays;

    // 当月の支払基礎日数が17日未満の場合はスキップ
    if (currentWorkingDays !== undefined && !isNaN(currentWorkingDays) && currentWorkingDays < 17) {
      return null;
    }
    
    if (isNaN(currentFixed)) {
      return null;
    }

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
      if (!isNaN(total)) {
        totalSalaryValues.push(total);
      } else {
        totalSalaryValues.push(0);
      }
      const workingDays = salaryData?.workingDays;
      workingDaysList.push((workingDays !== undefined && !isNaN(workingDays)) ? workingDays : 0);
    }

    // 支払基礎日数17日未満（0日を含む）が1つでもあれば随時改定無効
    const invalidByWorkingDays = workingDaysList.some(
      (wd) => !isNaN(wd) && wd < 17
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
    const total = totalSalaryValues.reduce((sum, v) => (isNaN(v) ? sum : sum + v), 0);
    // 円未満は切り捨て
    const averageSalary = totalSalaryValues.length > 0 ? Math.floor(total / totalSalaryValues.length) : 0;
    if (isNaN(averageSalary) || averageSalary < 0) {
      reasons.push('平均報酬の計算に失敗しました');
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
    reasons.push(
      `${targetMonths.join(
        '・'
      )}月の平均報酬: ${averageSalary.toLocaleString()}円`
    );

    // 現行等級を取得
    const currentResult = currentResults[employeeId];
    const currentGrade = (currentResult && !isNaN(currentResult.grade)) ? currentResult.grade : 0;

    // 新等級を判定
    const gradeResult = this.gradeDeterminationService.findGrade(
      gradeTable,
      averageSalary
    );
    if (!gradeResult || isNaN(gradeResult.grade)) {
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
    if (isNaN(newGrade) || isNaN(currentGrade)) {
      reasons.push('等級の計算に失敗しました');
      return {
        employeeId,
        changeMonth: month,
        averageSalary,
        currentGrade: 0,
        newGrade: 0,
        diff: 0,
        applyStartMonth: 0,
        reasons,
        isEligible: false,
      };
    }
    const diff = Math.abs(newGrade - currentGrade);

    // 2等級以上の差がある場合のみ、例外条件をチェック
    if (diff >= 2) {
      // 現行標準報酬月額を取得
      const currentStandardRow = gradeTable.find(
        (r: any) => r.rank === currentGrade
      );
      const currentStandard = currentStandardRow?.standard || 0;
      
      // 新標準報酬月額を取得
      const newStandard = gradeResult.remuneration || 0;
      
      // 固定的賃金の変動方向を判定
      const fixedSalaryDirection = currentFixed > prevFixed ? 'up' : currentFixed < prevFixed ? 'down' : 'same';
      
      // 標準報酬月額の変動方向を判定
      const standardDirection = newStandard > currentStandard ? 'up' : newStandard < currentStandard ? 'down' : 'same';
      
      // 方向が逆の場合、随時改定を不成立にする
      if (
        fixedSalaryDirection !== 'same' &&
        standardDirection !== 'same' &&
        fixedSalaryDirection !== standardDirection &&
        currentStandard > 0 &&
        newStandard > 0 &&
        prevFixed > 0
      ) {
        reasons.push(
          `固定的賃金は${fixedSalaryDirection === 'up' ? '上がった' : '下がった'}が、標準報酬月額は${standardDirection === 'up' ? '上がった' : '下がった'}ため、随時改定対象外`
        );
        return {
          employeeId,
          changeMonth: month,
          averageSalary,
          currentGrade,
          newGrade,
          diff,
          applyStartMonth: 0,
          reasons,
          isEligible: false, // 不成立にする
        };
      }
    }

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
