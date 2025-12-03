import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { SalaryData, TeijiKetteiResult, SuijiKouhoResult } from './salary-calculation.service';
import { MonthHelperService } from './month-helper.service';
import { SuijiDetectionService } from './suiji-detection.service';

/**
 * SuijiRehabService
 * 
 * 復職（産休・育休終了）に伴う随時改定ロジックを担当するサービス
 * 復職月の固定的賃金の変動を検出し、随時改定候補を判定
 */
@Injectable({ providedIn: 'root' })
export class SuijiRehabService {
  constructor(
    private monthHelper: MonthHelperService,
    private suijiDetectionService: SuijiDetectionService
  ) {}

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
      const result = this.suijiDetectionService.checkFixedSalaryChangeForMonth(
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
   * 復職月のハイライト月を取得する
   */
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
}



