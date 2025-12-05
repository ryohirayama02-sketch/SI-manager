import { Injectable } from '@angular/core';
import { SalaryCalculationService } from './salary-calculation.service';
import { MonthlySalaryUIService } from './monthly-salary-ui.service';
import { Employee } from '../models/employee.model';
import { TeijiKetteiResult, SuijiKouhoResult } from './salary-calculation.service';

/**
 * MonthlySalarySuijiUiService
 * 
 * 月次給与画面の随時改定関連ロジックを担当するサービス
 * 随時改定候補の更新とリハビリハイライト月の取得を提供
 */
@Injectable({ providedIn: 'root' })
export class MonthlySalarySuijiUiService {
  constructor(
    private salaryCalculationService: SalaryCalculationService,
    private monthlySalaryUIService: MonthlySalaryUIService
  ) {}

  /**
   * 随時改定候補を更新する
   */
  updateRehabSuiji(
    employeeId: string,
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    gradeTable: any[],
    employees: Employee[],
    year: number,
    results: { [employeeId: string]: TeijiKetteiResult },
    currentRehabSuijiCandidates: SuijiKouhoResult[]
  ): SuijiKouhoResult[] {
    const candidates = this.salaryCalculationService.checkRehabSuiji(
      employeeId,
      salaries,
      gradeTable,
      employees,
      year.toString(),
      results
    );

    const updatedCandidates = currentRehabSuijiCandidates.filter(
      (c) => c.employeeId !== employeeId
    );

    for (const candidate of candidates) {
      const exists = updatedCandidates.find(
        (c) =>
          c.employeeId === candidate.employeeId &&
          c.changeMonth === candidate.changeMonth
      );
      if (!exists) {
        updatedCandidates.push(candidate);
      }
    }

    return updatedCandidates;
  }

  /**
   * リハビリハイライト月を取得する
   */
  getRehabHighlightMonths(
    employees: Employee[],
    year: number
  ): { [employeeId: string]: number[] } {
    return this.monthlySalaryUIService.getRehabHighlightMonths(employees, year);
  }
}




