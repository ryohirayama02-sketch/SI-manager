import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import { SuijiService } from './suiji.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { MonthlySalaryStateService } from './monthly-salary-state.service';
import { Employee } from '../models/employee.model';
import { SalaryItem } from '../models/salary-item.model';
import { SalaryItemEntry, MonthlySalaryData } from '../models/monthly-salary.model';
import { SuijiKouhoResult } from './salary-calculation.service';

/**
 * MonthlySalarySaveService
 * 
 * 月次給与画面の保存処理を担当するサービス
 * 給与データの保存と随時改定アラートの生成・保存を提供
 */
@Injectable({ providedIn: 'root' })
export class MonthlySalarySaveService {
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private suijiService: SuijiService,
    private salaryCalculationService: SalaryCalculationService,
    private state: MonthlySalaryStateService
  ) {}

  /**
   * 給与データを保存
   */
  async saveAllSalaries(
    employees: Employee[],
    months: number[],
    year: number,
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    workingDaysData: { [key: string]: number },
    salaries: { [key: string]: { total: number; fixed: number; variable: number } },
    exemptMonths: { [employeeId: string]: number[] },
    salaryItems: SalaryItem[],
    gradeTable: any[]
  ): Promise<{
    suijiAlerts: SuijiKouhoResult[];
  }> {
    for (const emp of employees) {
      const payload: any = {};

      for (const month of months) {
        // 支払基礎日数を取得（免除月でも取得）
        const workingDaysKey = this.state.getWorkingDaysKey(emp.id, month);
        const workingDays =
          workingDaysData[workingDaysKey] ??
          new Date(year, month, 0).getDate();

        // 免除月の場合はスキップ（0として扱う）
        if (exemptMonths[emp.id]?.includes(month)) {
          continue;
        }

        const itemKey = this.state.getSalaryItemKey(emp.id, month);
        const itemEntries: SalaryItemEntry[] = [];

        for (const item of salaryItems) {
          const amount = salaryItemData[itemKey]?.[item.id] ?? 0;
          if (amount > 0) {
            itemEntries.push({ itemId: item.id, amount });
          }
        }

        // 項目別入力がある場合
        if (itemEntries.length > 0) {
          const totals = this.salaryCalculationService.calculateSalaryTotals(
            itemEntries,
            salaryItems
          );
          payload[month.toString()] = {
            salaryItems: itemEntries,
            fixedTotal: totals.fixedTotal,
            variableTotal: totals.variableTotal,
            total: totals.total,
            workingDays: workingDays,
            // 後方互換性
            fixed: totals.fixedTotal,
            variable: totals.variableTotal,
            totalSalary: totals.total,
            fixedSalary: totals.fixedTotal,
            variableSalary: totals.variableTotal,
          };
        } else {
          // 項目別入力がない場合、salariesオブジェクトから取得
          const salaryKey = this.state.getSalaryKey(emp.id, month);
          const salaryData = salaries[salaryKey];
          if (
            salaryData &&
            (salaryData.total > 0 ||
              salaryData.fixed > 0 ||
              salaryData.variable > 0)
          ) {
            const fixed = salaryData.fixed || 0;
            const variable = salaryData.variable || 0;
            const total = salaryData.total || fixed + variable;
            payload[month.toString()] = {
              fixedTotal: fixed,
              variableTotal: variable,
              total: total,
              workingDays: workingDays,
              // 後方互換性
              fixed: fixed,
              variable: variable,
              totalSalary: total,
              fixedSalary: fixed,
              variableSalary: variable,
            };
          }
        }
      }

      if (Object.keys(payload).length > 0) {
        await this.monthlySalaryService.saveEmployeeSalary(
          emp.id,
          year,
          payload
        );
      }
    }

    // 固定的賃金の変動検出
    const salaryDataForDetection: { [key: string]: MonthlySalaryData } = {};
    for (const emp of employees) {
      for (const month of months) {
        const key = this.state.getSalaryKey(emp.id, month);
        const salaryData = salaries[key];
        if (salaryData) {
          const detectionKey = `${emp.id}_${month}`;
          salaryDataForDetection[detectionKey] = {
            fixedTotal: salaryData.fixed,
            variableTotal: salaryData.variable,
            total: salaryData.total,
          };
        }
      }
    }

    const fixedChanges = this.suijiService.detectFixedSalaryChange(
      salaryDataForDetection,
      salaryItems
    );
    console.log('固定的賃金の変動検出結果:', fixedChanges);

    // 随時改定アラートをリセット
    const suijiAlerts: SuijiKouhoResult[] = [];

    // 各変動について3か月平均を計算
    for (const change of fixedChanges) {
      const average = this.suijiService.calculateThreeMonthAverage(
        salaryDataForDetection,
        change.employeeId,
        change.changeMonth
      );
      const newGrade =
        average !== null
          ? this.suijiService.getGradeFromAverage(average, gradeTable)
          : null;

      // 現行等級を取得（変動月の前月の給与から判定）
      let currentGrade: number | null = null;
      if (change.changeMonth > 1) {
        const prevMonthKey = `${change.employeeId}_${change.changeMonth - 1}`;
        const prevMonthData = salaryDataForDetection[prevMonthKey];
        if (prevMonthData) {
          const prevMonthTotal = prevMonthData.total ?? 0;
          if (prevMonthTotal > 0) {
            currentGrade = this.suijiService.getGradeFromAverage(
              prevMonthTotal,
              gradeTable
            );
          }
        }
      }

      console.log(
        `従業員ID: ${change.employeeId}, 変動月: ${
          change.changeMonth
        }月, 3か月平均: ${average?.toLocaleString() ?? 'null'}円 → 等級: ${
          newGrade ?? '該当なし'
        }`
      );

      // 随時改定の本判定
      const suijiResult = this.suijiService.judgeSuijiKouho(
        change,
        currentGrade,
        newGrade,
        average
      );
      if (suijiResult) {
        console.log('随時改定候補:', suijiResult);

        // isEligible=trueの場合のみFirestoreに保存し、アラートに追加
        if (suijiResult.isEligible) {
          await this.suijiService.saveSuijiKouho(year, suijiResult);
          suijiAlerts.push(suijiResult);
        }
      }
    }

    return { suijiAlerts };
  }
}


