import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { MonthlySalaryService } from './monthly-salary.service';
import { MonthHelperService } from './month-helper.service';
import { MaternityLeaveService } from './maternity-leave.service';
import { EmployeeEligibilityService } from './employee-eligibility.service';
import { EmployeeService } from './employee.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { SettingsService } from './settings.service';
import {
  SalaryItemEntry,
  MonthlySalaryData,
} from '../models/monthly-salary.model';
import { SalaryItem } from '../models/salary-item.model';

export interface SalaryData {
  total: number;
  fixed: number;
  variable: number;
}

export interface TeijiKetteiResult {
  averageSalary: number; // 算定に使った平均報酬
  excludedMonths: number[]; // 算定除外された月（4,5,6）
  usedMonths: number[]; // 実際に使用した月
  grade: number;
  standardMonthlyRemuneration: number;
  reasons: string[]; // 除外理由や特例判断メッセージ
  // 後方互換性のため残す
  average46?: number; // deprecated: averageSalary を使用
  startApplyYearMonth?: { year: number; month: number }; // 適用開始年月（定時決定の場合、原則9月）
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
  changeMonth: number; // 変動月
  averageSalary: number; // 平均報酬
  currentGrade: number; // 現行等級
  newGrade: number; // 新等級
  diff: number; // 等級差
  willApply: boolean; // 随時改定成立か
  applyMonth: number | null; // 適用開始月
  reasons: string[]; // 判定理由
}

export interface SuijiKouhoResult {
  employeeId: string;
  changeMonth: number; // 固定給が変動した月（1〜12）
  averageSalary: number; // 3ヶ月平均
  currentGrade: number; // 現行等級
  newGrade: number; // 判定後の等級
  diff: number; // 等級差
  applyStartMonth: number; // 適用開始月（変動月の4ヶ月後）
  reasons: string[]; // 変動理由（固定給◯→◯など）
  isEligible: boolean; // 随時改定の成立可否
}

