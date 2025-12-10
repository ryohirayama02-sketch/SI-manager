import { Injectable } from '@angular/core';
import { SalaryCalculationService, TeijiKetteiResult, SuijiKouhoResult } from './salary-calculation.service';
import { ValidationService } from './validation.service';
import { MonthlySalaryStateService } from './monthly-salary-state.service';
import { Employee } from '../models/employee.model';
import { SuijiService } from './suiji.service';

/**
 * MonthlySalaryCalculationService
 * 
 * 月次給与画面の計算処理を担当するサービス
 * 定時決定計算、計算結果情報の更新、免除月の構築を提供
 */
@Injectable({ providedIn: 'root' })
export class MonthlySalaryCalculationService {
  constructor(
    private salaryCalculationService: SalaryCalculationService,
    private validationService: ValidationService,
    private state: MonthlySalaryStateService,
    private suijiService: SuijiService
  ) {}

  /**
   * 定時決定を計算
   */
  calculateTeijiKettei(
    employeeId: string,
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    gradeTable: any[],
    year: number,
    currentStandardMonthlyRemuneration?: number,
    employee?: Employee
  ): TeijiKetteiResult {
    const result = this.salaryCalculationService.calculateTeijiKettei(
      employeeId,
      salaries,
      gradeTable,
      year,
      currentStandardMonthlyRemuneration,
      employee
    );
// // console.log(
//       `[monthly-salaries] 定時決定計算: 従業員ID=${employeeId}, 年度=${year}, 等級=${result.grade}, 標準報酬=${result.standardMonthlyRemuneration}, 等級表件数=${gradeTable.length}`
//     );
    return result;
  }

  /**
   * 全従業員の計算結果情報を更新
   */
  async updateAllCalculatedInfo(
    employees: Employee[],
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    months: number[],
    gradeTable: any[],
    year: number
  ): Promise<{
    infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    };
    exemptMonths: { [employeeId: string]: number[] };
    exemptReasons: { [key: string]: string };
    errorMessages: { [employeeId: string]: string[] };
    warningMessages: { [employeeId: string]: string[] };
  }> {
    // 随時改定アラートを読み込む
    const suijiAlerts = await this.suijiService.loadAlerts(year);
    
    const infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    } = {};
    const errorMessages: { [employeeId: string]: string[] } = {};
    const warningMessages: { [employeeId: string]: string[] } = {};

    for (const emp of employees) {
      const { errors, warnings } = await this.updateCalculatedInfo(
        emp,
        salaries,
        months,
        gradeTable,
        year,
        infoByEmployee,
        suijiAlerts
      );
      errorMessages[emp.id] = errors;
      warningMessages[emp.id] = warnings;
    }

    // 免除月を構築
    const { exemptMonths, exemptReasons } = this.buildExemptMonths(
      employees,
      months,
      year
    );

    return { infoByEmployee, exemptMonths, exemptReasons, errorMessages, warningMessages };
  }

  /**
   * 従業員の計算結果情報を更新
   */
  private async updateCalculatedInfo(
    emp: Employee,
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    months: number[],
    gradeTable: any[],
    year: number,
    infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    },
    suijiAlerts: SuijiKouhoResult[]
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const avg = this.getAverageForAprToJun(emp.id, salaries);
    const stdResult =
      avg !== null ? this.getStandardMonthlyRemuneration(avg, gradeTable) : null;
    const standard = stdResult ? stdResult.standard : null;
    const rank = stdResult ? stdResult.rank : null;

    const age = this.calculateAge(emp.birthDate);
    // 4月の給与データを取得（定時決定の基準月）
    const aprilKey = this.state.getSalaryKey(emp.id, 4);
    const aprilSalary = salaries[aprilKey];
    const fixedSalary = aprilSalary?.fixed || 0;
    const variableSalary = aprilSalary?.variable || 0;

    const premiums =
      standard !== null
        ? await this.salaryCalculationService.calculateMonthlyPremiums(
            emp,
            year,
            4,
            fixedSalary,
            variableSalary,
            gradeTable,
            suijiAlerts
          )
        : null;

    // エラーチェック
    const result = this.validationService.checkEmployeeErrors(
      emp,
      age,
      premiums
    );

    // 結果を保存
    infoByEmployee[emp.id] = {
      avg,
      standard,
      rank,
      premiums,
    };

    return { errors: result.errors, warnings: result.warnings };
  }

  /**
   * 免除月を構築
   */
  buildExemptMonths(
    employees: Employee[],
    months: number[],
    year: number
  ): {
    exemptMonths: { [employeeId: string]: number[] };
    exemptReasons: { [key: string]: string };
  } {
    const exemptMonths: { [employeeId: string]: number[] } = {};
    const exemptReasons: { [key: string]: string } = {};
    
    for (const emp of employees) {
      exemptMonths[emp.id] = [];

      for (const month of months) {
        // 各月の免除判定（Service層のメソッドを使用）
        const exemptResult =
          this.salaryCalculationService.getExemptReasonForMonth(
            emp,
            year,
            month
          );
        if (exemptResult.exempt) {
          if (!exemptMonths[emp.id].includes(month)) {
            exemptMonths[emp.id].push(month);
          }
          // 免除理由を保存
          const key = `${emp.id}_${month}`;
          exemptReasons[key] = exemptResult.reason;
        }
      }
    }

    return { exemptMonths, exemptReasons };
  }

  /**
   * 復職後随時改定の強調月を取得
   */
  getRehabHighlightMonths(
    employees: Employee[],
    year: number
  ): { [employeeId: string]: number[] } {
    const result: { [employeeId: string]: number[] } = {};
    for (const emp of employees) {
      result[emp.id] = this.salaryCalculationService.getRehabHighlightMonths(
        emp,
        year.toString()
      );
    }
    return result;
  }

  /**
   * 4〜6月の平均を取得
   */
  getAverageForAprToJun(
    employeeId: string,
    salaries: { [key: string]: { total: number; fixed: number; variable: number } }
  ): number | null {
    return this.salaryCalculationService.getAverageForAprToJun(
      employeeId,
      salaries
    );
  }

  /**
   * 標準報酬月額を取得
   */
  getStandardMonthlyRemuneration(
    avg: number | null,
    gradeTable: any[]
  ): { rank: number; standard: number } | null {
    if (avg === null) return null;
    const result = this.salaryCalculationService.findGrade(
      gradeTable,
      avg
    );
    if (!result) return null;
    return { rank: result.grade, standard: result.remuneration };
  }

  /**
   * 年齢を計算
   */
  calculateAge(birthDate: string): number {
    return this.salaryCalculationService.calculateAge(birthDate);
  }

  /**
   * 免除理由を取得
   */
  getExemptReason(
    employeeId: string,
    month: number,
    exemptReasons: { [key: string]: string }
  ): string {
    const key = `${employeeId}_${month}`;
    const reason = exemptReasons[key] || '';
    // 理由から「産休中」「育休中」を判定
    if (reason.includes('産前産後休業')) {
      return '産休中';
    } else if (reason.includes('育児休業')) {
      return '育休中';
    }
    return '免除中'; // フォールバック
  }
}


