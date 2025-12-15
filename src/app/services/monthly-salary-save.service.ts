import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import { SuijiService } from './suiji.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { MonthlySalaryStateService } from './monthly-salary-state.service';
import { EditLogService } from './edit-log.service';
import { EmployeeService } from './employee.service';
import { GradeDeterminationService } from './grade-determination.service';
import { MonthlySalaryCalculationService } from './monthly-salary-calculation.service';
import { MonthlyPremiumCalculationService } from './monthly-premium-calculation.service';
import { SettingsService } from './settings.service';
import { Employee } from '../models/employee.model';
import { SalaryItem } from '../models/salary-item.model';
import {
  SalaryItemEntry,
  MonthlySalaryData,
} from '../models/monthly-salary.model';
import { SuijiKouhoResult } from './salary-calculation.service';
import { RoomIdService } from './room-id.service';

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
    private editLogService: EditLogService,
    private employeeService: EmployeeService,
    private gradeDeterminationService: GradeDeterminationService,
    private monthlySalaryCalculationService: MonthlySalaryCalculationService,
    private monthlyPremiumCalculationService: MonthlyPremiumCalculationService,
    private settingsService: SettingsService,
    private roomIdService: RoomIdService
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
    salaries: {
      [key: string]: { total: number; fixed: number; variable: number };
    },
    exemptMonths: { [employeeId: string]: number[] },
    salaryItems: SalaryItem[],
    gradeTable: any[]
  ): Promise<{
    suijiAlerts: SuijiKouhoResult[];
  }> {
    const roomId = this.roomIdService.requireRoomId();
    for (const emp of employees) {
      const payload: any = {};

      // 既存データを取得して、0に変更された項目を検出するために使用（月別取得）
      const existingMonthDataMap: { [month: string]: any } = {};
      for (const month of months) {
        const existingMonthData =
          await this.monthlySalaryService.getEmployeeSalary(
            roomId,
            emp.id,
            year,
            month
          );
        if (existingMonthData) {
          existingMonthDataMap[month.toString()] = existingMonthData;
        }
      }

      for (const month of months) {
        // 支払基礎日数を取得（免除月でも取得）
        const workingDaysKey = this.state.getWorkingDaysKey(emp.id, month);
        const workingDays =
          workingDaysData[workingDaysKey] ?? new Date(year, month, 0).getDate();

        const isExemptMonth = exemptMonths[emp.id]?.includes(month);
        if (!isExemptMonth) {
          const itemKey = this.state.getSalaryItemKey(emp.id, month);
          const itemEntries: SalaryItemEntry[] = [];
          const monthStr = month.toString();
          const existingMonthData = existingMonthDataMap[monthStr];

          // 既存データの項目IDセットを作成（0に変更された項目を検出するため）
          const existingItemIds = new Set<string>();
          if (
            existingMonthData?.salaryItems &&
            Array.isArray(existingMonthData.salaryItems)
          ) {
            for (const entry of existingMonthData.salaryItems) {
              existingItemIds.add(entry.itemId);
            }
          }

          for (const item of salaryItems) {
            const amount = salaryItemData[itemKey]?.[item.id] ?? 0;
            // 0の値も保存する（既存データに存在する項目、または明示的に0が設定された場合）
            // 既存データに存在する項目は、0に変更された場合も保存する
            if (amount > 0 || existingItemIds.has(item.id)) {
              itemEntries.push({ itemId: item.id, amount });
            }
          }

          // 項目別入力がある場合、または既存データに項目があった場合
          if (itemEntries.length > 0) {
            const totals = this.salaryCalculationService.calculateSalaryTotals(
              itemEntries,
              salaryItems
            );
            payload[monthStr] = {
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
            // 給与が0円でも、給与データが存在する場合は保存する（徴収不能アラートの判定に必要）
            if (salaryData) {
              const fixed = salaryData.fixed || 0;
              const variable = salaryData.variable || 0;
              const total = salaryData.total || fixed + variable;
              payload[monthStr] = {
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
            } else {
              // 給与データが存在しない場合でも、給与が0円として明示的に保存する
              // これにより、保険料計算時に給与データが存在すると判定され、徴収不能アラートのチェックが行われる
              payload[monthStr] = {
                fixedTotal: 0,
                variableTotal: 0,
                total: 0,
                workingDays: workingDays,
                // 後方互換性
                fixed: 0,
                variable: 0,
                totalSalary: 0,
                fixedSalary: 0,
                variableSalary: 0,
              };
            }
          }
        }
      }

      if (Object.keys(payload).length > 0) {
        // 既存データを取得して変更があったか確認（既に取得済みの場合は再利用）
        const changeDetails: Array<{ month: number; details: string[] }> = [];

        // 各月のデータを比較
        for (const monthStr of Object.keys(payload)) {
          const month = parseInt(monthStr, 10);
          const newMonthData = payload[monthStr];
          const existingMonthData = existingMonthDataMap[monthStr];

          // 変更内容を取得
          const details = this.getSalaryChangeDetails(
            newMonthData,
            existingMonthData,
            salaryItems
          );
          if (details.length > 0) {
            changeDetails.push({ month, details });
          }
        }

        // 変更があった月がある場合のみ保存とログ記録
        if (changeDetails.length > 0) {
          for (const change of changeDetails) {
            const monthPayload = payload[change.month.toString()];
            if (monthPayload) {
              await this.monthlySalaryService.saveEmployeeSalary(
                roomId,
                emp.id,
                year,
                change.month,
                monthPayload
              );
            }
          }

          // 編集ログを記録（変更があった月と詳細内容）
          const logDescriptions: string[] = [];
          for (const change of changeDetails) {
            const detailsText = change.details.join('、');
            logDescriptions.push(
              `${change.month}月の給与データ（${detailsText}）を更新しました`
            );
          }

          const description = `${
            emp.name || emp.id
          }の${year}年${logDescriptions.join('。')}`;
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

    // 報酬月額ベースの随時改定判定（給与項目別データから直接計算）
    const salaryDataForDetection: { [key: string]: MonthlySalaryData } = {};
    for (const emp of employees) {
      for (const month of months) {
        const detectionKey = `${emp.id}_${month}`;
        const itemKey = this.state.getSalaryItemKey(emp.id, month);

        // 給与項目別データから直接報酬月額を計算
        const itemData = salaryItemData[itemKey];
        if (itemData && salaryItems) {
          // 固定給・変動給を集計（賞与と欠勤控除を除外）
          let fixedTotal = 0;
          let variableTotal = 0;

          for (const item of salaryItems) {
            const amount = itemData[item.id] || 0;

            const isBonus =
              item.name === '賞与' ||
              item.name.includes('賞与') ||
              item.name.includes('ボーナス');
            const isDeduction = item.type === 'deduction';

            if (!isBonus && !isDeduction) {
              // 固定給・変動給を集計
              if (item.type === 'fixed') {
                fixedTotal += amount;
              } else if (item.type === 'variable') {
                variableTotal += amount;
              }
            }
          }

          // 報酬月額 = 固定給 + 変動給（賞与・欠勤控除は既に除外済み）
          const total = fixedTotal + variableTotal;

          // データがある場合のみ追加（totalが0でも、itemDataが存在する場合は追加）
          // これにより、1月のデータも確実に含まれる
          if (itemData && Object.keys(itemData).length > 0) {
            salaryDataForDetection[detectionKey] = {
              fixedTotal: fixedTotal,
              variableTotal: variableTotal,
              total: total,
            };
          }
        } else {
          // 給与項目別データがない場合は、salariesオブジェクトから取得（後方互換性）
          const key = this.state.getSalaryKey(emp.id, month);
          const salaryData = salaries[key];
          if (salaryData) {
            salaryDataForDetection[detectionKey] = {
              fixedTotal: salaryData.fixed,
              variableTotal: salaryData.variable,
              total: salaryData.total,
            };
          }
        }
      }
    }

    // 随時改定アラートをリセット（既存のアラートを削除）
    // まず、該当従業員の全年度の既存アラートを全て削除
    // 従業員基本情報画面では前年、当年、翌年のアラートを表示するため、それらも含めて削除
    const yearsToCheck = [year - 1, year, year + 1]; // 前年、当年、翌年
    for (const emp of employees) {
      for (const checkYear of yearsToCheck) {
        try {
          // 既存のアラートを取得して削除
          const existingAlerts = await this.suijiService.loadAlerts(checkYear);
          const employeeAlerts = existingAlerts.filter(
            (alert) => alert.employeeId === emp.id
          );
          for (const alert of employeeAlerts) {
            await this.suijiService.deleteAlert(
              checkYear,
              alert.employeeId,
              alert.changeMonth
            );
          }
        } catch (error) {
          // 年度のコレクションが存在しない場合はスキップ
          console.warn(
            `[monthly-salary-save] 年度 ${checkYear} のアラート削除に失敗:`,
            error
          );
        }
      }
    }

    const suijiAlerts: SuijiKouhoResult[] = [];

    // 各従業員について随時改定を判定
    for (const emp of employees) {
      // 従業員の現在の標準報酬月額から現行等級を取得
      // まず従業員データから取得を試みる
      const employee = await this.employeeService.getEmployeeById(emp.id);
      let currentStandard =
        employee?.standardMonthlyRemuneration ||
        employee?.acquisitionStandard ||
        null;

      // 従業員データに標準報酬がない場合は、定時決定計算から取得
      if (!currentStandard || currentStandard <= 0) {
        // その年度の給与データから定時決定を計算して標準報酬を取得
        const empSalaries: {
          [key: string]: { total: number; fixed: number; variable: number };
        } = {};
        for (const month of months) {
          const key = this.state.getSalaryKey(emp.id, month);
          const salaryData = salaries[key];
          if (salaryData) {
            empSalaries[key] = {
              total: salaryData.total || 0,
              fixed: salaryData.fixed || 0,
              variable: salaryData.variable || 0,
            };
          }
        }

        // 定時決定計算を実行して標準報酬を取得
        const teijiResult =
          this.monthlySalaryCalculationService.calculateTeijiKettei(
            emp.id,
            empSalaries,
            gradeTable,
            year,
            currentStandard || undefined,
            employee || emp
          );

        if (teijiResult && teijiResult.standardMonthlyRemuneration > 0) {
          currentStandard = teijiResult.standardMonthlyRemuneration;
          // // console.log(
          //             `[随時改定判定] ${
          //               emp.name || emp.id
          //             }: 定時決定から標準報酬を取得: ${currentStandard}`
          //           );
        }
      }

      // // console.log(
      //         `[随時改定判定] ${
      //           emp.name || emp.id
      //         }: currentStandard=${currentStandard}`
      //       );

      const hasCurrentStandard = !!currentStandard && currentStandard > 0;
      if (hasCurrentStandard) {
        // 現行等級を取得
        const currentGradeResult = this.gradeDeterminationService.findGrade(
          gradeTable,
          currentStandard
        );
        if (currentGradeResult) {
          const currentGrade = currentGradeResult.grade;
          // // console.log(
          //             `[随時改定判定] ${emp.name || emp.id}: 現行等級=${currentGrade}`
          //           );

          // 報酬月額が変動した月を検出（前月と比較）
          const changedMonths: number[] = [];
          for (let month = 2; month <= 12; month++) {
            const currentMonthKey = `${emp.id}_${month}`;
            const prevMonthKey = `${emp.id}_${month - 1}`;
            const currentMonthData = salaryDataForDetection[currentMonthKey];
            const prevMonthData = salaryDataForDetection[prevMonthKey];

            if (currentMonthData && prevMonthData) {
              const currentRemuneration = this.calculateRemunerationAmount(
                currentMonthData,
                currentMonthKey,
                salaryItemData,
                salaryItems
              );
              const prevRemuneration = this.calculateRemunerationAmount(
                prevMonthData,
                prevMonthKey,
                salaryItemData,
                salaryItems
              );

              // 報酬月額が変動した場合のみ判定対象とする
              if (
                currentRemuneration !== null &&
                prevRemuneration !== null &&
                Math.abs(currentRemuneration - prevRemuneration) > 0.01
              ) {
                changedMonths.push(month);
              }
            }
          }

          // 報酬月額が変動した月について随時改定を判定
          // 変動月を含む3ヶ月（変動月、変動月+1、変動月+2）のデータがあれば判定可能
          for (const month of changedMonths) {
            // 支払基礎日数17日未満のチェック（変動月を含む3ヶ月）
            const targetMonths = [month, month + 1, month + 2];
            const hasInvalidWorkingDays = targetMonths.some((targetMonth) => {
              if (targetMonth > 12) return false; // 12月を超える場合はスキップ
              const workingDaysKey = this.state.getWorkingDaysKey(emp.id, targetMonth);
              let workingDays = workingDaysData[workingDaysKey];
              
              // workingDaysDataに値がない場合、その月の日数をデフォルトとして使用
              // （saveAllSalariesの80-84行目と同じロジック）
              if (workingDays === undefined) {
                workingDays = new Date(year, targetMonth, 0).getDate();
              }
              
              // 支払基礎日数が17日未満（0日を含む）の場合は無効
              return workingDays < 17;
            });

            // 支払基礎日数17日未満の月が1つでもあれば随時改定をスキップ
            if (hasInvalidWorkingDays) {
              console.log(
                `[monthly-salary-save] ${emp.name} (${year}年${month}月): 支払基礎日数17日未満の月が含まれるため随時改定をスキップ`,
                {
                  targetMonths,
                  workingDays: targetMonths.map((m) => {
                    if (m > 12) return null;
                    const key = this.state.getWorkingDaysKey(emp.id, m);
                    const wd = workingDaysData[key];
                    return wd !== undefined ? wd : new Date(year, m, 0).getDate();
                  }),
                }
              );
              continue;
            }

            // 変動前の標準報酬を取得（変動月の前月時点の標準報酬）
            // 変動月が2月の場合、1月時点の標準報酬を基準にする
            let prevStandard = currentStandard;

            // 変動月の前月の給与データから標準報酬を計算
            const prevMonth = month - 1;
            if (prevMonth >= 1) {
              const prevMonthKey = `${emp.id}_${prevMonth}`;
              const prevMonthData = salaryDataForDetection[prevMonthKey];
              if (prevMonthData) {
                const prevRemuneration = this.calculateRemunerationAmount(
                  prevMonthData,
                  prevMonthKey,
                  salaryItemData,
                  salaryItems
                );
                if (prevRemuneration !== null && prevRemuneration > 0) {
                  // 前月の報酬月額から標準報酬を取得
                  const prevGradeResult =
                    this.gradeDeterminationService.findGrade(
                      gradeTable,
                      prevRemuneration
                    );
                  if (prevGradeResult) {
                    prevStandard = prevGradeResult.remuneration;
                  }
                }
              }
            }

            // 変動前の標準報酬から現行等級を取得
            const prevGradeResult = this.gradeDeterminationService.findGrade(
              gradeTable,
              prevStandard
            );
            if (prevGradeResult) {
              const prevGrade = prevGradeResult.grade;

              // 過去3ヶ月の報酬月額平均を計算（変動月を含む3ヶ月）
              const average = this.suijiService.calculateThreeMonthAverage(
                salaryDataForDetection,
                emp.id,
                month,
                salaryItemData,
                salaryItems
              );

              // 3ヶ月分のデータが揃わない場合はスキップ（calculateThreeMonthAverageがnullを返す）
              if (average !== null) {
                // 平均から新等級を求める
                const newGrade = this.suijiService.getGradeFromAverage(
                  average,
                  gradeTable
                );

                if (newGrade !== null) {
                  // 随時改定の本判定（等級差が2以上かチェック）
                  const diff = Math.abs(newGrade - prevGrade);
                  const isEligible = diff >= 2;

                  if (isEligible) {
                    const suijiResult: SuijiKouhoResult = {
                      employeeId: emp.id,
                      changeMonth: month,
                      averageSalary: average,
                      currentGrade: prevGrade,
                      newGrade: newGrade,
                      diff: diff,
                      applyStartMonth:
                        month + 4 > 12 ? month + 4 - 12 : month + 4,
                      reasons: [`等級差${diff}で成立`],
                      isEligible: true,
                    };

                    await this.suijiService.saveSuijiKouho(year, suijiResult);
                    suijiAlerts.push(suijiResult);
                  }
                }
              }
            }
          }
        }
      }
    }

    // 保存後に各月の保険料計算を実行して徴収不能アラートをチェック
    // // console.log('[徴収不能チェック] 保存後の保険料計算開始');
    const prefecture = 'tokyo'; // TODO: 設定から取得する場合は差し替え
    const rates = await this.settingsService.getRates(
      year.toString(),
      prefecture
    );

    if (rates) {
      for (const emp of employees) {
        const updatedEmployee = await this.employeeService.getEmployeeById(
          emp.id
        );
        if (updatedEmployee) {
          // idが確実に含まれるようにする
          if (!updatedEmployee.id) {
            updatedEmployee.id = emp.id;
          }

          // 保存された給与データを取得
          for (const month of months) {
            const monthKeyString = month.toString();
            const monthSalaryData =
              await this.monthlySalaryService.getEmployeeSalary(
                roomId,
                emp.id,
                year,
                month
              );

            const salaryDataMap: any = {
              [monthKeyString]: monthSalaryData || null,
            };
            await this.monthlyPremiumCalculationService.calculateEmployeeMonthlyPremiums(
              updatedEmployee, // 最新の従業員データを使用
              year,
              month,
              salaryDataMap,
              gradeTable,
              rates,
              prefecture
            );
          }
        }
      }
    } else {
      // // console.log('[徴収不能チェック] 保険料率が取得できないためスキップ');
      // return { suijiAlerts };
    }

    return { suijiAlerts };
  }

  /**
   * 報酬月額を計算（総支給額 - 欠勤控除 - 賞与）
   *
   * salaryDataForDetection経由のデータは total に賞与・欠勤控除除外済みの値が入るためそのまま使う。
   * salaryItemData から計算する場合のみ、賞与・欠勤控除を除外して算出する。
   */
  private calculateRemunerationAmount(
    salaryData: MonthlySalaryData,
    key: string,
    salaryItemData: { [key: string]: { [itemId: string]: number } },
    salaryItems: SalaryItem[]
  ): number | null {
    // salaryDataForDetection 由来なら total を優先（賞与・欠勤控除除外済み）
    if (salaryData.total !== undefined && salaryData.total !== null) {
      return salaryData.total >= 0 ? salaryData.total : null;
    }

    const itemData = salaryItemData[key];
    if (!itemData || !salaryItems || Object.keys(itemData).length === 0) {
      // 項目別データが無い場合は totalSalary を使用
      const totalSalary = salaryData.totalSalary ?? 0;
      return totalSalary >= 0 ? totalSalary : null;
    }

    const totalSalary = salaryData.totalSalary ?? 0;

    let absenceDeduction = 0;
    let bonusAmount = 0;

    const deductionItems = salaryItems.filter(
      (item) => item.type === 'deduction'
    );
    for (const item of deductionItems) {
      absenceDeduction += itemData[item.id] || 0;
    }

    const bonusItems = salaryItems.filter(
      (item) =>
        item.name === '賞与' ||
        item.name.includes('賞与') ||
        item.name.includes('ボーナス')
    );
    for (const item of bonusItems) {
      bonusAmount += itemData[item.id] || 0;
    }

    const remuneration = totalSalary - absenceDeduction - bonusAmount;
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
      const existingItems = Array.isArray(existingData.salaryItems)
        ? existingData.salaryItems
        : [];

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
      salaryItems.forEach((item) => {
        itemNameMap.set(item.id, item.name);
      });

      // 変更があった項目を特定
      const allItemIds = new Set([
        ...newItemsMap.keys(),
        ...existingItemsMap.keys(),
      ]);
      for (const itemId of allItemIds) {
        const newAmount = newItemsMap.get(itemId) || 0;
        const existingAmount = existingItemsMap.get(itemId) || 0;

        if (Math.abs(newAmount - existingAmount) > 0.01) {
          const itemName = itemNameMap.get(itemId) || itemId;
          const formattedNew = this.formatCurrency(newAmount);
          const formattedExisting = this.formatCurrency(existingAmount);
          changes.push(
            `${itemName}：更新前：${formattedExisting}→${formattedNew}`
          );
        }
      }
    } else {
      // 給与総額の比較（項目別入力がない場合）
      const newTotal = newData.total || newData.totalSalary || 0;
      const newFixed =
        newData.fixedTotal || newData.fixedSalary || newData.fixed || 0;
      const newVariable =
        newData.variableTotal ||
        newData.variableSalary ||
        newData.variable ||
        0;

      const existingTotal = existingData.total || existingData.totalSalary || 0;
      const existingFixed =
        existingData.fixedTotal ||
        existingData.fixedSalary ||
        existingData.fixed ||
        0;
      const existingVariable =
        existingData.variableTotal ||
        existingData.variableSalary ||
        existingData.variable ||
        0;

      // 0.01円以上の差があれば変更あり
      if (Math.abs(newFixed - existingFixed) > 0.01) {
        changes.push(
          `固定給：更新前：${this.formatCurrency(
            existingFixed
          )}→${this.formatCurrency(newFixed)}`
        );
      }
      if (Math.abs(newVariable - existingVariable) > 0.01) {
        changes.push(
          `変動給：更新前：${this.formatCurrency(
            existingVariable
          )}→${this.formatCurrency(newVariable)}`
        );
      }
      if (Math.abs(newTotal - existingTotal) > 0.01) {
        changes.push(
          `合計：更新前：${this.formatCurrency(
            existingTotal
          )}→${this.formatCurrency(newTotal)}`
        );
      }
    }

    // 支払基礎日数の比較（項目別入力がある場合もない場合も共通）
    const newWorkingDays = newData.workingDays;
    const existingWorkingDays = existingData.workingDays;
    if (
      newWorkingDays !== undefined &&
      newWorkingDays !== null &&
      existingWorkingDays !== undefined &&
      existingWorkingDays !== null &&
      newWorkingDays !== existingWorkingDays
    ) {
      changes.push(
        `支払基礎日数：更新前：${existingWorkingDays}日→${newWorkingDays}日`
      );
    } else if (
      newWorkingDays !== undefined &&
      newWorkingDays !== null &&
      (existingWorkingDays === undefined || existingWorkingDays === null)
    ) {
      changes.push(`支払基礎日数：${newWorkingDays}日を設定`);
    } else if (
      (newWorkingDays === undefined || newWorkingDays === null) &&
      existingWorkingDays !== undefined &&
      existingWorkingDays !== null
    ) {
      changes.push(`支払基礎日数：削除`);
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