export interface ShikakuShutokuResult {
  baseSalary: number; // 資格取得時決定に使用した給与
  grade: number; // 等級
  standardMonthlyRemuneration: number; // 標準報酬月額
  usedMonth: number; // どの月の給与を使ったか（1〜12）
  reasons: string[]; // 判断根拠
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
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private monthHelper: MonthHelperService,
    private maternityLeaveService: MaternityLeaveService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private employeeService: EmployeeService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private settingsService: SettingsService
  ) {}

  // 協会けんぽ（一般）標準報酬月額テーブル（簡略化版）
  private readonly STANDARD_TABLE = [
    { rank: 1, lower: 58000, upper: 63000, standard: 58000 },
    { rank: 2, lower: 63000, upper: 68000, standard: 63000 },
    { rank: 3, lower: 68000, upper: 73000, standard: 68000 },
    { rank: 4, lower: 73000, upper: 79000, standard: 73000 },
    { rank: 5, lower: 79000, upper: 85000, standard: 79000 },
    { rank: 6, lower: 85000, upper: 91000, standard: 85000 },
    { rank: 7, lower: 91000, upper: 97000, standard: 91000 },
    { rank: 8, lower: 97000, upper: 103000, standard: 97000 },
    { rank: 9, lower: 103000, upper: 109000, standard: 103000 },
    { rank: 10, lower: 109000, upper: 115000, standard: 109000 },
    { rank: 11, lower: 115000, upper: 122000, standard: 115000 },
    { rank: 12, lower: 122000, upper: 129000, standard: 122000 },
    { rank: 13, lower: 129000, upper: 137000, standard: 129000 },
  ];

  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 給与データから固定的賃金を取得（後方互換性対応）
   */
  private getFixedSalary(salaryData: SalaryData | undefined): number {
    if (!salaryData) return 0;
    return (salaryData as any).fixedSalary ?? salaryData.fixed ?? 0;
  }

  /**
   * 給与データから非固定的賃金を取得（後方互換性対応）
   */
  private getVariableSalary(salaryData: SalaryData | undefined): number {
    if (!salaryData) return 0;
    return (salaryData as any).variableSalary ?? salaryData.variable ?? 0;
  }

  /**
   * 給与データから総支給を取得（後方互換性対応）
   */
  private getTotalSalary(salaryData: SalaryData | undefined): number {
    if (!salaryData) return 0;
    const fixed = this.getFixedSalary(salaryData);
    const variable = this.getVariableSalary(salaryData);
    return (
      (salaryData as any).totalSalary ?? salaryData.total ?? fixed + variable
    );
  }

  calculateAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }

  // 定時決定ロジック
  getAprilToJuneValues(
    employeeId: string,
    salaries: { [key: string]: SalaryData }
  ): { total: number; fixed: number; variable: number }[] {
    const values: { total: number; fixed: number; variable: number }[] = [];
    for (const month of [4, 5, 6]) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const fixed = this.getFixedSalary(salaryData);
      const variable = this.getVariableSalary(salaryData);
      const total = this.getTotalSalary(salaryData); // totalSalary を優先、なければ fixed + variable
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
      const prevFixed = this.getFixedSalary(salaryData3);
      const prevVariable = this.getVariableSalary(salaryData3);
      const prevTotal = this.getTotalSalary(salaryData3); // totalSalary を優先、なければ fixed + variable

      if (prevTotal > 0 && values[0].total < prevTotal * 0.8) {
        excluded.push(4);
        const decreaseRate = (
          ((prevTotal - values[0].total) / prevTotal) *
          100
        ).toFixed(1);
        reasons.push(
          `4月: 前月比${decreaseRate}%減少（20%以上）のため算定除外`
        );
      }
    }

    // 5月は4月と比較
    if (values[1].total > 0 && values[0].total > 0) {
      if (values[1].total < values[0].total * 0.8) {
        excluded.push(5);
        const decreaseRate = (
          ((values[0].total - values[1].total) / values[0].total) *
          100
        ).toFixed(1);
        reasons.push(
          `5月: 前月比${decreaseRate}%減少（20%以上）のため算定除外`
        );
      }
    }

    // 6月は5月と比較
    if (values[2].total > 0 && values[1].total > 0) {
      if (values[2].total < values[1].total * 0.8) {
        excluded.push(6);
        const decreaseRate = (
          ((values[1].total - values[2].total) / values[1].total) *
          100
        ).toFixed(1);
        reasons.push(
          `6月: 前月比${decreaseRate}%減少（20%以上）のため算定除外`
        );
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

  findGrade(
    gradeTable: any[],
    average: number
  ): { grade: number; remuneration: number } | null {
    if (gradeTable.length === 0) {
      // Firestoreから読み込めない場合はハードコードされたテーブルを使用
      const row = this.STANDARD_TABLE.find(
        (r) => average >= r.lower && average < r.upper
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
    year: number,
    currentStandardMonthlyRemuneration?: number
  ): TeijiKetteiResult {
    const values = this.getAprilToJuneValues(employeeId, salaries);
    const exclusionResult = this.getExcludedMonths(
      employeeId,
      values,
      salaries
    );
    const excludedMonths = exclusionResult.excluded;
    const exclusionReasons = exclusionResult.reasons;

    const averageResult = this.calculateAverage(values, excludedMonths);
    // 標準報酬月額の四捨五入処理（1000円未満四捨五入）
    const averageSalary = Math.round(averageResult.averageSalary / 1000) * 1000;
    const usedMonths = averageResult.usedMonths;
    const calculationReasons = averageResult.reasons;

    // 全部除外の場合の特例処理
    if (averageSalary === 0 && excludedMonths.length === 3) {
      const allReasons = [...exclusionReasons, ...calculationReasons];
      // 定時決定の適用開始月（原則9月支給分から適用）
      const startApplyYearMonth = { year, month: 9 };
      if (
        currentStandardMonthlyRemuneration &&
        currentStandardMonthlyRemuneration > 0
      ) {
        allReasons.push(
          `現在の標準報酬月額（${currentStandardMonthlyRemuneration.toLocaleString()}円）を維持`
        );
        return {
          averageSalary: 0,
          excludedMonths,
          usedMonths: [],
          grade: 0,
          standardMonthlyRemuneration: currentStandardMonthlyRemuneration,
          reasons: allReasons,
          average46: 0, // 後方互換性
          startApplyYearMonth,
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
          average46: 0, // 後方互換性
          startApplyYearMonth,
        };
      }
    }

    // 通常の等級判定
    const gradeResult = this.findGrade(gradeTable, averageSalary);
    const allReasons = [...exclusionReasons, ...calculationReasons];

    // 定時決定の適用開始月（原則9月支給分から適用）
    const startApplyYearMonth = { year, month: 9 };

    if (gradeResult) {
      return {
        averageSalary,
        excludedMonths,
        usedMonths,
        grade: gradeResult.grade,
        standardMonthlyRemuneration: gradeResult.remuneration,
        reasons: allReasons,
        average46: averageSalary, // 後方互換性
        startApplyYearMonth,
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
        average46: averageSalary, // 後方互換性
        startApplyYearMonth,
      };
    }
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
      const value = this.getFixedSalary(salaryData); // fixedSalary を優先
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
      const fixed = this.getFixedSalary(salaryData); // fixedSalary を優先
      const total = this.getTotalSalary(salaryData); // totalSalary を優先

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
        const prevFixed = this.getFixedSalary(prevSalaryData); // fixedSalary を優先

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
      const currentFixed = this.getFixedSalary(salaryData); // fixedSalary を優先

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
      const total = this.getTotalSalary(salaryData); // totalSalary を優先（fixed + variable の総額）
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

    const newGradeResult = this.findGrade(gradeTable, avgFixed);
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
      prevFixed = this.getFixedSalary(prevSalaryData); // fixedSalary を優先
    }

    // 当月の固定的賃金を取得
    const currentKey = this.getSalaryKey(employeeId, month);
    const currentSalaryData = salaries[currentKey];
    const currentFixed = this.getFixedSalary(currentSalaryData); // fixedSalary を優先

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
      const total = this.getTotalSalary(salaryData); // totalSalary を優先（fixed + variable の総支給）
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
    const gradeResult = this.findGrade(gradeTable, averageSalary);
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

  /**
   * 月次給与の保険料を計算（産休・育休免除・年齢到達・標準報酬月額を統合）
   * @param employee 従業員情報
   * @param year 年
   * @param month 月（1〜12）
   * @param fixedSalary 固定的賃金
   * @param variableSalary 非固定的賃金
   * @param gradeTable 標準報酬月額テーブル
   * @returns 月次保険料
   */
  async calculateMonthlyPremiums(
    employee: Employee,
    year: number,
    month: number,
    fixedSalary: number,
    variableSalary: number,
    gradeTable: any[]
  ): Promise<MonthlyPremiums & { reasons: string[] }> {
    const reasons: string[] = [];

    // ① 月末在籍の健保判定（最優先）
    const isLastDayEligible = this.employeeLifecycleService.isLastDayEligible(
      employee,
      year,
      month
    );

    if (!isLastDayEligible) {
      // 月末在籍がない場合、健康保険・介護保険の保険料は0円
      reasons.push(
        `${month}月は退職月で月末在籍がないため、健康保険・介護保険の保険料は0円です`
      );
      // 厚生年金は月単位加入のため、退職月でも月末在籍がなくても発生する可能性があるが、
      // ここでは健康保険・介護保険のみ0円とする
      // 厚生年金の処理は後続のロジックで処理される
    }

    // ② 産休・育休免除判定
    const exemptResult = this.maternityLeaveService.isExemptForSalary(
      year,
      month,
      employee
    );

    if (exemptResult.exempt) {
      // 産休・育休中は本人分・事業主負担ともに0円
      reasons.push(exemptResult.reason);
      return {
        health_employee: 0,
        health_employer: 0,
        care_employee: 0,
        care_employer: 0,
        pension_employee: 0,
        pension_employer: 0,
        reasons,
      };
    }

    // ② 標準報酬月額の計算（fixedSalary + variableSalary）
    const totalSalary = fixedSalary + variableSalary;
    if (totalSalary <= 0) {
      reasons.push('給与が0円のため保険料は0円');
      return {
        health_employee: 0,
        health_employer: 0,
        care_employee: 0,
        care_employer: 0,
        pension_employee: 0,
        pension_employer: 0,
        reasons,
      };
    }

    // 標準報酬月額テーブルから等級を検索
    const gradeResult = this.findGrade(gradeTable, totalSalary);
    if (!gradeResult) {
      reasons.push('標準報酬月額テーブルに該当する等級が見つかりません');
      return {
        health_employee: 0,
        health_employer: 0,
        care_employee: 0,
        care_employer: 0,
        pension_employee: 0,
        pension_employer: 0,
        reasons,
      };
    }

    const standardMonthlyRemuneration = gradeResult.remuneration;
    reasons.push(
      `等級${
        gradeResult.grade
      }（標準報酬月額${standardMonthlyRemuneration.toLocaleString()}円）`
    );

    // ③ 資格取得月の判定（同月得喪）
    let isAcquisitionMonth = false;
    let isAcquisitionMonthForPension = false;
    if (employee.joinDate) {
      const joinDate = new Date(employee.joinDate);
      const joinYear = this.monthHelper.getPayYear(joinDate);
      const joinMonth = this.monthHelper.getPayMonth(joinDate);

      // 健康保険：資格取得月から保険料発生
      if (joinYear === year && joinMonth === month) {
        isAcquisitionMonth = true;
        reasons.push(
          `${month}月は資格取得月のため健康保険・介護保険の保険料が発生します`
        );
      }

      // 厚生年金：資格取得月の翌月から保険料発生
      if (joinYear === year && joinMonth === month - 1) {
        isAcquisitionMonthForPension = true;
        reasons.push(
          `${month}月は資格取得月の翌月のため厚生年金の保険料が発生します`
        );
      } else if (joinYear === year && joinMonth === month) {
        reasons.push(
          `${month}月は資格取得月のため厚生年金の保険料は発生しません（翌月から発生）`
        );
      }
    }

    // ④ 年齢到達のチェック（40/65/70/75）
    // 年齢到達月の判定：誕生日の月で判定（到達月から適用）
    const birthDate = new Date(employee.birthDate);
    const birthYear = birthDate.getFullYear();
    const birthMonth = birthDate.getMonth() + 1;

    // その月の1日時点の年齢を計算（到達月の判定用）
    const checkDate = new Date(year, month - 1, 1);
    let age = year - birthYear;
    if (
      month < birthMonth ||
      (month === birthMonth && 1 < birthDate.getDate())
    ) {
      age--;
    }

    // 年齢到達月の判定（到達月から適用）
    // 40歳到達月：介護保険料徴収開始（到達月から）
    // 65歳到達月：介護保険料徴収終了（到達月から第1号へ移行）
    // 70歳到達月：厚生年金保険料徴収停止（到達月から）
    // 75歳到達月：健康保険・介護保険料徴収停止（到達月から）
    const isAge40Reached = age >= 40;
    const isAge65Reached = age >= 65;
    const isAge70Reached = age >= 70;
    const isAge75Reached = age >= 75;

    // 到達月の判定（誕生日の月・日で判定）
    const birthDay = birthDate.getDate();
    const isAge40Month =
      (year === birthYear + 40 && month === birthMonth && 1 >= birthDay) ||
      (year === birthYear + 40 && month > birthMonth) ||
      year > birthYear + 40;
    const isAge65Month =
      (year === birthYear + 65 && month === birthMonth && 1 >= birthDay) ||
      (year === birthYear + 65 && month > birthMonth) ||
      year > birthYear + 65;
    const isAge70Month =
      (year === birthYear + 70 && month === birthMonth && 1 >= birthDay) ||
      (year === birthYear + 70 && month > birthMonth) ||
      year > birthYear + 70;
    const isAge75Month =
      (year === birthYear + 75 && month === birthMonth && 1 >= birthDay) ||
      (year === birthYear + 75 && month > birthMonth) ||
      year > birthYear + 75;

    const eligibilityResult = this.employeeEligibilityService.checkEligibility(
      employee,
      undefined,
      checkDate
    );
    const ageFlags = eligibilityResult.ageFlags;

    // 年齢到達による停止理由を追加
    if (isAge75Reached) {
      if (isAge75Month && month === birthMonth) {
        reasons.push(
          `${month}月は75歳到達月のため健康保険・介護保険は停止（到達月から適用）`
        );
      } else {
        reasons.push('75歳以上のため健康保険・介護保険は停止');
      }
    }
    if (isAge70Reached) {
      if (isAge70Month && month === birthMonth) {
        reasons.push(
          `${month}月は70歳到達月のため厚生年金は停止（到達月から適用）`
        );
      } else {
        reasons.push('70歳以上のため厚生年金は停止');
      }
    }
    if (isAge65Reached) {
      if (isAge65Month && month === birthMonth) {
        reasons.push(
          `${month}月は65歳到達月のため介護保険は第1号被保険者（健保から除外、到達月から適用）`
        );
      } else {
        reasons.push('65歳以上のため介護保険は第1号被保険者（健保から除外）');
      }
    }
    if (isAge40Reached && !isAge65Reached) {
      if (isAge40Month && month === birthMonth) {
        reasons.push(
          `${month}月は40歳到達月のため介護保険料が発生します（到達月から適用）`
        );
      }
    }

    // ⑤ 通常の保険料計算（年齢到達・同月得喪を考慮）
    const ratesResult = await this.settingsService.getRates(
      year.toString(),
      (employee as any).prefecture || '13',
      month.toString()
    );
    if (!ratesResult) {
      reasons.push('保険料率の取得に失敗しました');
      return {
        health_employee: 0,
        health_employer: 0,
        care_employee: 0,
        care_employer: 0,
        pension_employee: 0,
        pension_employer: 0,
        reasons,
      };
    }
    const r = ratesResult;

    // 健康保険（75歳以上は0円、資格取得月から発生、月末在籍が必要）
    // 資格取得月より前の場合は0円、資格取得月以降は標準報酬月額を使用
    // 月末在籍がない場合は0円
    let healthBase = 0;
    if (!isLastDayEligible) {
      // 月末在籍がない場合は0円
      healthBase = 0;
    } else if (employee.joinDate) {
      const joinDate = new Date(employee.joinDate);
      const joinYear = this.monthHelper.getPayYear(joinDate);
      const joinMonth = this.monthHelper.getPayMonth(joinDate);
      // 資格取得月以降の場合のみ標準報酬月額を使用
      if (joinYear < year || (joinYear === year && joinMonth <= month)) {
        healthBase = ageFlags.isNoHealth ? 0 : standardMonthlyRemuneration;
      }
    } else {
      // 入社日が未設定の場合は通常通り計算
      healthBase = ageFlags.isNoHealth ? 0 : standardMonthlyRemuneration;
    }
    const health_employee = Math.floor(healthBase * r.health_employee);
    const health_employer = Math.floor(healthBase * r.health_employer);

    // 介護保険（40〜64歳のみ、75歳以上は0円、資格取得月から発生、月末在籍が必要）
    const isCareEligible = ageFlags.isCare2 && !ageFlags.isNoHealth;
    let careBase = 0;
    if (!isLastDayEligible) {
      // 月末在籍がない場合は0円
      careBase = 0;
    } else if (isCareEligible) {
      if (employee.joinDate) {
        const joinDate = new Date(employee.joinDate);
        const joinYear = this.monthHelper.getPayYear(joinDate);
        const joinMonth = this.monthHelper.getPayMonth(joinDate);
        // 資格取得月以降の場合のみ標準報酬月額を使用
        if (joinYear < year || (joinYear === year && joinMonth <= month)) {
          careBase = standardMonthlyRemuneration;
        }
      } else {
        // 入社日が未設定の場合は通常通り計算
        careBase = standardMonthlyRemuneration;
      }
    }
    const care_employee = Math.floor(careBase * r.care_employee);
    const care_employer = Math.floor(careBase * r.care_employer);

    // 厚生年金（70歳以上は0円、資格取得月の翌月から発生）
    // 資格取得月の場合は0円、資格取得月の翌月以降は標準報酬月額を使用
    let pensionBase = 0;
    if (employee.joinDate) {
      const joinDate = new Date(employee.joinDate);
      const joinYear = this.monthHelper.getPayYear(joinDate);
      const joinMonth = this.monthHelper.getPayMonth(joinDate);

      // 資格取得月の場合は0円（月単位加入のため）
      if (joinYear === year && joinMonth === month) {
        pensionBase = 0;
      }
      // 資格取得月の翌月以降の場合のみ標準報酬月額を使用
      else if (joinYear < year || (joinYear === year && joinMonth < month)) {
        pensionBase = ageFlags.isNoPension ? 0 : standardMonthlyRemuneration;
      }
      // 資格取得月より前の場合は0円
      else {
        pensionBase = 0;
      }
    } else {
      // 入社日が未設定の場合は通常通り計算
      pensionBase = ageFlags.isNoPension ? 0 : standardMonthlyRemuneration;
    }
    const pension_employee = Math.floor(pensionBase * r.pension_employee);
    const pension_employer = Math.floor(pensionBase * r.pension_employer);

    return {
      health_employee,
      health_employer,
      care_employee,
      care_employer,
      pension_employee,
      pension_employer,
      reasons,
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
    const salaryData = await this.monthlySalaryService.getEmployeeSalary(
      employeeId,
      year
    );

    if (!salaryData) {
      // データが存在しない場合は新規作成
      const newData: any = {};
      const monthKey = month.toString();
      newData[monthKey] = {
        fixedSalary: 0,
        variableSalary: standardBonus,
        totalSalary: standardBonus,
        // 後方互換性のため既存属性も設定
        fixed: 0,
        variable: standardBonus,
        total: standardBonus,
      };
      await this.monthlySalaryService.saveEmployeeSalary(
        employeeId,
        year,
        newData
      );
      return;
    }

    // 該当月のデータを取得
    const monthKey = month.toString();
    const monthData = salaryData[monthKey] || {
      fixedSalary: 0,
      variableSalary: 0,
      totalSalary: 0,
    };

    // fixedSalary + variableSalary の報酬合計に standardBonus を加算
    const currentFixed = (monthData as any).fixedSalary ?? monthData.fixed ?? 0;
    const currentVariable =
      (monthData as any).variableSalary ?? monthData.variable ?? 0;
    const currentTotal = currentFixed + currentVariable;
    const newTotal = currentTotal + standardBonus;

    // variableSalary に加算（給与扱いの賞与は変動給として扱う）
    const updatedMonthData = {
      fixedSalary: currentFixed,
      variableSalary: currentVariable + standardBonus,
      totalSalary: newTotal,
      // 後方互換性のため既存属性も設定
      fixed: currentFixed,
      variable: currentVariable + standardBonus,
      total: newTotal,
    };

    // 更新されたデータを保存
    const updatedData = {
      ...salaryData,
      [monthKey]: updatedMonthData,
    };

    await this.monthlySalaryService.saveEmployeeSalary(
      employeeId,
      year,
      updatedData
    );
  }

  /**
   * 資格取得時決定（入社月の標準報酬決定）を計算する
   * @param employee 従業員情報
   * @param year 年
   * @param salaries 給与データ（{ [key: string]: SalaryData }形式）
   * @param gradeTable 標準報酬月額テーブル
   * @returns 資格取得時決定結果
   */
  async calculateShikakuShutoku(
    employee: Employee,
    year: number,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[]
  ): Promise<ShikakuShutokuResult | null> {
    const reasons: string[] = [];

    // 入社日の取得
    if (!employee.joinDate) {
      reasons.push('入社日が設定されていないため資格取得時決定不可');
      return {
        baseSalary: 0,
        grade: 0,
        standardMonthlyRemuneration: 0,
        usedMonth: 0,
        reasons,
      };
    }

    const joinDate = new Date(employee.joinDate);
    const joinYear = this.monthHelper.getPayYear(joinDate);
    const joinMonth = this.monthHelper.getPayMonth(joinDate);

    // 入社年が対象年と異なる場合はスキップ
    if (joinYear !== year) {
      reasons.push(
        `入社年（${joinYear}年）が対象年（${year}年）と異なるため資格取得時決定不可`
      );
      return null;
    }

    // 入社月に給与支給があるか確認
    const joinMonthKey = this.getSalaryKey(employee.id, joinMonth);
    const joinMonthSalary = salaries[joinMonthKey];
    const joinMonthTotal = this.getTotalSalary(joinMonthSalary);

    let usedMonth: number;
    let baseSalary: number;

    if (joinMonthTotal > 0) {
      // 入社月に給与支給がある → その給与を使用
      usedMonth = joinMonth;
      baseSalary = joinMonthTotal;
      reasons.push(
        `${joinMonth}月（入社月）の給与${baseSalary.toLocaleString()}円を使用`
      );
    } else {
      // 入社月に給与支給がない → 2ヶ月目の最初の給与を使用
      const nextMonth = joinMonth + 1;
      if (nextMonth > 12) {
        reasons.push(
          `入社月（${joinMonth}月）に給与支給がなく、翌月が存在しないため資格取得時決定不可`
        );
        return {
          baseSalary: 0,
          grade: 0,
          standardMonthlyRemuneration: 0,
          usedMonth: 0,
          reasons,
        };
      }

      const nextMonthKey = this.getSalaryKey(employee.id, nextMonth);
      const nextMonthSalary = salaries[nextMonthKey];
      const nextMonthTotal = this.getTotalSalary(nextMonthSalary);

      if (nextMonthTotal > 0) {
        usedMonth = nextMonth;
        baseSalary = nextMonthTotal;
        reasons.push(
          `入社月（${joinMonth}月）に給与支給がないため、${nextMonth}月の給与${baseSalary.toLocaleString()}円を使用`
        );
      } else {
        reasons.push(
          `入社月（${joinMonth}月）および翌月（${nextMonth}月）に給与支給がないため資格取得時決定不可`
        );
        return {
          baseSalary: 0,
          grade: 0,
          standardMonthlyRemuneration: 0,
          usedMonth: 0,
          reasons,
        };
      }
    }

    // 追加：資格取得時決定 1000円未満四捨五入
    const roundedBaseSalary = Math.round(baseSalary / 1000) * 1000;
    if (roundedBaseSalary !== baseSalary) {
      reasons.push(
        `初回給与${baseSalary.toLocaleString()}円を1000円単位に四捨五入: ${roundedBaseSalary.toLocaleString()}円`
      );
    }

    // 等級を判定（四捨五入後の金額を使用）
    const gradeResult = this.findGrade(gradeTable, roundedBaseSalary);
    if (!gradeResult) {
      reasons.push('標準報酬月額テーブルに該当する等級が見つかりません');
      return {
        baseSalary: roundedBaseSalary,
        grade: 0,
        standardMonthlyRemuneration: 0,
        usedMonth,
        reasons,
      };
    }

    reasons.push(
      `資格取得時決定により等級${
        gradeResult.grade
      }（標準報酬月額${gradeResult.remuneration.toLocaleString()}円）を決定`
    );

    // 追加：資格取得時決定 Firestoreに保存（既存値があれば上書きしない）
    if (
      employee.acquisitionGrade === undefined ||
      employee.acquisitionGrade === null ||
      employee.acquisitionGrade === 0
    ) {
      try {
        await this.employeeService.updateAcquisitionInfo(employee.id, {
          acquisitionGrade: gradeResult.grade,
          acquisitionStandard: gradeResult.remuneration,
          acquisitionYear: year,
          acquisitionMonth: usedMonth,
        });
      } catch (error) {
        // 保存エラーは無視（ログ出力のみ）
        console.warn('資格取得時決定情報の保存に失敗しました:', error);
      }
    }

    return {
      baseSalary: roundedBaseSalary,
      grade: gradeResult.grade,
      standardMonthlyRemuneration: gradeResult.remuneration,
      usedMonth,
      reasons,
    };
  }

  /**
   * 給与項目マスタから固定/非固定の合計を計算
   */
  calculateSalaryTotals(
    salaryItems: SalaryItemEntry[],
    salaryItemMaster: SalaryItem[]
  ): { fixedTotal: number; variableTotal: number; total: number } {
    let fixedTotal = 0;
    let variableTotal = 0;

    for (const entry of salaryItems) {
      const master = salaryItemMaster.find((item) => item.id === entry.itemId);
      if (master) {
        if (master.type === 'fixed') {
          fixedTotal += entry.amount;
        } else if (master.type === 'variable') {
          variableTotal += entry.amount;
        }
      }
    }

    return {
      fixedTotal,
      variableTotal,
      total: fixedTotal + variableTotal,
    };
  }

  /**
   * 給与データから固定/非固定/総支給を取得（後方互換性対応）
   */
  getSalaryFromData(data: MonthlySalaryData | SalaryData | undefined): {
    fixed: number;
    variable: number;
    total: number;
  } {
    if (!data) {
      return { fixed: 0, variable: 0, total: 0 };
    }

    // 新しい項目別形式を優先
    if ('salaryItems' in data && data.salaryItems) {
      return {
        fixed: data.fixedTotal ?? 0,
        variable: data.variableTotal ?? 0,
        total: data.total ?? 0,
      };
    }

    // 既存形式のフォールバック
    const fixed = (data as any).fixedSalary ?? (data as any).fixed ?? 0;
    const variable =
      (data as any).variableSalary ?? (data as any).variable ?? 0;
    const total =
      (data as any).totalSalary ?? (data as any).total ?? fixed + variable;

    return { fixed, variable, total };
  }
}
