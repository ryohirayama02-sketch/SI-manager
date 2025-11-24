import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { MonthlySalaryService } from './monthly-salary.service';

export interface SalaryData {
  total: number;
  fixed: number;
  variable: number;
}

export interface TeijiKetteiResult {
  averageSalary: number;        // 算定に使った平均報酬
  excludedMonths: number[];      // 算定除外された月（4,5,6）
  usedMonths: number[];         // 実際に使用した月
  grade: number;
  standardMonthlyRemuneration: number;
  reasons: string[];            // 除外理由や特例判断メッセージ
  // 後方互換性のため残す
  average46?: number;           // deprecated: averageSalary を使用
}

export interface SuijiCandidate {
  employeeId: string;
  name: string;
  changedMonth: number;
  avgFixed: number;
  currentGrade: number;
  newGrade: number;
  gradeDiff: number;
  applyMonth: number;
  excludedMonths: number[];
  fixedValues: number[];
}

export interface RehabSuijiCandidate {
  employeeId: string;
  name: string;
  changedMonth: number;
  fixedValues: number[];
  avgFixed: number;
  currentGrade: number;
  newGrade: number;
  gradeDiff: number;
  applyMonth: number;
}

export interface ExcludedSuijiReason {
  employeeId: string;
  name: string;
  reason: string;
}

export interface FixedSalaryChangeSuijiResult {
  changeMonth: number;           // 変動月
  averageSalary: number;          // 平均報酬
  currentGrade: number;           // 現行等級
  newGrade: number;               // 新等級
  diff: number;                    // 等級差
  willApply: boolean;              // 随時改定成立か
  applyMonth: number | null;       // 適用開始月
  reasons: string[];              // 判定理由
}

export interface MonthlyPremiums {
  health_employee: number;
  health_employer: number;
  care_employee: number;
  care_employer: number;
  pension_employee: number;
  pension_employer: number;
}

@Injectable({ providedIn: 'root' })
export class SalaryCalculationService {
  constructor(private monthlySalaryService: MonthlySalaryService) {}
  
