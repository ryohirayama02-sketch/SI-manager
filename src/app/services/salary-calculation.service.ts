import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

export interface SalaryData {
  total: number;
  fixed: number;
  variable: number;
}

export interface TeijiKetteiResult {
  average46: number;
  excludedMonths: number[];
  grade: number;
  standardMonthlyRemuneration: number;
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
  getAprilToJuneValues(employeeId: string, salaries: { [key: string]: SalaryData }): number[] {
    const values: number[] = [];
    for (const month of [4, 5, 6]) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const value = salaryData?.total || 0;
      values.push(value);
    }
    return values;
  }

  getExcludedMonths(employeeId: string, values: number[], salaries: { [key: string]: SalaryData }): number[] {
    const excluded: number[] = [];
    
    // 4月は前月（3月）と比較
    if (values[0] > 0) {
      const key3 = this.getSalaryKey(employeeId, 3);
      const salaryData3 = salaries[key3];
      const prevValue = salaryData3?.total || 0;
      if (prevValue > 0 && values[0] < prevValue * 0.8) {
        excluded.push(4);
      }
    }
    
    // 5月は4月と比較
    if (values[1] > 0 && values[0] > 0 && values[1] < values[0] * 0.8) {
      excluded.push(5);
    }
    
    // 6月は5月と比較
    if (values[2] > 0 && values[1] > 0 && values[2] < values[1] * 0.8) {
      excluded.push(6);
    }
    
    return excluded;
  }

  calculateAverage(values: number[], excludedMonths: number[]): number {
    const months = [4, 5, 6];
    const validValues: number[] = [];
    
    for (let i = 0; i < values.length; i++) {
      const month = months[i];
      if (!excludedMonths.includes(month) && values[i] > 0) {
        validValues.push(values[i]);
      }
    }
    
    if (validValues.length === 0) return 0;
    
    const total = validValues.reduce((sum, v) => sum + v, 0);
    return Math.round(total / validValues.length);
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
    gradeTable: any[]
  ): TeijiKetteiResult {
    const values = this.getAprilToJuneValues(employeeId, salaries);
    const excludedMonths = this.getExcludedMonths(employeeId, values, salaries);
    const average46 = this.calculateAverage(values, excludedMonths);
    const gradeResult = this.findGrade(gradeTable, average46);
    
    if (gradeResult) {
      return {
        average46,
        excludedMonths,
        grade: gradeResult.grade,
        standardMonthlyRemuneration: gradeResult.remuneration
      };
    } else {
      return {
        average46,
        excludedMonths,
        grade: 0,
        standardMonthlyRemuneration: 0
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
}

