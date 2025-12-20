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
import { StandardRemunerationHistoryService } from './standard-remuneration-history.service';
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
    private standardRemunerationHistoryService: StandardRemunerationHistoryService,
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
    if (!employees || employees.length === 0) {
      return { suijiAlerts: [] };
    }
    if (!months || months.length === 0) {
      return { suijiAlerts: [] };
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return { suijiAlerts: [] };
    }
    const roomId = this.roomIdService.requireRoomId();
    for (const emp of employees) {
      if (!emp || !emp.id) {
        continue;
      }
      const payload: any = {};

      // 既存データを取得して、0に変更された項目を検出するために使用（月別取得）
      const existingMonthDataMap: { [month: string]: any } = {};
      for (const month of months) {
        if (isNaN(month) || month < 1 || month > 12) {
          continue;
        }
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
        if (isNaN(month) || month < 1 || month > 12) {
          continue;
        }
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
      if (!emp || !emp.id) {
        continue;
      }
      for (const month of months) {
        if (isNaN(month) || month < 1 || month > 12) {
          continue;
        }
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
      if (!emp || !emp.id) {
        continue;
      }
      for (const checkYear of yearsToCheck) {
        if (isNaN(checkYear) || checkYear < 1900 || checkYear > 2100) {
          continue;
        }
        try {
          // 既存のアラートを取得して削除
          const existingAlerts = await this.suijiService.loadAlerts(checkYear);
          if (!existingAlerts || !Array.isArray(existingAlerts)) {
            continue;
          }
          const employeeAlerts = existingAlerts.filter(
            (alert) => alert && alert.employeeId === emp.id
          );
          for (const alert of employeeAlerts) {
            if (
              !alert ||
              !alert.employeeId ||
              alert.changeMonth === undefined
            ) {
              continue;
            }
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
      if (!emp || !emp.id) {
        continue;
      }
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
          if (isNaN(month) || month < 1 || month > 12) {
            continue;
          }
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
        }
      }

      const hasCurrentStandard = !!currentStandard && currentStandard > 0;
      if (hasCurrentStandard) {
        // 現行等級を取得
        const currentGradeResult = this.gradeDeterminationService.findGrade(
          gradeTable,
          currentStandard
        );
        if (currentGradeResult) {
          const currentGrade = currentGradeResult.grade;

          // 固定的賃金が変動した月を検出（前月と比較、支払基礎日数17日未満の月はスキップ）
          const changedMonths: number[] = [];
          let prevFixed = 0; // 基準固定費（支払基礎日数17日未満の月はスキップして維持）

          for (let month = 1; month <= 12; month++) {
            if (isNaN(month) || month < 1 || month > 12) {
              continue;
            }
            const currentMonthKey = `${emp.id}_${month}`;
            const currentMonthData = salaryDataForDetection[currentMonthKey];

            if (!currentMonthData) {
              continue;
            }

            // 支払基礎日数を取得
            const workingDaysKey = this.state.getWorkingDaysKey(emp.id, month);
            let workingDays = workingDaysData[workingDaysKey];
            if (workingDays === undefined || isNaN(workingDays)) {
              workingDays = new Date(year, month, 0).getDate();
            }
            if (isNaN(workingDays) || workingDays < 0 || workingDays > 31) {
              continue;
            }

            // 固定費を取得
            const currentFixed =
              currentMonthData.fixedTotal ??
              currentMonthData.fixed ??
              currentMonthData.fixedSalary ??
              0;

            // 支払基礎日数が17日未満の月は固定費のチェックをスキップ（基準固定費は維持）
            if (workingDays < 17) {
              // この月はスキップ。prevFixedは維持されたまま次の月へ
              continue;
            }

            // 前月と比較して変動があったか判定
            // 前月が支払基礎日数17日未満でスキップされた場合、prevFixedはその前の有効な月の固定費を保持している
            if (month > 1 && prevFixed > 0 && currentFixed !== prevFixed) {
              changedMonths.push(month);
            }

            // 基準固定費を更新（初月または前月のfixedが0の場合は、現在のfixedを記録）
            // 前月が支払基礎日数17日未満でスキップされた場合も、prevFixedは維持されているので、ここで更新する
            prevFixed = currentFixed;
          }

          // 報酬月額が変動した月について随時改定を判定
          // 変動月を含む3ヶ月（変動月、変動月+1、変動月+2）のデータがあれば判定可能
          for (const month of changedMonths) {
            if (isNaN(month) || month < 1 || month > 12) {
              continue;
            }
            // 支払基礎日数17日未満のチェック（変動月を含む3ヶ月）
            const targetMonths = [month, month + 1, month + 2];
            const hasInvalidWorkingDays = targetMonths.some((targetMonth) => {
              if (targetMonth > 12 || targetMonth < 1) return false; // 12月を超える、または1月未満の場合はスキップ
              const workingDaysKey = this.state.getWorkingDaysKey(
                emp.id,
                targetMonth
              );
              let workingDays = workingDaysData[workingDaysKey];

              // workingDaysDataに値がない場合、その月の日数をデフォルトとして使用
              // （saveAllSalariesの80-84行目と同じロジック）
              if (workingDays === undefined || isNaN(workingDays)) {
                workingDays = new Date(year, targetMonth, 0).getDate();
              }
              if (isNaN(workingDays) || workingDays < 0 || workingDays > 31) {
                return true; // 無効な値の場合は無効として扱う
              }

              // 支払基礎日数が17日未満（0日を含む）の場合は無効
              return workingDays < 17;
            });

            // 支払基礎日数17日未満の月が1つでもあれば随時改定をスキップ
            if (hasInvalidWorkingDays) {
              continue;
            }

            // 変動前の標準報酬を取得（変動月の前月時点の標準報酬）
            // 変動月が2月の場合、1月時点の標準報酬を基準にする
            // 前月が支払基礎日数17日未満の場合は、その前の有効な月を基準にする
            let prevStandard = currentStandard;

            // 変動月の前月から遡って、支払基礎日数17日以上の月の給与データから標準報酬を計算
            for (let checkMonth = month - 1; checkMonth >= 1; checkMonth--) {
              if (isNaN(checkMonth) || checkMonth < 1 || checkMonth > 12) {
                break;
              }
              const checkMonthKey = `${emp.id}_${checkMonth}`;
              const checkMonthData = salaryDataForDetection[checkMonthKey];

              if (!checkMonthData) {
                continue;
              }

              // 支払基礎日数を取得
              const checkWorkingDaysKey = this.state.getWorkingDaysKey(
                emp.id,
                checkMonth
              );
              let checkWorkingDays = workingDaysData[checkWorkingDaysKey];
              if (checkWorkingDays === undefined || isNaN(checkWorkingDays)) {
                checkWorkingDays = new Date(year, checkMonth, 0).getDate();
              }
              if (
                isNaN(checkWorkingDays) ||
                checkWorkingDays < 0 ||
                checkWorkingDays > 31
              ) {
                continue;
              }

              // 支払基礎日数が17日未満の月はスキップ
              if (checkWorkingDays < 17) {
                continue;
              }

              // 有効な月の報酬月額から標準報酬を取得
              const checkRemuneration = this.calculateRemunerationAmount(
                checkMonthData,
                checkMonthKey,
                salaryItemData,
                salaryItems
              );
              if (checkRemuneration !== null && checkRemuneration > 0) {
                const checkGradeResult =
                  this.gradeDeterminationService.findGrade(
                    gradeTable,
                    checkRemuneration
                  );
                if (checkGradeResult) {
                  prevStandard = checkGradeResult.remuneration;
                }
              }
              break; // 有効な月を見つけたら終了
            }

            // 変動前の標準報酬から現行等級を取得
            const prevGradeResult = this.gradeDeterminationService.findGrade(
              gradeTable,
              prevStandard
            );
            if (prevGradeResult) {
              const prevGrade = prevGradeResult.grade;

              // 過去3ヶ月の報酬月額平均を計算（変動月を含む3ヶ月）
              // 年度をまたぐ場合の処理（変動月が11-12月の場合、翌年の1-3月のデータが必要）
              let average: number | null = null;
              if (month >= 11 && month <= 12) {
                // 年度をまたぐ場合：当年の給与データと翌年の給与データを組み合わせる
                // 当年の給与データは既にsalaryDataForDetectionに含まれている
                // 翌年の1-3月の給与データを取得（変動月が11-12月の場合、翌年の1-3月のデータが必要）
                const nextYear = year + 1;
                const nextYearSalaryDataForDetection: {
                  [key: string]: MonthlySalaryData;
                } = {};
                const nextYearSalaryItemData: {
                  [key: string]: { [itemId: string]: number };
                } = {};

                // 翌年の1-3月の給与データを取得（既に保存されている場合）
                for (let nextMonth = 1; nextMonth <= 3; nextMonth++) {
                  const nextMonthData =
                    await this.monthlySalaryService.getEmployeeSalary(
                      roomId,
                      emp.id,
                      nextYear,
                      nextMonth
                    );
                  if (nextMonthData) {
                    const nextMonthKey = `${emp.id}_${nextMonth}`;
                    const nextItemKey = this.state.getSalaryItemKey(
                      emp.id,
                      nextMonth
                    );

                    // 給与項目別データから報酬月額を計算
                    if (
                      nextMonthData.salaryItems &&
                      Array.isArray(nextMonthData.salaryItems)
                    ) {
                      let fixedTotal = 0;
                      let variableTotal = 0;
                      nextYearSalaryItemData[nextItemKey] = {};

                      for (const entry of nextMonthData.salaryItems) {
                        nextYearSalaryItemData[nextItemKey][entry.itemId] =
                          entry.amount;
                        const item = salaryItems.find(
                          (i) => i.id === entry.itemId
                        );
                        if (item) {
                          const isBonus =
                            item.name === '賞与' ||
                            item.name.includes('賞与') ||
                            item.name.includes('ボーナス');
                          const isDeduction = item.type === 'deduction';

                          if (!isBonus && !isDeduction) {
                            if (item.type === 'fixed') {
                              fixedTotal += entry.amount;
                            } else if (item.type === 'variable') {
                              variableTotal += entry.amount;
                            }
                          }
                        }
                      }

                      nextYearSalaryDataForDetection[nextMonthKey] = {
                        fixedTotal: fixedTotal,
                        variableTotal: variableTotal,
                        total: fixedTotal + variableTotal,
                      };
                    } else {
                      // 後方互換性
                      const fixed =
                        nextMonthData.fixedSalary ?? nextMonthData.fixed ?? 0;
                      const variable =
                        nextMonthData.variableSalary ??
                        nextMonthData.variable ??
                        0;
                      const total =
                        nextMonthData.totalSalary ??
                        nextMonthData.total ??
                        fixed + variable;
                      nextYearSalaryDataForDetection[nextMonthKey] = {
                        fixedTotal: fixed,
                        variableTotal: variable,
                        total: total,
                      };
                    }
                  } else {
                    // 翌年のデータがまだ保存されていない場合は、当年の入力データから取得を試みる
                    const nextMonthKey = `${emp.id}_${nextMonth}`;
                    const nextItemKey = this.state.getSalaryItemKey(
                      emp.id,
                      nextMonth
                    );
                    const nextItemData = salaryItemData[nextItemKey];

                    if (nextItemData && salaryItems) {
                      let fixedTotal = 0;
                      let variableTotal = 0;

                      for (const item of salaryItems) {
                        const amount = nextItemData[item.id] || 0;
                        const isBonus =
                          item.name === '賞与' ||
                          item.name.includes('賞与') ||
                          item.name.includes('ボーナス');
                        const isDeduction = item.type === 'deduction';

                        if (!isBonus && !isDeduction) {
                          if (item.type === 'fixed') {
                            fixedTotal += amount;
                          } else if (item.type === 'variable') {
                            variableTotal += amount;
                          }
                        }
                      }

                      nextYearSalaryDataForDetection[nextMonthKey] = {
                        fixedTotal: fixedTotal,
                        variableTotal: variableTotal,
                        total: fixedTotal + variableTotal,
                      };
                      nextYearSalaryItemData[nextItemKey] = nextItemData;
                    } else {
                      const nextKey = this.state.getSalaryKey(
                        emp.id,
                        nextMonth
                      );
                      const nextSalaryData = salaries[nextKey];
                      if (nextSalaryData) {
                        nextYearSalaryDataForDetection[nextMonthKey] = {
                          fixedTotal: nextSalaryData.fixed,
                          variableTotal: nextSalaryData.variable,
                          total: nextSalaryData.total,
                        };
                      }
                    }
                  }
                }

                // 当年と翌年の給与データを統合
                const combinedSalaryData = {
                  ...salaryDataForDetection,
                  ...nextYearSalaryDataForDetection,
                };
                const combinedSalaryItemData = {
                  ...salaryItemData,
                  ...nextYearSalaryItemData,
                };

                // 年度をまたぐ場合の3ヶ月平均を計算
                average = this.suijiService.calculateThreeMonthAverage(
                  combinedSalaryData,
                  emp.id,
                  month,
                  combinedSalaryItemData,
                  salaryItems,
                  nextYearSalaryDataForDetection,
                  nextYearSalaryItemData
                );
              } else {
                // 年度をまたがない場合（既存の処理）
                average = this.suijiService.calculateThreeMonthAverage(
                  salaryDataForDetection,
                  emp.id,
                  month,
                  salaryItemData,
                  salaryItems
                );
              }

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
                    const applyStartMonthRaw = month + 3;
                    const applyStartMonth =
                      applyStartMonthRaw > 12
                        ? applyStartMonthRaw - 12
                        : applyStartMonthRaw;
                    const applyStartYear =
                      applyStartMonthRaw > 12 ? year + 1 : year;

                    const suijiResult: SuijiKouhoResult = {
                      employeeId: emp.id,
                      changeMonth: month,
                      averageSalary: average,
                      currentGrade: prevGrade,
                      newGrade: newGrade,
                      diff: diff,
                      applyStartMonth: applyStartMonth,
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

      // 前年10-12月の変動を検出（当年1-3月に適用開始される随時改定）
      // 前年の給与データを取得して変動を検出
      const prevYear = year - 1;
      if (prevYear >= 1900 && prevYear <= 2100) {
        const prevYearSalaryDataForDetection: {
          [key: string]: MonthlySalaryData;
        } = {};
        const prevYearSalaryItemData: {
          [key: string]: { [itemId: string]: number };
        } = {};
        const prevYearWorkingDaysData: { [key: string]: number } = {};

        // 前年9月から12月の給与データを取得
        for (let prevMonth = 9; prevMonth <= 12; prevMonth++) {
          const prevMonthData =
            await this.monthlySalaryService.getEmployeeSalary(
              roomId,
              emp.id,
              prevYear,
              prevMonth
            );
          if (prevMonthData) {
            const prevDetectionKey = `${emp.id}_${prevMonth}`;
            const prevItemKey = this.state.getSalaryItemKey(emp.id, prevMonth);

            // 給与項目別データから報酬月額を計算
            if (
              prevMonthData.salaryItems &&
              Array.isArray(prevMonthData.salaryItems)
            ) {
              let fixedTotal = 0;
              let variableTotal = 0;
              prevYearSalaryItemData[prevItemKey] = {};

              for (const entry of prevMonthData.salaryItems) {
                prevYearSalaryItemData[prevItemKey][entry.itemId] =
                  entry.amount;
                const item = salaryItems.find((i) => i.id === entry.itemId);
                if (item) {
                  const isBonus =
                    item.name === '賞与' ||
                    item.name.includes('賞与') ||
                    item.name.includes('ボーナス');
                  const isDeduction = item.type === 'deduction';

                  if (!isBonus && !isDeduction) {
                    if (item.type === 'fixed') {
                      fixedTotal += entry.amount;
                    } else if (item.type === 'variable') {
                      variableTotal += entry.amount;
                    }
                  }
                }
              }

              prevYearSalaryDataForDetection[prevDetectionKey] = {
                fixedTotal: fixedTotal,
                variableTotal: variableTotal,
                total: fixedTotal + variableTotal,
              };
            } else {
              // 後方互換性
              const fixed =
                prevMonthData.fixedSalary ?? prevMonthData.fixed ?? 0;
              const variable =
                prevMonthData.variableSalary ?? prevMonthData.variable ?? 0;
              const total =
                prevMonthData.totalSalary ??
                prevMonthData.total ??
                fixed + variable;
              prevYearSalaryDataForDetection[prevDetectionKey] = {
                fixedTotal: fixed,
                variableTotal: variable,
                total: total,
              };
            }

            // 支払基礎日数を取得
            const prevWorkingDaysKey = this.state.getWorkingDaysKey(
              emp.id,
              prevMonth
            );
            if (prevMonthData.workingDays !== undefined) {
              prevYearWorkingDaysData[prevWorkingDaysKey] =
                prevMonthData.workingDays;
            }
          }
        }

        // 前年10-12月の変動を検出
        if (Object.keys(prevYearSalaryDataForDetection).length > 0) {
          // 前年9月を基準に前年10-12月の変動を検出
          const prevYearChangedMonths: number[] = [];
          let prevYearPrevFixed = 0;

          // 前年9月の固定給を基準に設定
          const prevYearSepKey = `${emp.id}_9`;
          const prevYearSepData =
            prevYearSalaryDataForDetection[prevYearSepKey];
          if (prevYearSepData) {
            const prevYearSepWorkingDaysKey = this.state.getWorkingDaysKey(
              emp.id,
              9
            );
            const prevYearSepWorkingDays =
              prevYearWorkingDaysData[prevYearSepWorkingDaysKey];
            if (
              prevYearSepWorkingDays === undefined ||
              prevYearSepWorkingDays >= 17
            ) {
              prevYearPrevFixed =
                prevYearSepData.fixedTotal ??
                prevYearSepData.fixed ??
                prevYearSepData.fixedSalary ??
                0;
            }
          }

          // 前年10-12月の変動を検出
          for (let prevMonth = 10; prevMonth <= 12; prevMonth++) {
            const prevMonthKey = `${emp.id}_${prevMonth}`;
            const prevMonthData = prevYearSalaryDataForDetection[prevMonthKey];

            if (!prevMonthData) {
              continue;
            }

            // 支払基礎日数を取得
            const prevWorkingDaysKey = this.state.getWorkingDaysKey(
              emp.id,
              prevMonth
            );
            let prevWorkingDays = prevYearWorkingDaysData[prevWorkingDaysKey];
            if (prevWorkingDays === undefined || isNaN(prevWorkingDays)) {
              prevWorkingDays = new Date(prevYear, prevMonth, 0).getDate();
            }
            if (
              isNaN(prevWorkingDays) ||
              prevWorkingDays < 0 ||
              prevWorkingDays > 31
            ) {
              continue;
            }

            // 固定費を取得
            const prevCurrentFixed =
              prevMonthData.fixedTotal ??
              prevMonthData.fixed ??
              prevMonthData.fixedSalary ??
              0;

            // 支払基礎日数が17日未満の月は固定費のチェックをスキップ
            if (prevWorkingDays < 17) {
              continue;
            }

            // 前月と比較して変動があったか判定
            if (
              prevYearPrevFixed > 0 &&
              prevCurrentFixed !== prevYearPrevFixed
            ) {
              prevYearChangedMonths.push(prevMonth);
            }

            // 基準固定費を更新
            prevYearPrevFixed = prevCurrentFixed;
          }

          // 前年10-12月の変動について随時改定を判定
          for (const prevChangeMonth of prevYearChangedMonths) {
            // 支払基礎日数17日未満のチェック（変動月を含む3ヶ月）
            const prevTargetMonths = [
              prevChangeMonth,
              prevChangeMonth + 1,
              prevChangeMonth + 2,
            ];
            const prevHasInvalidWorkingDays = prevTargetMonths.some(
              (targetMonth) => {
                let checkMonth = targetMonth;
                let checkYear = prevYear;
                if (checkMonth > 12) {
                  checkMonth = checkMonth - 12;
                  checkYear = prevYear + 1;
                }

                if (checkYear === prevYear) {
                  // 前年の月
                  const prevWorkingDaysKey = this.state.getWorkingDaysKey(
                    emp.id,
                    checkMonth
                  );
                  let prevWorkingDays =
                    prevYearWorkingDaysData[prevWorkingDaysKey];
                  if (prevWorkingDays === undefined || isNaN(prevWorkingDays)) {
                    prevWorkingDays = new Date(
                      prevYear,
                      checkMonth,
                      0
                    ).getDate();
                  }
                  if (
                    isNaN(prevWorkingDays) ||
                    prevWorkingDays < 0 ||
                    prevWorkingDays > 31
                  ) {
                    return true;
                  }
                  return prevWorkingDays < 17;
                } else {
                  // 当年の月（1-3月）
                  const workingDaysKey = this.state.getWorkingDaysKey(
                    emp.id,
                    checkMonth
                  );
                  let workingDays = workingDaysData[workingDaysKey];
                  if (workingDays === undefined || isNaN(workingDays)) {
                    workingDays = new Date(year, checkMonth, 0).getDate();
                  }
                  if (
                    isNaN(workingDays) ||
                    workingDays < 0 ||
                    workingDays > 31
                  ) {
                    return true;
                  }
                  return workingDays < 17;
                }
              }
            );

            // 支払基礎日数17日未満の月が1つでもあれば随時改定をスキップ
            if (prevHasInvalidWorkingDays) {
              continue;
            }

            // 変動前の標準報酬を取得（前年9月時点の標準報酬）
            let prevYearPrevStandard = currentStandard;
            const prevYearSepKey = `${emp.id}_9`;
            const prevYearSepData =
              prevYearSalaryDataForDetection[prevYearSepKey];
            if (prevYearSepData) {
              const prevYearSepRemuneration = this.calculateRemunerationAmount(
                prevYearSepData,
                prevYearSepKey,
                prevYearSalaryItemData,
                salaryItems
              );
              if (
                prevYearSepRemuneration !== null &&
                prevYearSepRemuneration > 0
              ) {
                const prevYearGradeTable =
                  await this.settingsService.getStandardTable(prevYear);
                const prevYearSepGradeResult =
                  this.gradeDeterminationService.findGrade(
                    prevYearGradeTable,
                    prevYearSepRemuneration
                  );
                if (prevYearSepGradeResult) {
                  prevYearPrevStandard = prevYearSepGradeResult.remuneration;
                }
              }
            }

            // 変動前の標準報酬から現行等級を取得
            const prevYearGradeTable =
              await this.settingsService.getStandardTable(prevYear);
            const prevYearPrevGradeResult =
              this.gradeDeterminationService.findGrade(
                prevYearGradeTable,
                prevYearPrevStandard
              );
            if (prevYearPrevGradeResult) {
              const prevYearPrevGrade = prevYearPrevGradeResult.grade;

              // 当年1-3月の給与データを取得（年度をまたぐ場合に必要）
              const nextYearSalaryDataForDetection: {
                [key: string]: MonthlySalaryData;
              } = {};
              const nextYearSalaryItemData: {
                [key: string]: { [itemId: string]: number };
              } = {};

              for (let nextMonth = 1; nextMonth <= 3; nextMonth++) {
                const nextMonthKey = `${emp.id}_${nextMonth}`;
                const nextItemKey = this.state.getSalaryItemKey(
                  emp.id,
                  nextMonth
                );
                const nextItemData = salaryItemData[nextItemKey];

                if (nextItemData && salaryItems) {
                  let fixedTotal = 0;
                  let variableTotal = 0;

                  for (const item of salaryItems) {
                    const amount = nextItemData[item.id] || 0;
                    const isBonus =
                      item.name === '賞与' ||
                      item.name.includes('賞与') ||
                      item.name.includes('ボーナス');
                    const isDeduction = item.type === 'deduction';

                    if (!isBonus && !isDeduction) {
                      if (item.type === 'fixed') {
                        fixedTotal += amount;
                      } else if (item.type === 'variable') {
                        variableTotal += amount;
                      }
                    }
                  }

                  nextYearSalaryDataForDetection[nextMonthKey] = {
                    fixedTotal: fixedTotal,
                    variableTotal: variableTotal,
                    total: fixedTotal + variableTotal,
                  };
                  nextYearSalaryItemData[nextItemKey] = nextItemData;
                } else {
                  const nextKey = this.state.getSalaryKey(emp.id, nextMonth);
                  const nextSalaryData = salaries[nextKey];
                  if (nextSalaryData) {
                    nextYearSalaryDataForDetection[nextMonthKey] = {
                      fixedTotal: nextSalaryData.fixed,
                      variableTotal: nextSalaryData.variable,
                      total: nextSalaryData.total,
                    };
                  }
                }
              }

              // 前年と当年の給与データを統合
              const combinedSalaryData = {
                ...prevYearSalaryDataForDetection,
                ...nextYearSalaryDataForDetection,
              };
              const combinedSalaryItemData = {
                ...prevYearSalaryItemData,
                ...nextYearSalaryItemData,
              };

              // 年度をまたぐ場合の3ヶ月平均を計算
              const prevYearAverage =
                this.suijiService.calculateThreeMonthAverage(
                  combinedSalaryData,
                  emp.id,
                  prevChangeMonth,
                  combinedSalaryItemData,
                  prevYearGradeTable,
                  nextYearSalaryDataForDetection,
                  nextYearSalaryItemData
                );

              // 3ヶ月分のデータが揃わない場合はスキップ
              if (prevYearAverage !== null) {
                // 平均から新等級を求める
                const prevYearNewGrade = this.suijiService.getGradeFromAverage(
                  prevYearAverage,
                  prevYearGradeTable
                );

                if (prevYearNewGrade !== null) {
                  // 随時改定の本判定（等級差が2以上かチェック）
                  const prevYearDiff = Math.abs(
                    prevYearNewGrade - prevYearPrevGrade
                  );
                  const prevYearIsEligible = prevYearDiff >= 2;

                  if (prevYearIsEligible) {
                    const prevYearApplyStartMonthRaw = prevChangeMonth + 3;
                    const prevYearApplyStartMonth =
                      prevYearApplyStartMonthRaw > 12
                        ? prevYearApplyStartMonthRaw - 12
                        : prevYearApplyStartMonthRaw;
                    const prevYearApplyStartYear =
                      prevYearApplyStartMonthRaw > 12 ? prevYear + 1 : prevYear;

                    const prevYearSuijiResult: SuijiKouhoResult = {
                      employeeId: emp.id,
                      changeMonth: prevChangeMonth,
                      averageSalary: prevYearAverage,
                      currentGrade: prevYearPrevGrade,
                      newGrade: prevYearNewGrade,
                      diff: prevYearDiff,
                      applyStartMonth: prevYearApplyStartMonth,
                      reasons: [`等級差${prevYearDiff}で成立`],
                      isEligible: true,
                    };

                    // 前年度にアラートを保存（変動月が発生した年度）
                    await this.suijiService.saveSuijiKouho(
                      prevYear,
                      prevYearSuijiResult
                    );
                    suijiAlerts.push(prevYearSuijiResult);
                  }
                }
              }
            }
          }
        }
      }
    }

    // 保存後に標準報酬履歴を再生成（保険料計算で最新の標準報酬月額を使用するため）
    // エラーが発生しても保険料計算は継続する
    const historyPromises = employees
      .filter((emp) => emp && emp.id)
      .map((emp) =>
        this.standardRemunerationHistoryService
          .generateStandardRemunerationHistory(emp.id!, emp)
          .catch((error) => {
            console.error(
              `[monthly-salary-save] 標準報酬履歴の再生成に失敗しました（${
                emp.name || emp.id
              }）:`,
              error
            );
            // エラーが発生しても他の処理は続行
          })
      );

    // 並列実行（従業員数が多い場合でも大幅に高速化）
    await Promise.all(historyPromises);

    // 保存後に各月の保険料計算を実行して徴収不能アラートをチェック
    // 従業員ごとに都道府県を取得して計算する
    for (const emp of employees) {
      if (!emp || !emp.id) {
        continue;
      }
      const updatedEmployee = await this.employeeService.getEmployeeById(
        emp.id
      );
      if (updatedEmployee) {
        // idが確実に含まれるようにする
        if (!updatedEmployee.id) {
          updatedEmployee.id = emp.id;
        }

        // 従業員の都道府県を取得（デフォルトは東京）
        const prefecture = updatedEmployee.prefecture || 'tokyo';
        const rates = await this.settingsService.getRates(
          year.toString(),
          prefecture
        );

        if (rates) {
          // 保存された給与データを取得
          for (const month of months) {
            if (isNaN(month) || month < 1 || month > 12) {
              continue;
            }
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
