import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import { SuijiService } from './suiji.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { MonthlySalaryStateService } from './monthly-salary-state.service';
import { EditLogService } from './edit-log.service';
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
    private state: MonthlySalaryStateService,
    private editLogService: EditLogService
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
        // 既存データを取得して変更があったか確認
        const existingData = await this.monthlySalaryService.getEmployeeSalary(emp.id, year);
        const changeDetails: Array<{ month: number; details: string[] }> = [];
        
        // 各月のデータを比較
        for (const monthStr of Object.keys(payload)) {
          const month = parseInt(monthStr, 10);
          const newMonthData = payload[monthStr];
          const existingMonthData = existingData?.[monthStr];
          
          // 変更内容を取得
          const details = this.getSalaryChangeDetails(newMonthData, existingMonthData, salaryItems);
          if (details.length > 0) {
            changeDetails.push({ month, details });
          }
        }
        
        // 変更があった月がある場合のみ保存とログ記録
        if (changeDetails.length > 0) {
          await this.monthlySalaryService.saveEmployeeSalary(
            emp.id,
            year,
            payload
          );
          
          // 編集ログを記録（変更があった月と詳細内容）
          const logDescriptions: string[] = [];
          for (const change of changeDetails) {
            const detailsText = change.details.join('、');
            logDescriptions.push(`${change.month}月の給与データ（${detailsText}）を更新しました`);
          }
          
          const description = `${emp.name || emp.id}の${year}年${logDescriptions.join('。')}`;
          await this.editLogService.logEdit(
            'update',
            'salary',
            emp.id,
            emp.name || emp.id,
            description
          );
        }
      }
    }

    // 報酬月額ベースの随時改定判定（固定給の変動は見ない）
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

    // 随時改定アラートをリセット
    const suijiAlerts: SuijiKouhoResult[] = [];

    // 各従業員・各月について随時改定を判定（3ヶ月目以降）
    for (const emp of employees) {
      for (let month = 3; month <= 12; month++) {
        // 過去3ヶ月の報酬月額平均を計算
        const average = this.suijiService.calculateThreeMonthAverage(
          salaryDataForDetection,
          emp.id,
          month,
          salaryItemData,
          salaryItems
        );
        
        if (average === null) {
          continue;
        }

        // 平均から新等級を求める
        const newGrade = this.suijiService.getGradeFromAverage(average, gradeTable);
        if (newGrade === null) {
          continue;
        }

        // 現行等級を取得（変動月の前月の報酬月額から判定）
        let currentGrade: number | null = null;
        if (month > 1) {
          const prevMonthKey = `${emp.id}_${month - 1}`;
          const prevMonthData = salaryDataForDetection[prevMonthKey];
          if (prevMonthData) {
            const prevRemuneration = this.calculateRemunerationAmount(
              prevMonthData,
              prevMonthKey,
              salaryItemData,
              salaryItems
            );
            if (prevRemuneration !== null && prevRemuneration > 0) {
              currentGrade = this.suijiService.getGradeFromAverage(
                prevRemuneration,
                gradeTable
              );
            }
          }
        }

        // 現行等級が取得できない場合はスキップ
        if (currentGrade === null) {
          continue;
        }

        console.log(
          `従業員ID: ${emp.id}, 判定月: ${month}月, 3か月報酬平均: ${average?.toLocaleString() ?? 'null'}円 → 新等級: ${newGrade}, 現行等級: ${currentGrade}`
        );

        // 随時改定の本判定（等級差が2以上かチェック）
        const diff = Math.abs(newGrade - currentGrade);
        const isEligible = diff >= 2;

        if (isEligible) {
          const suijiResult: SuijiKouhoResult = {
            employeeId: emp.id,
            changeMonth: month,
            averageSalary: average,
            currentGrade: currentGrade,
            newGrade: newGrade,
            diff: diff,
            applyStartMonth: month + 4 > 12 ? month + 4 - 12 : month + 4,
            reasons: [`等級差${diff}で成立`],
            isEligible: true
          };

          console.log('随時改定候補:', suijiResult);
          await this.suijiService.saveSuijiKouho(year, suijiResult);
          suijiAlerts.push(suijiResult);
        }
      }
    }

    return { suijiAlerts };
  }

  /**
   * 報酬月額を計算（総支給額 - 欠勤控除）
   */
  private calculateRemunerationAmount(
    salaryData: MonthlySalaryData,
    key: string,
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    salaryItems: SalaryItem[]
  ): number | null {
    // 総支給額を取得
    const totalSalary = salaryData.total ?? salaryData.totalSalary ?? 0;
    
    // 欠勤控除を取得
    let absenceDeduction = 0;
    const itemData = salaryItemData[key];
    if (itemData) {
      // 給与項目マスタから「欠勤控除」種別の項目を探す
      const deductionItems = salaryItems.filter(item => item.type === 'deduction');
      for (const item of deductionItems) {
        absenceDeduction += itemData[item.id] || 0;
      }
    }
    
    // 報酬月額 = 総支給額 - 欠勤控除
    const remuneration = totalSalary - absenceDeduction;
    return remuneration >= 0 ? remuneration : null;
  }

  /**
   * 給与データの変更内容の詳細を取得
   */
  private getSalaryChangeDetails(
    newData: any,
    existingData: any,
    salaryItems: SalaryItem[]
  ): string[] {
    const changes: string[] = [];
    
    // 既存データがない場合は新規作成として扱う
    if (!existingData) {
      return ['新規作成'];
    }

    // 給与項目の比較
    if (newData.salaryItems && Array.isArray(newData.salaryItems)) {
      const existingItems = existingData.salaryItems || [];
      
      // 各項目の金額を比較
      const newItemsMap = new Map<string, number>();
      newData.salaryItems.forEach((item: SalaryItemEntry) => {
        newItemsMap.set(item.itemId, item.amount);
      });
      
      const existingItemsMap = new Map<string, number>();
      existingItems.forEach((item: SalaryItemEntry) => {
        existingItemsMap.set(item.itemId, item.amount);
      });
      
      // 給与項目名のマップを作成
      const itemNameMap = new Map<string, string>();
      salaryItems.forEach(item => {
        itemNameMap.set(item.id, item.name);
      });
      
      // 変更があった項目を特定
      const allItemIds = new Set([...newItemsMap.keys(), ...existingItemsMap.keys()]);
      for (const itemId of allItemIds) {
        const newAmount = newItemsMap.get(itemId) || 0;
        const existingAmount = existingItemsMap.get(itemId) || 0;
        
        if (Math.abs(newAmount - existingAmount) > 0.01) {
          const itemName = itemNameMap.get(itemId) || itemId;
          const formattedNew = this.formatCurrency(newAmount);
          const formattedExisting = this.formatCurrency(existingAmount);
          changes.push(`${itemName}：更新前：${formattedExisting}→${formattedNew}`);
        }
      }
    } else {
      // 給与総額の比較（項目別入力がない場合）
      const newTotal = newData.total || newData.totalSalary || 0;
      const newFixed = newData.fixedTotal || newData.fixedSalary || newData.fixed || 0;
      const newVariable = newData.variableTotal || newData.variableSalary || newData.variable || 0;
      const newWorkingDays = newData.workingDays || 0;
      
      const existingTotal = existingData.total || existingData.totalSalary || 0;
      const existingFixed = existingData.fixedTotal || existingData.fixedSalary || existingData.fixed || 0;
      const existingVariable = existingData.variableTotal || existingData.variableSalary || existingData.variable || 0;
      const existingWorkingDays = existingData.workingDays || 0;
      
      // 0.01円以上の差があれば変更あり
      if (Math.abs(newFixed - existingFixed) > 0.01) {
        changes.push(`固定給：更新前：${this.formatCurrency(existingFixed)}→${this.formatCurrency(newFixed)}`);
      }
      if (Math.abs(newVariable - existingVariable) > 0.01) {
        changes.push(`変動給：更新前：${this.formatCurrency(existingVariable)}→${this.formatCurrency(newVariable)}`);
      }
      if (Math.abs(newTotal - existingTotal) > 0.01) {
        changes.push(`合計：更新前：${this.formatCurrency(existingTotal)}→${this.formatCurrency(newTotal)}`);
      }
      if (newWorkingDays !== existingWorkingDays) {
        changes.push(`勤務日数：更新前：${existingWorkingDays}日→${newWorkingDays}日`);
      }
    }
    
    return changes;
  }

  /**
   * 金額をフォーマット（カンマ区切り）
   */
  private formatCurrency(amount: number): string {
    return Math.round(amount).toLocaleString('ja-JP');
  }
}


