import { Injectable } from '@angular/core';
import { SalaryEditHandlerService } from './salary-edit-handler.service';
import { MonthlySalaryUIService } from './monthly-salary-ui.service';
import { Employee } from '../models/employee.model';
import { SalaryItem } from '../models/salary-item.model';
import { TeijiKetteiResult } from './salary-calculation.service';

/**
 * MonthlySalaryEditUiService
 * 
 * 月次給与画面の編集ロジックを担当するサービス
 * 給与項目変更時の処理とバリデーション結果の反映を提供
 */
@Injectable({ providedIn: 'root' })
export class MonthlySalaryEditUiService {
  constructor(
    private salaryEditHandlerService: SalaryEditHandlerService,
    private monthlySalaryUIService: MonthlySalaryUIService
  ) {}

  /**
   * 給与項目変更時の処理
   */
  async handleSalaryItemChange(
    event: {
      employeeId: string;
      month: number;
      itemId: string;
      value: string | number;
    },
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    salaryItems: SalaryItem[],
    employees: Employee[],
    months: number[],
    gradeTable: any[],
    year: number,
    results: { [employeeId: string]: TeijiKetteiResult },
    errorMessages: { [employeeId: string]: string[] },
    warningMessages: { [employeeId: string]: string[] }
  ): Promise<{
    salaryItemData: { [key: string]: { [itemId: string]: number } };
    salaries: { [key: string]: { total: number; fixed: number; variable: number } };
    results: { [employeeId: string]: TeijiKetteiResult };
    infoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    };
    errorMessages: { [employeeId: string]: string[] };
    warningMessages: { [employeeId: string]: string[] };
  }> {
    // サービスに処理を委譲
    const result = this.salaryEditHandlerService.handleSalaryItemChange(
      event,
      salaryItemData,
      salaries,
      salaryItems,
      employees,
      months,
      gradeTable,
      year,
      results,
      (avg: number | null) =>
        this.monthlySalaryUIService.getStandardMonthlyRemuneration(
          avg,
          gradeTable
        )
    );

    const updatedErrorMessages = { ...errorMessages };
    const updatedWarningMessages = { ...warningMessages };
    const updatedInfoByEmployee: {
      [employeeId: string]: {
        avg: number | null;
        standard: number | null;
        rank: number | null;
        premiums: any;
      };
    } = {};

    // バリデーション結果を反映
    if (result.validationErrors[event.employeeId]) {
      updatedErrorMessages[event.employeeId] =
        result.validationErrors[event.employeeId];
    }
    if (result.validationWarnings[event.employeeId]) {
      // システム警告は残す
      const systemWarnings =
        updatedWarningMessages[event.employeeId]?.filter((w) =>
          w.includes('標準報酬等級表が設定されていません')
        ) || [];
      updatedWarningMessages[event.employeeId] = [
        ...systemWarnings,
        ...result.validationWarnings[event.employeeId],
      ];
    }

    // 再計算が必要な場合
    if (result.needsRecalculation && result.recalculateEmployeeId) {
      const emp = employees.find(
        (e) => e.id === result.recalculateEmployeeId
      );
      if (emp) {
        const {
          infoByEmployee: calculatedInfo,
          errorMessages: calculatedErrors,
          warningMessages: calculatedWarnings,
        } = await this.monthlySalaryUIService.updateAllCalculatedInfo(
          [emp],
          result.salaries,
          months,
          gradeTable,
          year
        );
        updatedInfoByEmployee[emp.id] = calculatedInfo[emp.id];
        if (calculatedErrors[emp.id]) {
          updatedErrorMessages[emp.id] = calculatedErrors[emp.id];
        }
        if (calculatedWarnings[emp.id]) {
          const systemWarnings =
            updatedWarningMessages[emp.id]?.filter((w) =>
              w.includes('標準報酬等級表が設定されていません')
            ) || [];
          updatedWarningMessages[emp.id] = [
            ...systemWarnings,
            ...calculatedWarnings[emp.id],
          ];
        }
      }
    }

    return {
      salaryItemData: result.salaryItemData,
      salaries: result.salaries,
      results: result.results,
      infoByEmployee: updatedInfoByEmployee,
      errorMessages: updatedErrorMessages,
      warningMessages: updatedWarningMessages,
    };
  }
}







