import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { SalaryData } from './salary-calculation.service';
import { SalaryAggregationService } from './salary-aggregation.service';
import { GradeDeterminationService } from './grade-determination.service';
import { MonthHelperService } from './month-helper.service';
import { EmployeeService } from './employee.service';

export interface ShikakuShutokuResult {
  baseSalary: number; // 資格取得時決定に使用した給与
  grade: number; // 等級
  standardMonthlyRemuneration: number; // 標準報酬月額
  usedMonth: number; // どの月の給与を使ったか（1〜12）
  reasons: string[]; // 判断根拠
}

@Injectable({ providedIn: 'root' })
export class ShikakuCalculationService {
  constructor(
    private salaryAggregationService: SalaryAggregationService,
    private gradeDeterminationService: GradeDeterminationService,
    private monthHelper: MonthHelperService,
    private employeeService: EmployeeService
  ) {}

  /**
   * 給与データのキーを作成
   */
  private getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  /**
   * 資格取得時決定（入社月の標準報酬決定）を計算する
   * @param employee 従業員情報
   * @param year 年
   * @param salaries 給与データ（{ [key: string]: SalaryData }形式）
   * @param gradeTable 標準報酬月額テーブル
   * @returns 資格取得時決定結果
   */
  async calculateShikakuShutokuCore(
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
    const joinMonthTotal = this.salaryAggregationService.getTotalSalaryPublic(joinMonthSalary);

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
      const nextMonthTotal = this.salaryAggregationService.getTotalSalaryPublic(nextMonthSalary);

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
    const gradeResult = this.gradeDeterminationService.findGrade(gradeTable, roundedBaseSalary);
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
}