  // 協会けんぽ（一般）標準報酬月額テーブル（簡略化版）
  private readonly STANDARD_TABLE = [
    { rank: 1,  lower: 58000,  upper: 63000,  standard: 58000 },
    { rank: 2,  lower: 63000,  upper: 68000,  standard: 63000 },
    { rank: 3,  lower: 68000,  upper: 73000,  standard: 68000 },
    { rank: 4,  lower: 73000,  upper: 79000,  standard: 73000 },
    { rank: 5,  lower: 79000,  upper: 85000,  standard: 79000 },
    { rank: 6,  lower: 85000,  upper: 91000,  standard: 85000 },
    { rank: 7,  lower: 91000,  upper: 97000,  standard: 91000 },
    { rank: 8,  lower: 97000,  upper: 103000, standard: 97000 },
    { rank: 9,  lower: 103000, upper: 109000, standard: 103000 },
    { rank: 10, lower: 109000, upper: 115000, standard: 109000 },
    { rank: 11, lower: 115000, upper: 122000, standard: 115000 },
    { rank: 12, lower: 122000, upper: 129000, standard: 122000 },
    { rank: 13, lower: 129000, upper: 137000, standard: 129000 },
  ];

  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  calculateAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  // 定時決定ロジック
  getAprilToJuneValues(employeeId: string, salaries: { [key: string]: SalaryData }): { total: number; fixed: number; variable: number }[] {
    const values: { total: number; fixed: number; variable: number }[] = [];
    for (const month of [4, 5, 6]) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const fixed = salaryData?.fixed || 0;
      const variable = salaryData?.variable || 0;
      const total = fixed + variable; // fixed + nonFixed を合算
      values.push({ total, fixed, variable });
    }
    return values;
  }

  getExcludedMonths(
    employeeId: string,
    values: { total: number; fixed: number; variable: number }[],
    salaries: { [key: string]: SalaryData }
  ): { excluded: number[]; reasons: string[] } {
    const excluded: number[] = [];
    const reasons: string[] = [];
    
    // 4月は前月（3月）と比較
    if (values[0].total > 0) {
      const key3 = this.getSalaryKey(employeeId, 3);
      const salaryData3 = salaries[key3];
      const prevFixed = salaryData3?.fixed || 0;
      const prevVariable = salaryData3?.variable || 0;
      const prevTotal = prevFixed + prevVariable; // fixed + nonFixed を合算
      
      if (prevTotal > 0 && values[0].total < prevTotal * 0.8) {
        excluded.push(4);
        const decreaseRate = ((prevTotal - values[0].total) / prevTotal * 100).toFixed(1);
        reasons.push(`4月: 前月比${decreaseRate}%減少（20%以上）のため算定除外`);
      }
    }
    
    // 5月は4月と比較
    if (values[1].total > 0 && values[0].total > 0) {
      if (values[1].total < values[0].total * 0.8) {
        excluded.push(5);
        const decreaseRate = ((values[0].total - values[1].total) / values[0].total * 100).toFixed(1);
        reasons.push(`5月: 前月比${decreaseRate}%減少（20%以上）のため算定除外`);
      }
    }
    
    // 6月は5月と比較
    if (values[2].total > 0 && values[1].total > 0) {
      if (values[2].total < values[1].total * 0.8) {
        excluded.push(6);
        const decreaseRate = ((values[1].total - values[2].total) / values[1].total * 100).toFixed(1);
        reasons.push(`6月: 前月比${decreaseRate}%減少（20%以上）のため算定除外`);
      }
    }
    
    return { excluded, reasons };
  }

  calculateAverage(
    values: { total: number; fixed: number; variable: number }[],
    excludedMonths: number[]
  ): { averageSalary: number; usedMonths: number[]; reasons: string[] } {
    const months = [4, 5, 6];
    const validValues: number[] = [];
    const usedMonths: number[] = [];
    const reasons: string[] = [];
    
    for (let i = 0; i < values.length; i++) {
      const month = months[i];
      if (!excludedMonths.includes(month) && values[i].total > 0) {
        validValues.push(values[i].total);
        usedMonths.push(month);
      }
    }
    
    // 全部除外の場合の特例処理
    if (validValues.length === 0) {
      reasons.push('4〜6月すべてが算定除外のため、平均算定不可');
      return { averageSalary: 0, usedMonths: [], reasons };
    }
    
    // 除外なし → 3ヶ月平均
    if (validValues.length === 3) {
      const total = validValues.reduce((sum, v) => sum + v, 0);
      const average = Math.round(total / validValues.length);
      reasons.push('4〜6月の3ヶ月平均で算定');
      return { averageSalary: average, usedMonths, reasons };
    }
    
    // 除外1ヶ月 → 残り2ヶ月平均
    if (validValues.length === 2) {
      const total = validValues.reduce((sum, v) => sum + v, 0);
      const average = Math.round(total / validValues.length);
      reasons.push(`${usedMonths.join('・')}月の2ヶ月平均で算定`);
      return { averageSalary: average, usedMonths, reasons };
    }
    
    // 除外2ヶ月 → 残り1ヶ月のみで決定
    if (validValues.length === 1) {
      reasons.push(`${usedMonths[0]}月のみで算定（特例）`);
      return { averageSalary: validValues[0], usedMonths, reasons };
    }
    
    // フォールバック（通常は到達しない）
    const total = validValues.reduce((sum, v) => sum + v, 0);
    const average = Math.round(total / validValues.length);
    return { averageSalary: average, usedMonths, reasons };
  }

  findGrade(gradeTable: any[], average: number): { grade: number; remuneration: number } | null {
    if (gradeTable.length === 0) {
      // Firestoreから読み込めない場合はハードコードされたテーブルを使用
      const row = this.STANDARD_TABLE.find(
        r => average >= r.lower && average < r.upper
      );
      return row ? { grade: row.rank, remuneration: row.standard } : null;
    }
    
    // Firestoreから読み込んだテーブルを使用
    const row = gradeTable.find(
      (r: any) => average >= r.lower && average < r.upper
    );
    return row ? { grade: row.rank, remuneration: row.standard } : null;
  }

  calculateTeijiKettei(
    employeeId: string,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    currentStandardMonthlyRemuneration?: number
  ): TeijiKetteiResult {
    const values = this.getAprilToJuneValues(employeeId, salaries);
    const exclusionResult = this.getExcludedMonths(employeeId, values, salaries);
    const excludedMonths = exclusionResult.excluded;
    const exclusionReasons = exclusionResult.reasons;
    
    const averageResult = this.calculateAverage(values, excludedMonths);
    const averageSalary = averageResult.averageSalary;
    const usedMonths = averageResult.usedMonths;
    const calculationReasons = averageResult.reasons;
    
    // 全部除外の場合の特例処理
    if (averageSalary === 0 && excludedMonths.length === 3) {
      const allReasons = [...exclusionReasons, ...calculationReasons];
      if (currentStandardMonthlyRemuneration && currentStandardMonthlyRemuneration > 0) {
        allReasons.push(`現在の標準報酬月額（${currentStandardMonthlyRemuneration.toLocaleString()}円）を維持`);
        return {
          averageSalary: 0,
          excludedMonths,
          usedMonths: [],
          grade: 0,
          standardMonthlyRemuneration: currentStandardMonthlyRemuneration,
          reasons: allReasons,
          average46: 0 // 後方互換性
        };
      } else {
        allReasons.push('未決定扱い（現在の標準報酬月額が設定されていない）');
        return {
          averageSalary: 0,
          excludedMonths,
          usedMonths: [],
          grade: 0,
          standardMonthlyRemuneration: 0,
          reasons: allReasons,
          average46: 0 // 後方互換性
        };
      }
    }
    
    // 通常の等級判定
    const gradeResult = this.findGrade(gradeTable, averageSalary);
    const allReasons = [...exclusionReasons, ...calculationReasons];
    
    if (gradeResult) {
      return {
        averageSalary,
        excludedMonths,
        usedMonths,
        grade: gradeResult.grade,
        standardMonthlyRemuneration: gradeResult.remuneration,
        reasons: allReasons,
        average46: averageSalary // 後方互換性
      };
    } else {
      allReasons.push('標準報酬月額テーブルに該当する等級が見つかりません');
      return {
        averageSalary,
        excludedMonths,
        usedMonths,
        grade: 0,
        standardMonthlyRemuneration: 0,
        reasons: allReasons,
        average46: averageSalary // 後方互換性
      };
    }
  }

  // 随時改定ロジック
  getFixed3Months(employeeId: string, changedMonth: number, salaries: { [key: string]: SalaryData }): number[] {
    const values: number[] = [];
    // changedMonthを含む3ヶ月を取得
    for (let i = 0; i < 3; i++) {
      const month = changedMonth + i;
      if (month > 12) break;
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const value = salaryData?.fixed || 0;
      values.push(value);
    }
    return values;
  }

  getExcludedMonthsForSuiji(employeeId: string, months: number[], salaries: { [key: string]: SalaryData }): number[] {
    const excluded: number[] = [];
    
    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const fixed = salaryData?.fixed || 0;
      const total = salaryData?.total || 0;
      
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
        const prevFixed = prevSalaryData?.fixed || 0;
        
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

  calculateAverageForSuiji(fixedValues: number[], excludedMonths: number[], months: number[]): number | null {
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
      const currentFixed = salaryData?.fixed || 0;
      
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
        reasons.push(`${changeMonth}月の変動では、3ヶ月分のデータが揃わない（${month}月が存在しない）`);
        return {
          changeMonth,
          averageSalary: 0,
          currentGrade,
          newGrade: 0,
          diff: 0,
          willApply: false,
          applyMonth: null,
          reasons
        };
      }
      targetMonths.push(month);
    }
    
    // 3ヶ月分の給与データを取得（fixed + variable の総額）
    const salaryValues: number[] = [];
    for (const month of targetMonths) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const fixed = salaryData?.fixed || 0;
      const variable = salaryData?.variable || 0;
      const total = fixed + variable; // fixed + variable の総額
      salaryValues.push(total);
    }
    
    // 3ヶ月揃わない場合は算定不可
    if (salaryValues.length !== 3) {
      reasons.push(`${changeMonth}月の変動では、3ヶ月分のデータが揃わない`);
      return {
        changeMonth,
        averageSalary: 0,
        currentGrade,
        newGrade: 0,
        diff: 0,
        willApply: false,
        applyMonth: null,
        reasons
      };
    }
    
    // 平均報酬を計算
    const total = salaryValues.reduce((sum, v) => sum + v, 0);
    const averageSalary = Math.round(total / salaryValues.length);
    reasons.push(`${targetMonths.join('・')}月の平均報酬: ${averageSalary.toLocaleString()}円`);
    
    // 新等級を判定
    const gradeResult = this.findGrade(gradeTable, averageSalary);
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
        reasons
      };
    }
    
    const newGrade = gradeResult.grade;
    const diff = Math.abs(newGrade - currentGrade);
    
    // 2等級以上の差 → 随時改定成立
    const willApply = diff >= 2;
    if (willApply) {
      reasons.push(`現行等級${currentGrade} → 新等級${newGrade}（${diff}等級差）により随時改定成立`);
    } else {
      reasons.push(`現行等級${currentGrade} → 新等級${newGrade}（${diff}等級差）により随時改定不成立（2等級以上差が必要）`);
    }
    
    // 適用開始月は「変動月の4ヶ月後」
    let applyMonth: number | null = null;
    if (willApply) {
      applyMonth = changeMonth + 4;
      if (applyMonth > 12) {
        applyMonth = applyMonth - 12;
      }
      reasons.push(`適用開始月: ${applyMonth}月（変動月${changeMonth}月の4ヶ月後）`);
    }
    
    return {
      changeMonth,
      averageSalary,
      currentGrade,
      newGrade,
      diff,
      willApply,
      applyMonth,
      reasons
    };
  }

  isWithin3MonthsAfterJoin(employeeId: string, changedMonth: number, employees: Employee[], year: string): boolean {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp || !emp.joinDate) return false;
    
    const joinDate = new Date(emp.joinDate);
    const joinYear = joinDate.getFullYear();
    const joinMonth = joinDate.getMonth() + 1;
    
    // 変動月が入社年と同じ場合のみ判定
    if (parseInt(year) === joinYear) {
      const monthsDiff = changedMonth - joinMonth;
      return monthsDiff >= 1 && monthsDiff <= 3;
    }
    
    return false;
  }

  calculateSuijiKettei(
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
    // ⑥ 入社後3ヶ月以内rule
    if (this.isWithin3MonthsAfterJoin(employeeId, changedMonth, employees, year)) {
      const emp = employees.find(e => e.id === employeeId);
      const name = emp?.name || '';
      return {
        candidate: null,
        excludedReason: {
          employeeId,
          name,
          reason: '資格取得後3か月以内'
        }
      };
    }
    
    // ② 変動月を含む3ヶ月のfixedを取得
    const fixedValues = this.getFixed3Months(employeeId, changedMonth, salaries);
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
    const excludedMonths = this.getExcludedMonthsForSuiji(employeeId, months, salaries);
    
    // ④ 平均計算（特例対応）
    const avgFixed = this.calculateAverageForSuiji(fixedValues, excludedMonths, months);
    if (avgFixed === null || avgFixed === 0) {
      return { candidate: null, excludedReason: null };
    }
    
    // ⑤ 現行等級と新等級の比較
    const currentResult = currentResults[employeeId];
    const currentGrade = currentResult?.grade || 0;
    
    const newGradeResult = this.findGrade(gradeTable, avgFixed);
    if (!newGradeResult) {
      return { candidate: null, excludedReason: null };
    }
    
    const newGrade = newGradeResult.grade;
    const gradeDiff = Math.abs(newGrade - currentGrade);
    
    // 2等級以上なら随時改定候補とする
    if (gradeDiff >= 2) {
      const emp = employees.find(e => e.id === employeeId);
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
          fixedValues
        },
        excludedReason: null
      };
    }
    
    return { candidate: null, excludedReason: null };
  }

  checkRehabSuiji(
    employeeId: string,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    employees: Employee[],
    year: string,
    currentResults: { [employeeId: string]: TeijiKetteiResult }
  ): RehabSuijiCandidate[] {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp || !emp.returnFromLeaveDate) return [];
    
    const returnDate = new Date(emp.returnFromLeaveDate);
    const returnYear = returnDate.getFullYear();
    const returnMonth = returnDate.getMonth() + 1;
    
    // 復職年が現在の年と異なる場合はスキップ
    if (parseInt(year) !== returnYear) return [];
    
    const candidates: RehabSuijiCandidate[] = [];
    
    // 復職月・翌月・翌々月を監視対象とする
    const targetMonths = [returnMonth, returnMonth + 1, returnMonth + 2].filter(m => m <= 12);
    
    for (const month of targetMonths) {
      // 変動月を含む3ヶ月のfixedを取得
      const fixedValues = this.getFixed3Months(employeeId, month, salaries);
      if (fixedValues.length < 3) continue;
      
      // 3ヶ月平均を計算
      const total = fixedValues.reduce((sum, v) => sum + v, 0);
      const avgFixed = Math.round(total / 3);
      if (avgFixed === 0) continue;
      
      // 現行等級と新等級の比較
      const currentResult = currentResults[employeeId];
      const currentGrade = currentResult?.grade || 0;
      
      const newGradeResult = this.findGrade(gradeTable, avgFixed);
      if (!newGradeResult) continue;
      
      const newGrade = newGradeResult.grade;
      const gradeDiff = Math.abs(newGrade - currentGrade);
      
      // 2等級以上なら復職関連の随時改定候補に追加
      if (gradeDiff >= 2) {
        const name = emp.name || '';
        
        // 適用開始月＝変動月 + 4ヶ月
        let applyMonth = month + 4;
        if (applyMonth > 12) {
          applyMonth = applyMonth - 12;
        }
        
        candidates.push({
          employeeId,
          name,
          changedMonth: month,
          fixedValues,
          avgFixed,
          currentGrade,
          newGrade,
          gradeDiff,
          applyMonth
        });
      }
    }
    
    return candidates;
  }

  calculateMonthlyPremiums(
    employee: Employee,
    standardMonthlyRemuneration: number | null,
    rates: any
  ): MonthlyPremiums | null {
    if (!rates || standardMonthlyRemuneration === null) return null;

    const age = this.calculateAge(employee.birthDate);
    const r = rates;

    const health_employee = r.health_employee;
    const health_employer = r.health_employer;

    const care_employee = age >= 40 && age <= 64 ? r.care_employee : 0;
    const care_employer = age >= 40 && age <= 64 ? r.care_employer : 0;

    // 厚生年金は全国共通（都道府県に依存しない）
    const pension_employee = r.pension_employee;
    const pension_employer = r.pension_employer;

    return {
      health_employee: Math.floor(standardMonthlyRemuneration * health_employee),
      health_employer: Math.floor(standardMonthlyRemuneration * health_employer),
      care_employee: Math.floor(standardMonthlyRemuneration * care_employee),
      care_employer: Math.floor(standardMonthlyRemuneration * care_employer),
      pension_employee: Math.floor(standardMonthlyRemuneration * pension_employee),
      pension_employer: Math.floor(standardMonthlyRemuneration * pension_employer),
    };
  }

  getRehabHighlightMonths(employee: Employee, year: string): number[] {
    if (!employee.returnFromLeaveDate) return [];
    
    const returnDate = new Date(employee.returnFromLeaveDate);
    const returnYear = returnDate.getFullYear();
    const returnMonth = returnDate.getMonth() + 1;
    
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

  /**
   * 給与扱いとなった賞与を標準報酬月額に合算する
   * @param employeeId 従業員ID
   * @param year 年
   * @param month 月（1-12）
   * @param standardBonus 標準賞与額（1000円未満切り捨て済み）
   */
  async addBonusAsSalary(
    employeeId: string,
    year: number,
    month: number,
    standardBonus: number
  ): Promise<void> {
    // Firestore の monthlySalaries/{employeeId}/years/{year} を取得
    const salaryData = await this.monthlySalaryService.getEmployeeSalary(employeeId, year);
    
    if (!salaryData) {
      // データが存在しない場合は新規作成
      const newData: any = {};
      const monthKey = month.toString();
      newData[monthKey] = {
        fixed: 0,
        variable: 0,
        total: standardBonus
      };
      await this.monthlySalaryService.saveEmployeeSalary(employeeId, year, newData);
      return;
    }
    
    // 該当月のデータを取得
    const monthKey = month.toString();
    const monthData = salaryData[monthKey] || { fixed: 0, variable: 0, total: 0 };
    
    // fixed + variable の報酬合計に standardBonus を加算
    const currentTotal = (monthData.fixed || 0) + (monthData.variable || 0);
    const newTotal = currentTotal + standardBonus;
    
    // variable に加算（給与扱いの賞与は変動給として扱う）
    const updatedMonthData = {
      fixed: monthData.fixed || 0,
      variable: (monthData.variable || 0) + standardBonus,
      total: newTotal
    };
    
    // 更新されたデータを保存
    const updatedData = {
      ...salaryData,
      [monthKey]: updatedMonthData
    };
    
    await this.monthlySalaryService.saveEmployeeSalary(employeeId, year, updatedData);
  }
}

