import { Injectable } from '@angular/core';
import { SalaryData, TeijiKetteiResult } from './salary-calculation.service';
import { Employee } from '../models/employee.model';
import { SalaryAggregationService } from './salary-aggregation.service';
import { GradeDeterminationService } from './grade-determination.service';

@Injectable({ providedIn: 'root' })
export class TeijiCalculationService {
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

  // 定時決定ロジック
  getAprilToJuneValues(
    employeeId: string,
    salaries: { [key: string]: SalaryData }
  ): { total: number; fixed: number; variable: number }[] {
    const values: { total: number; fixed: number; variable: number }[] = [];
    for (const month of [4, 5, 6]) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];
      const fixed =
        this.salaryAggregationService.getFixedSalaryPublic(salaryData);
      const variable =
        this.salaryAggregationService.getVariableSalaryPublic(salaryData);
      const total =
        this.salaryAggregationService.getTotalSalaryPublic(salaryData); // totalSalary を優先、なければ fixed + variable
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
    const months = [4, 5, 6];

    // 4-6月それぞれについて、支払基礎日数が17日未満の場合は算定除外
    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = salaries[key];

      // 支払基礎日数を取得（workingDaysフィールドから）
      const workingDays = salaryData?.workingDays;

      // 支払基礎日数が17日未満の場合は算定除外
      if (workingDays !== undefined && workingDays < 17) {
        excluded.push(month);
        reasons.push(
          `${month}月: 支払基礎日数${workingDays}日（17日未満）のため算定除外`
        );
        continue; // 既に除外されているので、次のチェックはスキップ
      }

      // 固定的賃金の15%超の欠勤控除がある場合は算定除外
      const fixed = values[i].fixed;
      const absenceDeduction = salaryData?.deductionTotal ?? 0;

      if (fixed > 0 && absenceDeduction > fixed * 0.15) {
        excluded.push(month);
        reasons.push(
          `${month}月: 欠勤控除${absenceDeduction.toLocaleString()}円が固定的賃金${fixed.toLocaleString()}円の15%超（${Math.round(
            (absenceDeduction / fixed) * 100
          )}%）のため算定除外`
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

    // 除外なし → 3ヶ月平均（円未満切り捨て）
    if (validValues.length === 3) {
      const total = validValues.reduce((sum, v) => sum + v, 0);
      const average = Math.floor(total / validValues.length);
      reasons.push('4〜6月の3ヶ月平均で算定');
      return { averageSalary: average, usedMonths, reasons };
    }

    // 除外1ヶ月 → 残り2ヶ月平均（円未満切り捨て）
    if (validValues.length === 2) {
      const total = validValues.reduce((sum, v) => sum + v, 0);
      const average = Math.floor(total / validValues.length);
      reasons.push(`${usedMonths.join('・')}月の2ヶ月平均で算定`);
      return { averageSalary: average, usedMonths, reasons };
    }

    // 除外2ヶ月 → 残り1ヶ月のみで決定
    if (validValues.length === 1) {
      reasons.push(`${usedMonths[0]}月のみで算定（特例）`);
      return { averageSalary: validValues[0], usedMonths, reasons };
    }

    // フォールバック（通常は到達しない、円未満切り捨て）
    const total = validValues.reduce((sum, v) => sum + v, 0);
    const average = Math.floor(total / validValues.length);
    return { averageSalary: average, usedMonths, reasons };
  }

  calculateTeijiKetteiCore(
    employeeId: string,
    salaries: { [key: string]: SalaryData },
    gradeTable: any[],
    year: number,
    currentStandardMonthlyRemuneration?: number,
    employee?: Employee
  ): TeijiKetteiResult {
    // 入退社日による定時決定対象外判定（算定基礎）
    if (employee) {
      const joinDate = employee.joinDate ? new Date(employee.joinDate) : null;
      const retireDate = employee.retireDate
        ? new Date(employee.retireDate)
        : null;
      const june1 = new Date(year, 5, 1); // 6月1日
      const june30 = new Date(year, 5, 30); // 6月30日
      const reasons: string[] = [];

      if (joinDate && joinDate >= june1 && joinDate.getFullYear() === year) {
        reasons.push(
          '6/1以降に資格取得（入社/加入）のため算定基礎の定時決定対象外'
        );
      }
      if (
        retireDate &&
        retireDate <= june30 &&
        retireDate.getFullYear() === year
      ) {
        reasons.push('6/30以前に退職のため算定基礎の定時決定対象外');
      }

      if (reasons.length > 0) {
        const startApplyYearMonth = { year, month: 9 };
        return {
          averageSalary: 0,
          excludedMonths: [4, 5, 6],
          usedMonths: [],
          grade: 0,
          standardMonthlyRemuneration: currentStandardMonthlyRemuneration ?? 0,
          reasons,
          average46: 0,
          startApplyYearMonth,
        };
      }
    }

    const values = this.getAprilToJuneValues(employeeId, salaries);
    const exclusionResult = this.getExcludedMonths(
      employeeId,
      values,
      salaries
    );
    const excludedMonths = exclusionResult.excluded;
    const exclusionReasons = exclusionResult.reasons;

    const averageResult = this.calculateAverage(values, excludedMonths);
    // 平均報酬をそのまま等級判定に使用（千円未満の丸めなし）
    const averageSalary = averageResult.averageSalary;
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
    const gradeResult = this.gradeDeterminationService.findGrade(
      gradeTable,
      averageSalary
    );
    const allReasons = [...exclusionReasons, ...calculationReasons];

    // 定時決定の適用開始月（原則9月支給分から適用）
    const startApplyYearMonth = { year, month: 9 };

    // 現行等級との乖離が2等級以上かつ4-6月の算定結果であれば、随時改定（7月月額変更届）優先で定時決定対象外とする
    if (
      currentStandardMonthlyRemuneration &&
      currentStandardMonthlyRemuneration > 0 &&
      gradeResult
    ) {
      const currentGradeResult = this.gradeDeterminationService.findGrade(
        gradeTable,
        currentStandardMonthlyRemuneration
      );
      const currentGrade = currentGradeResult?.grade || 0;
      const diff =
        currentGrade > 0 ? Math.abs(gradeResult.grade - currentGrade) : 0;
      const usesAprToJun = usedMonths.some((m) => [4, 5, 6].includes(m));
      if (diff >= 2 && usesAprToJun) {
        allReasons.push(
          `4〜6月平均と現行等級の乖離が${diff}等級（2等級以上）のため、7月月額変更届（随時改定）優先で定時決定の算定基礎対象外`
        );
        return {
          averageSalary,
          excludedMonths,
          usedMonths,
          grade: 0,
          standardMonthlyRemuneration: currentStandardMonthlyRemuneration,
          reasons: allReasons,
          average46: averageSalary, // 後方互換性
          startApplyYearMonth,
        };
      }
    }

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
}
