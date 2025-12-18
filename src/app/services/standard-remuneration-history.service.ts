import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
} from '@angular/fire/firestore';
import {
  StandardRemunerationHistory,
  InsuranceStatusHistory,
} from '../models/standard-remuneration-history.model';
import { Employee } from '../models/employee.model';
import { MonthlySalaryService } from './monthly-salary.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { SettingsService } from './settings.service';
import { RoomIdService } from './room-id.service';
import { SuijiService } from './suiji.service';
import { SuijiKouhoResult } from './salary-calculation.service';
import { EmployeeWorkCategoryService } from './employee-work-category.service';

@Injectable({ providedIn: 'root' })
export class StandardRemunerationHistoryService {
  constructor(
    private firestore: Firestore,
    private monthlySalaryService: MonthlySalaryService,
    private salaryCalculationService: SalaryCalculationService,
    private settingsService: SettingsService,
    private roomIdService: RoomIdService,
    private suijiService: SuijiService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService
  ) {}

  /**
   * 標準報酬履歴を保存
   */
  async saveStandardRemunerationHistory(
    history: StandardRemunerationHistory
  ): Promise<void> {
    if (!history) {
      throw new Error('標準報酬履歴が設定されていません');
    }
    if (!history.employeeId) {
      throw new Error('従業員IDが設定されていません');
    }
    // IDが指定されている場合は既存の履歴を更新、なければ新規作成
    const docId = history.id || `temp_${Date.now()}`;
    const roomId = this.roomIdService.requireRoomId();
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/employees/${history.employeeId}/standardRemunerationHistory/${docId}`
    );

    // 既存のドキュメントを取得してcreatedAtを保持
    const existingSnap = await getDoc(ref);
    let existingCreatedAt: Date;
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      if (existingData['createdAt']?.toDate) {
        existingCreatedAt = existingData['createdAt'].toDate();
      } else if (existingData['createdAt'] instanceof Date) {
        existingCreatedAt = existingData['createdAt'];
      } else {
        existingCreatedAt = history.createdAt || new Date();
      }
    } else {
      existingCreatedAt = history.createdAt || new Date();
    }

    // undefinedのフィールドを削除（Firestoreはundefinedをサポートしていない）
    const data: any = {
      employeeId: history.employeeId,
      applyStartYear: history.applyStartYear,
      applyStartMonth: history.applyStartMonth,
      grade: history.grade,
      standardMonthlyRemuneration: history.standardMonthlyRemuneration,
      determinationReason: history.determinationReason,
      updatedAt: new Date(),
      createdAt: existingCreatedAt,
    };

    // 値がある場合のみ追加
    if (history.memo) {
      data.memo = history.memo;
    }

    await setDoc(ref, data, { merge: true });
  }

  /**
   * 標準報酬履歴を削除
   */
  async deleteStandardRemunerationHistory(
    historyId: string,
    employeeId: string
  ): Promise<void> {
    if (!historyId) {
      throw new Error('履歴IDが設定されていません');
    }
    if (!employeeId) {
      throw new Error('従業員IDが設定されていません');
    }
    const roomId = this.roomIdService.requireRoomId();
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/employees/${employeeId}/standardRemunerationHistory/${historyId}`
    );
    await deleteDoc(ref);
  }

  /**
   * 従業員の標準報酬履歴を取得
   */
  async getStandardRemunerationHistories(
    employeeId: string
  ): Promise<StandardRemunerationHistory[]> {
    if (!employeeId) {
      return [];
    }
    const roomId = this.roomIdService.requireRoomId();
    const ref = collection(
      this.firestore,
      `rooms/${roomId}/employees/${employeeId}/standardRemunerationHistory`
    );
    const snapshot = await getDocs(ref);
    const histories = snapshot.docs.map((doc) => {
      const data = doc.data();
      // FirestoreのTimestampをDateに変換
      let createdAt: Date | undefined;
      if (data['createdAt']) {
        if (data['createdAt'].toDate) {
          createdAt = data['createdAt'].toDate();
        } else if (data['createdAt'] instanceof Date) {
          createdAt = data['createdAt'];
        }
      }
      let updatedAt: Date | undefined;
      if (data['updatedAt']) {
        if (data['updatedAt'].toDate) {
          updatedAt = data['updatedAt'].toDate();
        } else if (data['updatedAt'] instanceof Date) {
          updatedAt = data['updatedAt'];
        }
      }
      return {
        id: doc.id,
        ...data,
        createdAt,
        updatedAt,
      } as StandardRemunerationHistory;
    });
    // クライアント側でソート（applyStartYear, applyStartMonthで降順ソート）
    return histories.sort((a, b) => {
      if (a.applyStartYear !== b.applyStartYear) {
        return b.applyStartYear - a.applyStartYear;
      }
      return b.applyStartMonth - a.applyStartMonth;
    });
  }

  /**
   * 指定された年月に適用される標準報酬月額を取得
   * @param employeeId 従業員ID
   * @param year 年
   * @param month 月（1-12）
   * @returns 標準報酬月額（見つからない場合はnull）
   */
  async getStandardRemunerationForMonth(
    employeeId: string,
    year: number,
    month: number
  ): Promise<number | null> {
    if (!employeeId) {
      return null;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return null;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return null;
    }
    const histories = await this.getStandardRemunerationHistories(employeeId);

    // 指定された年月以前で最も新しい履歴を取得
    // 同じ適用開始年月の複数の履歴がある場合、随時改定を優先する
    const filteredHistories = histories.filter((h) => {
      // 適用開始年が選択年より前の場合
      if (h.applyStartYear < year) return true;
      // 適用開始年が選択年と同じで、適用開始月がその月以前の場合
      if (h.applyStartYear === year && h.applyStartMonth <= month) return true;
      return false;
    });

    // 優先順位に基づいてソート
    const sortedHistories = filteredHistories.sort((a, b) => {
      // 適用開始年で降順ソート（新しい年を優先）
      if (a.applyStartYear !== b.applyStartYear) {
        return b.applyStartYear - a.applyStartYear;
      }
      // 適用開始月で降順ソート（新しい月を優先）
      if (a.applyStartMonth !== b.applyStartMonth) {
        return b.applyStartMonth - a.applyStartMonth;
      }
      // 同じ適用開始年月の場合、随時改定を優先（'suiji' > 'teiji' > 'acquisition'）
      const priorityMap: { [key: string]: number } = {
        suiji: 3,
        teiji: 2,
        acquisition: 1,
      };
      const aPriority = priorityMap[a.determinationReason] || 0;
      const bPriority = priorityMap[b.determinationReason] || 0;
      return bPriority - aPriority;
    });

    // ソート後の先頭の履歴を返す
    if (sortedHistories.length > 0) {
      return sortedHistories[0].standardMonthlyRemuneration;
    }

    return null;
  }

  /**
   * 月次給与データから標準報酬履歴を自動生成
   * @param employeeId 従業員ID
   * @param employee 従業員情報
   * @param fromYear 処理開始年（指定されない場合は現在年-2）
   * @param toYear 処理終了年（指定されない場合は現在年+1）
   */
  async generateStandardRemunerationHistory(
    employeeId: string,
    employee: Employee,
    fromYear?: number,
    toYear?: number
  ): Promise<void> {
    if (!employeeId) {
      throw new Error('従業員IDが設定されていません');
    }
    if (!employee) {
      throw new Error('従業員情報が設定されていません');
    }
    const currentYear = new Date().getFullYear();

    // 処理範囲を決定
    let startYear: number;
    let endYear: number;

    if (fromYear !== undefined && toYear !== undefined) {
      // 指定された範囲を使用
      startYear = fromYear;
      endYear = toYear;
    } else {
      // デフォルト：過去2年から将来1年まで
      startYear = currentYear - 2;
      endYear = currentYear + 1;
    }

    // 年度の配列を生成
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      if (y >= 1900 && y <= 2100) {
        years.push(y);
      }
    }
    console.log(`[standard-remuneration-history] 処理対象年度`, {
      startYear,
      endYear,
      years,
    });

    // 資格取得時決定（入社時）の履歴を先に登録
    let joinDate: Date | null = employee.joinDate
      ? new Date(employee.joinDate)
      : null;
    if (joinDate && isNaN(joinDate.getTime())) {
      // 無効な日付の場合はnullに設定
      joinDate = null;
    }

    let effectiveAcquisitionStandard: number | null = null;
    if (joinDate) {
      const acquisitionYear = joinDate.getFullYear();
      const acquisitionMonth = joinDate.getMonth() + 1;
      
      // 資格取得月の月次給与入力の「総支給額（固定+非固定-欠勤控除）」を優先
      const roomId =
        (employee as any).roomId || this.roomIdService.requireRoomId();
      const monthSalaryData =
        await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          employeeId,
          acquisitionYear,
          acquisitionMonth
        );

      if (monthSalaryData) {
        const fixedSalary =
          monthSalaryData.fixedSalary ?? monthSalaryData.fixed ?? 0;
        const variableSalary =
          monthSalaryData.variableSalary ?? monthSalaryData.variable ?? 0;
        const deductionTotal = monthSalaryData.deductionTotal ?? 0;
        // 総支給額から欠勤控除を引いた値（固定+非固定-欠勤控除）
        const totalSalary =
          (monthSalaryData.totalSalary ??
            monthSalaryData.total ??
            fixedSalary + variableSalary) - deductionTotal;

        if (totalSalary > 0) {
          const gradeTable = await this.settingsService.getStandardTable(
            acquisitionYear
          );
          const result =
            this.salaryCalculationService.getStandardMonthlyRemuneration(
              totalSalary,
              gradeTable || []
            );
          effectiveAcquisitionStandard = result?.standard ?? null;
        }
      }

      // 月次給与入力がない場合、従業員情報のmonthlyWageから決定
      if (
        !effectiveAcquisitionStandard ||
        effectiveAcquisitionStandard === 0 ||
        Number.isNaN(effectiveAcquisitionStandard)
      ) {
        const monthlyWage = (employee as any).monthlyWage;
        if (monthlyWage) {
          const wage = Number(monthlyWage);
          if (!Number.isNaN(wage) && wage > 0) {
            const gradeTable = await this.settingsService.getStandardTable(
              acquisitionYear
            );
            const res =
              this.salaryCalculationService.getStandardMonthlyRemuneration(
                wage,
                gradeTable || []
              );
            effectiveAcquisitionStandard = res?.standard ?? wage;
          }
        }
      }
    }

    if (
      joinDate &&
      effectiveAcquisitionStandard &&
      effectiveAcquisitionStandard > 0
    ) {
      const acquisitionYear = joinDate.getFullYear();
      const acquisitionMonth = joinDate.getMonth() + 1;
      const gradeTable = await this.settingsService.getStandardTable(
        acquisitionYear
      );
      const result =
        this.salaryCalculationService.getStandardMonthlyRemuneration(
          effectiveAcquisitionStandard,
          gradeTable
        );
      const grade = result?.rank || 0;
      const existingHistories = await this.getStandardRemunerationHistories(
        employeeId
      );
      const existingAcquisition = existingHistories.find(
        (h) =>
          h.determinationReason === 'acquisition' &&
          h.applyStartYear === acquisitionYear &&
          h.applyStartMonth === acquisitionMonth
      );
      if (
        !existingAcquisition ||
        existingAcquisition.standardMonthlyRemuneration !==
          effectiveAcquisitionStandard ||
        existingAcquisition.grade !== grade
      ) {
        await this.saveStandardRemunerationHistory({
          id: existingAcquisition?.id,
          employeeId,
          applyStartYear: acquisitionYear,
          applyStartMonth: acquisitionMonth,
          grade: grade,
          standardMonthlyRemuneration: effectiveAcquisitionStandard,
          determinationReason: 'acquisition',
          memo: '資格取得時決定（入社時）',
          createdAt: existingAcquisition?.createdAt,
        });
      }
    }

    for (const year of years) {
      console.log(`[standard-remuneration-history] ${year}年: 処理開始`, {
        employeeId,
      });
      const roomId =
        (employee as any).roomId || this.roomIdService.requireRoomId();
      const salaryData: any = {};
      for (let m = 1; m <= 12; m++) {
        const monthData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          employeeId,
          year,
          m
        );
        if (monthData) {
          salaryData[m.toString()] = monthData;
          const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
          const variable = monthData.variableSalary ?? monthData.variable ?? 0;
          const total = monthData.totalSalary ?? monthData.total ?? 0;
          console.log(
            `[standard-remuneration-history] ${year}年${m}月: 月次給与データ取得`,
            {
              fixedSalary: fixed,
              variableSalary: variable,
              totalSalary: total,
              workingDays: monthData.workingDays,
              deductionTotal: monthData.deductionTotal ?? 0,
              rawData: monthData, // 生データも確認
              roomId,
              employeeId,
              year,
              month: m,
            }
          );
        }
      }
      console.log(
        `[standard-remuneration-history] ${year}年: 月次給与データ取得完了`,
        {
          monthsWithData: Object.keys(salaryData),
          salaryData: Object.keys(salaryData).reduce((acc: any, monthKey) => {
            const month = salaryData[monthKey];
            acc[monthKey] = {
              fixedSalary: month.fixedSalary ?? month.fixed ?? 0,
              variableSalary: month.variableSalary ?? month.variable ?? 0,
              totalSalary: month.totalSalary ?? month.total ?? 0,
              workingDays: month.workingDays,
              deductionTotal: month.deductionTotal ?? 0,
            };
            return acc;
          }, {}),
        }
      );
      if (!Object.keys(salaryData).length) {
        console.log(
          `[standard-remuneration-history] ${year}年: 月次給与データがないためスキップ`
        );
        continue;
      }

      // 給与データを整形
      const salaries: {
        [key: string]: {
          total: number;
          fixed: number;
          variable: number;
          workingDays?: number;
          deductionTotal?: number; // 欠勤控除
        };
      } = {};
      
      // 年度をまたぐ固定賃金の変動検出のため、前年度の12月のデータも取得
      let prevYearDecFixed = 0;
      if (year > 1900) {
        const prevYear = year - 1;
        const prevYearDecData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          employeeId,
          prevYear,
          12
        );
        if (prevYearDecData) {
          const prevYearDecWorkingDays = prevYearDecData.workingDays;
          // 支払基礎日数が17日未満の場合はスキップ
          if (prevYearDecWorkingDays === undefined || prevYearDecWorkingDays >= 17) {
            prevYearDecFixed = prevYearDecData.fixedSalary ?? prevYearDecData.fixed ?? 0;
          }
        }
      }
      
      for (let month = 1; month <= 12; month++) {
        const monthKey = month.toString();
        const monthData = salaryData[monthKey];
        if (monthData) {
          const key = this.salaryCalculationService.getSalaryKey(
            employeeId,
            month
          );
          const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
          const variable = monthData.variableSalary ?? monthData.variable ?? 0;
          const deductionTotal = monthData.deductionTotal ?? 0;
          // 総支給額から欠勤控除を引いた値（固定+非固定-欠勤控除）
          const total =
            (monthData.totalSalary ?? monthData.total ?? fixed + variable) -
            deductionTotal;
          salaries[key] = {
            total: total,
            fixed: fixed,
            variable: variable,
            workingDays: monthData.workingDays, // 支払基礎日数
            deductionTotal: deductionTotal, // 欠勤控除
          };
        }
      }
      
      // 年度をまたぐ固定賃金の変動検出（2024年12月→2025年1月も連続的にチェック）
      // 1月の変動検出時に前年度の12月のデータを使用
      if (prevYearDecFixed > 0) {
        const janKey = this.salaryCalculationService.getSalaryKey(employeeId, 1);
        const janData = salaries[janKey];
        if (janData) {
          const janWorkingDays = janData.workingDays;
          // 1月の支払基礎日数が17日未満の場合はスキップ
          if (janWorkingDays === undefined || janWorkingDays >= 17) {
            const janFixed = janData.fixed;
            // 前年度の12月と当年度の1月で固定賃金が変動している場合、1月を変動月として追加
            if (janFixed !== prevYearDecFixed) {
              // detectFixedSalaryChangesの結果に1月が含まれていない場合、手動で追加
              // ただし、detectFixedSalaryChangesは年度内の変動を検出するため、
              // 年度をまたぐ変動は別途処理する必要がある
            }
          }
        }
      }
      console.log(
        `[standard-remuneration-history] ${year}年: 給与データ整形完了`,
        {
          salariesKeys: Object.keys(salaries),
          salaries: Object.keys(salaries).reduce((acc: any, key) => {
            acc[key] = {
              fixed: salaries[key].fixed,
              variable: salaries[key].variable,
              total: salaries[key].total,
              workingDays: salaries[key].workingDays,
            };
            return acc;
          }, {}),
        }
      );

      // 標準報酬等級表を取得
      const gradeTable = await this.settingsService.getStandardTable(year);

      // 7月、8月、9月に随時改定の適用開始があるかチェック
      // 前年度と当年度の両方をチェック（年度をまたぐ場合があるため）
      const suijiAlertsCurrentYear = await this.suijiService.loadAlerts(year);
      const suijiAlertsPrevYear =
        year > 1900 ? await this.suijiService.loadAlerts(year - 1) : [];
      const allSuijiAlerts = [
        ...suijiAlertsCurrentYear,
        ...suijiAlertsPrevYear,
      ];
      const employeeSuijiAlerts = allSuijiAlerts.filter(
        (alert) => alert.employeeId === employeeId && alert.isEligible
      );

      // 既存の履歴を確認（随時改定の適用開始月をチェックするため）
      const existingHistories = await this.getStandardRemunerationHistories(
        employeeId
      );

      // 随時改定の適用開始月が7月、8月、9月のいずれかであるかをチェック
      // 既存の随時改定履歴も確認（アラートが削除されていても履歴が残っている場合がある）
      let hasSuijiIn789 = false;

      // アラートからチェック
      for (const suijiAlert of employeeSuijiAlerts) {
        const changeMonth = suijiAlert.changeMonth;
        const applyStartMonthRaw = changeMonth + 3;
        let applyStartYear = year;
        let applyStartMonth = applyStartMonthRaw;
        if (applyStartMonthRaw > 12) {
          applyStartMonth = applyStartMonthRaw - 12;
          applyStartYear = year + 1;
        }

        // 適用開始月が7月、8月、9月のいずれかで、かつ適用開始年がその年度の場合
        if (
          applyStartYear === year &&
          (applyStartMonth === 7 ||
            applyStartMonth === 8 ||
            applyStartMonth === 9)
        ) {
          hasSuijiIn789 = true;
          break;
        }
      }

      // 既存の随時改定履歴からもチェック（アラートが削除されていても履歴が残っている場合がある）
      if (!hasSuijiIn789) {
        const existingSuijiHistories = existingHistories.filter(
          (h) => h.determinationReason === 'suiji'
        );
        for (const suijiHistory of existingSuijiHistories) {
          // 適用開始月が7月、8月、9月のいずれかで、かつ適用開始年がその年度の場合
          if (
            suijiHistory.applyStartYear === year &&
            (suijiHistory.applyStartMonth === 7 ||
              suijiHistory.applyStartMonth === 8 ||
              suijiHistory.applyStartMonth === 9)
          ) {
            hasSuijiIn789 = true;
            break;
          }
        }
      }

      // 月次給与データから直接計算した随時改定もチェック（「更新」ボタン押下時の処理のため）
      // 変動月を検出して、適用開始月が7月、8月、9月のいずれかであるかをチェック
      if (!hasSuijiIn789) {
        const changeMonthsForCheck =
          this.salaryCalculationService.detectFixedSalaryChanges(
            employeeId,
            salaries
          );
        for (const changeMonth of changeMonthsForCheck) {
          const applyStartMonthRaw = changeMonth + 3;
          let applyStartYear = year;
          let applyStartMonth = applyStartMonthRaw;
          if (applyStartMonthRaw > 12) {
            applyStartMonth = applyStartMonthRaw - 12;
            applyStartYear = year + 1;
          }

          // 適用開始月が7月、8月、9月のいずれかで、かつ適用開始年がその年度の場合
          if (
            applyStartYear === year &&
            (applyStartMonth === 7 ||
              applyStartMonth === 8 ||
              applyStartMonth === 9)
          ) {
            // 変動月以前の最新の標準報酬月額を取得して随時改定を計算
            let currentStandard = 0;
            let currentGrade = 0;

            const historiesBeforeChange = existingHistories.filter((h) => {
              if (h.applyStartYear < year) {
                return true;
              }
              if (
                h.applyStartYear === year &&
                h.applyStartMonth < changeMonth
              ) {
                return true;
              }
              return false;
            });

            if (historiesBeforeChange.length > 0) {
              historiesBeforeChange.sort((a, b) => {
                if (a.applyStartYear !== b.applyStartYear) {
                  return b.applyStartYear - a.applyStartYear;
                }
                return b.applyStartMonth - a.applyStartMonth;
              });
              const latestHistory = historiesBeforeChange[0];
              currentStandard = latestHistory.standardMonthlyRemuneration || 0;
              currentGrade = latestHistory.grade || 0;
            }

            if (currentStandard === 0 || currentGrade === 0) {
              currentStandard =
                (employee as any).currentStandardMonthlyRemuneration ||
                (employee as any).acquisitionStandard ||
                0;
              if (currentStandard > 0) {
                const result =
                  this.salaryCalculationService.getStandardMonthlyRemuneration(
                    currentStandard,
                    gradeTable
                  );
                currentGrade = result?.rank || 0;
              }
            }

            if (currentStandard > 0 && currentGrade > 0) {
              const suijiResult =
                this.salaryCalculationService.calculateFixedSalaryChangeSuiji(
                  employeeId,
                  changeMonth,
                  salaries,
                  gradeTable,
                  currentGrade
                );
              if (suijiResult.willApply && suijiResult.applyMonth !== null) {
                hasSuijiIn789 = true;
                break;
              }
            }
          }
        }
      }

      // 定時決定を計算
      const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
        employeeId,
        salaries,
        gradeTable,
        year
      );

      const existingTeijiHistory = existingHistories.find(
        (h) =>
          h.applyStartYear === year &&
          h.applyStartMonth === 9 &&
          h.determinationReason === 'teiji'
      );

      // 7月、8月、9月に随時改定の適用開始がある場合、定時決定を保存しない（既存の履歴があれば削除）
      if (hasSuijiIn789) {
        if (existingTeijiHistory) {
          // 既存の定時決定履歴を削除
          await this.deleteStandardRemunerationHistory(
            existingTeijiHistory.id!,
            employeeId
          );
        }
        // 定時決定は実施しない（スキップ）
      } else if (teijiResult.standardMonthlyRemuneration > 0) {
        // 7月、8月、9月に随時改定がない場合のみ定時決定を保存
        // 既存の履歴がない場合、または計算結果が異なる場合は保存/更新
        if (
          !existingTeijiHistory ||
          existingTeijiHistory.standardMonthlyRemuneration !==
            teijiResult.standardMonthlyRemuneration ||
          existingTeijiHistory.grade !== teijiResult.grade
        ) {
          await this.saveStandardRemunerationHistory({
            id: existingTeijiHistory?.id, // 既存のIDがあれば使用（更新）、なければ新規作成
            employeeId,
            applyStartYear: year,
            applyStartMonth: 9,
            grade: teijiResult.grade,
            standardMonthlyRemuneration:
              teijiResult.standardMonthlyRemuneration,
            determinationReason: 'teiji',
            memo: `定時決定（${year}年4〜6月平均）`,
            createdAt: existingTeijiHistory?.createdAt, // 既存の履歴がある場合は元の作成日時を保持
          });
        }
      }

      // 随時改定の履歴を生成
      // 変動月+3か月目が適用開始月（変動月が10月なら、適用開始月は1月）
      // 注意: allSuijiAlertsは上で既に取得済み
      const employeeSuijiAlertsForHistory = allSuijiAlerts.filter(
        (alert) => alert.employeeId === employeeId && alert.isEligible
      );

      // 既存の随時改定履歴を確認（この年度のもの）
      const existingHistoriesBefore =
        await this.getStandardRemunerationHistories(employeeId);
      const existingSuijiHistoriesForYear = existingHistoriesBefore.filter(
        (h) =>
          h.determinationReason === 'suiji' &&
          (h.applyStartYear === year || h.applyStartYear === year + 1)
      );

      for (const suijiAlert of employeeSuijiAlertsForHistory) {
        const changeMonth = suijiAlert.changeMonth;
        const applyStartMonthRaw = changeMonth + 3;
        // 適用開始月の年度を計算（変動月+3が12を超える場合は翌年）
        let applyStartYear = year;
        let applyStartMonth = applyStartMonthRaw;
        if (applyStartMonthRaw > 12) {
          applyStartMonth = applyStartMonthRaw - 12;
          applyStartYear = year + 1;
        }

        // 標準報酬等級表から新しい等級に対応する標準報酬月額を取得
        const applyStartYearGradeTable =
          await this.settingsService.getStandardTable(applyStartYear);
        const newGradeRow = applyStartYearGradeTable.find(
          (r: any) => r.rank === suijiAlert.newGrade
        );

        if (newGradeRow && newGradeRow.standard) {
          const suijiStandard = newGradeRow.standard;

          // 既存の履歴を確認
          const existingHistories = await this.getStandardRemunerationHistories(
            employeeId
          );

          // 同じ変動月の既存の随時改定履歴を全て削除（重複を防ぐため）
          const existingSuijiHistories = existingHistories.filter(
            (h) =>
              h.determinationReason === 'suiji' &&
              (h as any).changeMonth === changeMonth
          );

          // 既存の履歴を削除
          for (const existingHistory of existingSuijiHistories) {
            if (existingHistory.id) {
              await this.deleteStandardRemunerationHistory(
                existingHistory.id,
                employeeId
              );
            }
          }

          const existingSuijiHistory = existingHistories.find(
            (h) =>
              h.applyStartYear === applyStartYear &&
              h.applyStartMonth === applyStartMonth &&
              h.determinationReason === 'suiji' &&
              (h as any).changeMonth === changeMonth
          );

          // 既存の履歴がない場合、または計算結果が異なる場合は保存/更新
          if (
            !existingSuijiHistory ||
            existingSuijiHistory.standardMonthlyRemuneration !==
              suijiStandard ||
            existingSuijiHistory.grade !== suijiAlert.newGrade
          ) {
            await this.saveStandardRemunerationHistory({
              id: existingSuijiHistory?.id,
              employeeId,
              applyStartYear: applyStartYear,
              applyStartMonth: applyStartMonth,
              grade: suijiAlert.newGrade,
              standardMonthlyRemuneration: suijiStandard,
              determinationReason: 'suiji',
              memo: `随時改定（変動月: ${year}年${changeMonth}月、適用開始: ${applyStartYear}年${applyStartMonth}月）`,
              createdAt: existingSuijiHistory?.createdAt,
            });
          }
        }
      }

      // アラートに依存せず、月次給与データから直接随時改定を計算・更新
      // 「更新」ボタン押下時に、最新の月次入力データから随時改定を再計算する
      console.log(
        `[standard-remuneration-history] ${year}年: 月次給与データから随時改定を計算開始`,
        {
          employeeId,
          salariesKeys: Object.keys(salaries),
          salaries: Object.keys(salaries).reduce((acc: any, key) => {
            acc[key] = {
              fixed: salaries[key].fixed,
              variable: salaries[key].variable,
              total: salaries[key].total,
              workingDays: salaries[key].workingDays,
            };
            return acc;
          }, {}),
        }
      );
      const changeMonths =
        this.salaryCalculationService.detectFixedSalaryChanges(
          employeeId,
          salaries
        );
      
      // 年度をまたぐ固定賃金の変動検出（2024年12月→2025年1月も連続的にチェック）
      // 1月の変動検出時に前年度の12月のデータを使用
      if (prevYearDecFixed > 0) {
        const janKey = this.salaryCalculationService.getSalaryKey(employeeId, 1);
        const janData = salaries[janKey];
        if (janData) {
          const janWorkingDays = janData.workingDays;
          // 1月の支払基礎日数が17日未満の場合はスキップ
          if (janWorkingDays === undefined || janWorkingDays >= 17) {
            const janFixed = janData.fixed;
            // 前年度の12月と当年度の1月で固定賃金が変動している場合、1月を変動月として追加
            if (janFixed !== prevYearDecFixed && !changeMonths.includes(1)) {
              changeMonths.push(1);
              console.log(
                `[standard-remuneration-history] ${year}年: 年度をまたぐ変動検出（前年度12月→当年度1月）`,
                { prevYearDecFixed, janFixed }
              );
            }
          }
        }
      }
      
      console.log(
        `[standard-remuneration-history] ${year}年: 検出された変動月`,
        changeMonths
      );

      // 変動月ごとに随時改定を計算
      for (const changeMonth of changeMonths) {
        console.log(
          `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の処理開始`
        );
        // 変動月以前の最新の標準報酬月額を取得
        // 変動月の前月（changeMonth - 1）に適用されている標準報酬月額を取得
        let currentStandard = 0;
        let currentGrade = 0;

        // 変動月の前月に適用されている標準報酬月額を取得
        let targetYear = year;
        let targetMonth = changeMonth - 1;
        if (targetMonth < 1) {
          targetMonth = 12;
          targetYear = year - 1;
        }

        console.log(
          `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の前月（${targetYear}年${targetMonth}月）の標準報酬月額を取得`
        );

        currentStandard =
          (await this.getStandardRemunerationForMonth(
            employeeId,
            targetYear,
            targetMonth
          )) || 0;

        if (currentStandard > 0) {
          const result =
            this.salaryCalculationService.getStandardMonthlyRemuneration(
              currentStandard,
              gradeTable
            );
          currentGrade = result?.rank || 0;
          console.log(
            `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の前月から取得`,
            { currentStandard, currentGrade, targetYear, targetMonth }
          );
        }

        // 従業員情報から取得を試みる（履歴がない場合）
        if (currentStandard === 0 || currentGrade === 0) {
          console.log(
            `[standard-remuneration-history] ${year}年: 履歴から取得できなかったため、従業員情報から取得を試みる`
          );
          currentStandard =
            (employee as any).currentStandardMonthlyRemuneration ||
            (employee as any).acquisitionStandard ||
            0;
          if (currentStandard > 0) {
            const result =
              this.salaryCalculationService.getStandardMonthlyRemuneration(
                currentStandard,
                gradeTable
              );
            currentGrade = result?.rank || 0;
            console.log(
              `[standard-remuneration-history] ${year}年: 従業員情報から取得`,
              { currentStandard, currentGrade }
            );
          }
        }

        // 現在の標準報酬月額が取得できない場合はスキップ
        if (currentStandard === 0 || currentGrade === 0) {
          continue;
        }

        // 随時改定を計算
        // 変動月を含む3か月の給与データを確認
        const monthsForSuiji = [changeMonth, changeMonth + 1, changeMonth + 2];
        const suijiMonthsData: any = {};
        for (const m of monthsForSuiji) {
          if (m <= 12) {
            const key = this.salaryCalculationService.getSalaryKey(
              employeeId,
              m
            );
            if (salaries[key]) {
              suijiMonthsData[m] = salaries[key];
            }
          }
        }
        console.log(
          `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の随時改定を計算`,
          {
            currentGrade,
            suijiMonthsData,
            allSalaries: Object.keys(salaries).reduce((acc: any, key) => {
              acc[key] = salaries[key];
              return acc;
            }, {}),
          }
        );
        const suijiResult =
          this.salaryCalculationService.calculateFixedSalaryChangeSuiji(
            employeeId,
            changeMonth,
            salaries,
            gradeTable,
            currentGrade
          );
        console.log(
          `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の随時改定結果`,
          {
            ...suijiResult,
            suijiMonthsData: Object.keys(suijiMonthsData).reduce(
              (acc: any, m) => {
                acc[m] = {
                  fixed: suijiMonthsData[m].fixed,
                  variable: suijiMonthsData[m].variable,
                  total: suijiMonthsData[m].total,
                  workingDays: suijiMonthsData[m].workingDays,
                  deductionTotal: suijiMonthsData[m].deductionTotal,
                };
                return acc;
              },
              {}
            ),
            calculatedAverage: suijiResult.averageSalary,
          }
        );

        // 随時改定が適用される場合
        if (suijiResult.willApply && suijiResult.applyMonth !== null) {
          console.log(
            `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の随時改定が適用される`
          );
          const applyStartMonthRaw = suijiResult.applyMonth;
          let applyStartYear = year;
          let applyStartMonth = applyStartMonthRaw;
          if (applyStartMonthRaw > 12) {
            applyStartMonth = applyStartMonthRaw - 12;
            applyStartYear = year + 1;
          }

          // 標準報酬等級表から新しい等級に対応する標準報酬月額を取得
          const applyStartYearGradeTable =
            await this.settingsService.getStandardTable(applyStartYear);
          const newGradeRow = applyStartYearGradeTable.find(
            (r: any) => r.rank === suijiResult.newGrade
          );

          if (newGradeRow && newGradeRow.standard) {
            const suijiStandard = newGradeRow.standard;

            // 既存の履歴を確認
            const existingHistoriesForSuiji =
              await this.getStandardRemunerationHistories(employeeId);

            // 同じ変動月の既存の随時改定履歴を全て削除（重複を防ぐため）
            const existingSuijiHistories = existingHistoriesForSuiji.filter(
              (h) =>
                h.determinationReason === 'suiji' &&
                (h as any).changeMonth === changeMonth
            );

            // 既存の履歴を削除
            for (const existingHistory of existingSuijiHistories) {
              if (existingHistory.id) {
                await this.deleteStandardRemunerationHistory(
                  existingHistory.id,
                  employeeId
                );
              }
            }

            const existingSuijiHistory = existingHistoriesForSuiji.find(
              (h) =>
                h.applyStartYear === applyStartYear &&
                h.applyStartMonth === applyStartMonth &&
                h.determinationReason === 'suiji' &&
                (h as any).changeMonth === changeMonth
            );

            // 既存の履歴がない場合、または計算結果が異なる場合は保存/更新
            if (
              !existingSuijiHistory ||
              existingSuijiHistory.standardMonthlyRemuneration !==
                suijiStandard ||
              existingSuijiHistory.grade !== suijiResult.newGrade
            ) {
              console.log(
                `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の随時改定履歴を保存/更新`,
                {
                  applyStartYear,
                  applyStartMonth,
                  grade: suijiResult.newGrade,
                  standardMonthlyRemuneration: suijiStandard,
                }
              );
              await this.saveStandardRemunerationHistory({
                id: existingSuijiHistory?.id,
                employeeId,
                applyStartYear: applyStartYear,
                applyStartMonth: applyStartMonth,
                grade: suijiResult.newGrade,
                standardMonthlyRemuneration: suijiStandard,
                determinationReason: 'suiji',
                memo: `随時改定（変動月: ${year}年${changeMonth}月、適用開始: ${applyStartYear}年${applyStartMonth}月）`,
                createdAt: existingSuijiHistory?.createdAt,
                changeMonth: changeMonth, // 変動月を記録
              } as any);
            } else {
              console.log(
                `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の随時改定履歴は変更なし`
              );
            }
          }
        } else {
          // 随時改定が適用されない場合、既存の履歴を削除（条件を満たさなくなった場合）
          console.log(
            `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の随時改定は適用されないため、既存履歴を削除`
          );
          const existingHistoriesForSuiji =
            await this.getStandardRemunerationHistories(employeeId);
          const existingSuijiHistories = existingHistoriesForSuiji.filter(
            (h) =>
              h.determinationReason === 'suiji' &&
              (h as any).changeMonth === changeMonth
          );

          // 既存の履歴を削除
          for (const existingHistory of existingSuijiHistories) {
            if (existingHistory.id) {
              console.log(
                `[standard-remuneration-history] ${year}年: 変動月${changeMonth}月の既存履歴を削除`,
                existingHistory.id
              );
              await this.deleteStandardRemunerationHistory(
                existingHistory.id,
                employeeId
              );
            }
          }
        }
      }

      // 既存の随時改定履歴で、変動月が検出されていないものも削除（月次入力が削除された場合など）
      // また、後続の随時改定履歴がある場合、前の履歴の適用期間を制限する必要がある
      const allExistingHistories = await this.getStandardRemunerationHistories(
        employeeId
      );

      // この年度で検出された変動月の適用開始年月を取得
      const applyStartMonthsForYear: Array<{ year: number; month: number }> =
        [];
      for (const changeMonth of changeMonths) {
        const applyStartMonthRaw = changeMonth + 3;
        let applyStartYear = year;
        let applyStartMonth = applyStartMonthRaw;
        if (applyStartMonthRaw > 12) {
          applyStartMonth = applyStartMonthRaw - 12;
          applyStartYear = year + 1;
        }
        applyStartMonthsForYear.push({
          year: applyStartYear,
          month: applyStartMonth,
        });
      }

      // 既存の随時改定履歴を確認
      const existingSuijiHistoriesToCheck = allExistingHistories.filter(
        (h) => h.determinationReason === 'suiji'
      );

      for (const existingSuijiHistory of existingSuijiHistoriesToCheck) {
        const changeMonth = (existingSuijiHistory as any).changeMonth;
        let shouldDelete = false;

        // 1. 変動月が検出されていない場合、履歴を削除
        if (changeMonth !== undefined && !changeMonths.includes(changeMonth)) {
          // ただし、この年度の適用開始年月の範囲内の履歴のみチェック
          if (
            existingSuijiHistory.applyStartYear === year ||
            existingSuijiHistory.applyStartYear === year + 1
          ) {
            shouldDelete = true;
          }
        }

        // 2. 後続の随時改定履歴がある場合、前の履歴を削除
        // この年度で検出された変動月の適用開始年月より前の履歴を全て削除
        // ただし、既存の履歴が処理対象年度より前の年度の場合は削除しない（年度をまたいだ削除を防ぐ）
        if (!shouldDelete && applyStartMonthsForYear.length > 0) {
          const existingApplyStart = {
            year: existingSuijiHistory.applyStartYear,
            month: existingSuijiHistory.applyStartMonth,
          };

          // この年度で検出された変動月の適用開始年月のうち、最も早いものを取得
          const earliestApplyStart = applyStartMonthsForYear.reduce(
            (earliest, current) => {
              if (
                current.year < earliest.year ||
                (current.year === earliest.year &&
                  current.month < earliest.month)
              ) {
                return current;
              }
              return earliest;
            }
          );

          // 既存の履歴の適用開始年月が、新しい履歴の適用開始年月より前の場合、削除
          // ただし、同じ年度内でのみ削除する（年度をまたいだ削除は行わない）
          // 既存の履歴が処理対象年度より前の年度の場合は削除しない
          if (
            existingApplyStart.year >= year &&
            existingApplyStart.year === earliestApplyStart.year &&
            existingApplyStart.month < earliestApplyStart.month
          ) {
            // 既存の履歴を削除（後続の履歴で上書きされる）
            shouldDelete = true;
            console.log(
              `[standard-remuneration-history] ${year}年: 後続の随時改定履歴があるため、前の履歴を削除`,
              {
                existingHistory: {
                  applyStartYear: existingApplyStart.year,
                  applyStartMonth: existingApplyStart.month,
                  standardMonthlyRemuneration:
                    existingSuijiHistory.standardMonthlyRemuneration,
                  changeMonth,
                },
                newApplyStart: earliestApplyStart,
              }
            );
          }
        }

        if (shouldDelete && existingSuijiHistory.id) {
          console.log(
            `[standard-remuneration-history] ${year}年: 履歴を削除します`,
            {
              historyId: existingSuijiHistory.id,
              applyStartYear: existingSuijiHistory.applyStartYear,
              applyStartMonth: existingSuijiHistory.applyStartMonth,
              standardMonthlyRemuneration:
                existingSuijiHistory.standardMonthlyRemuneration,
              changeMonth,
            }
          );
          await this.deleteStandardRemunerationHistory(
            existingSuijiHistory.id,
            employeeId
          );
          console.log(
            `[standard-remuneration-history] ${year}年: 履歴を削除しました`,
            {
              historyId: existingSuijiHistory.id,
            }
          );
        }
      }

      // 削除後の履歴を確認
      if (applyStartMonthsForYear.length > 0) {
        const afterDeleteHistories =
          await this.getStandardRemunerationHistories(employeeId);
        const suijiHistoriesAfterDelete = afterDeleteHistories.filter(
          (h) => h.determinationReason === 'suiji'
        );
        console.log(
          `[standard-remuneration-history] ${year}年: 削除後の随時改定履歴`,
          {
            count: suijiHistoriesAfterDelete.length,
            histories: suijiHistoriesAfterDelete.map((h) => ({
              applyStartYear: h.applyStartYear,
              applyStartMonth: h.applyStartMonth,
              standardMonthlyRemuneration: h.standardMonthlyRemuneration,
              changeMonth: (h as any).changeMonth,
            })),
          }
        );
      }
    }
  }

  /**
   * 社保加入履歴を保存
   */
  async saveInsuranceStatusHistory(
    history: InsuranceStatusHistory
  ): Promise<void> {
    if (!history) {
      throw new Error('社保加入履歴が設定されていません');
    }
    if (!history.employeeId) {
      throw new Error('従業員IDが設定されていません');
    }
    // 一意のIDを生成（employeeId_year_month）
    const docId =
      history.id || `${history.employeeId}_${history.year}_${history.month}`;
    const roomId = this.roomIdService.requireRoomId();
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/employees/${history.employeeId}/insuranceStatusHistories/${docId}`
    );
    // undefinedのフィールドを削除（Firestoreはundefinedをサポートしていない）
    const data: any = {
      employeeId: history.employeeId,
      year: history.year,
      month: history.month,
      healthInsuranceStatus: history.healthInsuranceStatus,
      careInsuranceStatus: history.careInsuranceStatus,
      pensionInsuranceStatus: history.pensionInsuranceStatus,
      updatedAt: new Date(),
      createdAt: history.createdAt || new Date(),
    };

    // 値がある場合のみ追加
    if (history.ageMilestone !== null && history.ageMilestone !== undefined) {
      data.ageMilestone = history.ageMilestone;
    }

    await setDoc(ref, data, { merge: true });
  }

  /**
   * 従業員の社保加入履歴を取得
   */
  async getInsuranceStatusHistories(
    employeeId: string,
    year?: number
  ): Promise<InsuranceStatusHistory[]> {
    if (!employeeId) {
      return [];
    }
    const roomId = this.roomIdService.requireRoomId();
    const ref = collection(
      this.firestore,
      `rooms/${roomId}/employees/${employeeId}/insuranceStatusHistories`
    );
    const snapshot = await getDocs(ref);
    const histories = snapshot.docs.map((doc) => {
      const data = doc.data();
      // FirestoreのTimestampをDateに変換
      let createdAt: Date | undefined;
      if (data['createdAt']) {
        if (data['createdAt'].toDate) {
          createdAt = data['createdAt'].toDate();
        } else if (data['createdAt'] instanceof Date) {
          createdAt = data['createdAt'];
        }
      }
      let updatedAt: Date | undefined;
      if (data['updatedAt']) {
        if (data['updatedAt'].toDate) {
          updatedAt = data['updatedAt'].toDate();
        } else if (data['updatedAt'] instanceof Date) {
          updatedAt = data['updatedAt'];
        }
      }
      return {
        id: doc.id,
        ...data,
        createdAt,
        updatedAt,
      } as InsuranceStatusHistory;
    });

    // 同じ年月の重複を排除（最新のupdatedAtを持つものを優先、なければcreatedAt）
    const uniqueMap = new Map<string, InsuranceStatusHistory>();
    for (const history of histories) {
      const key = `${history.year}_${history.month}`;
      const existing = uniqueMap.get(key);

      if (!existing) {
        uniqueMap.set(key, history);
      } else {
        // より新しい更新日時を持つものを採用
        const existingTime =
          existing.updatedAt || existing.createdAt || new Date(0);
        const currentTime =
          history.updatedAt || history.createdAt || new Date(0);
        if (currentTime > existingTime) {
          uniqueMap.set(key, history);
        }
      }
    }

    // Mapから配列に変換してソート（year, monthで降順ソート）
    let filtered = Array.from(uniqueMap.values());
    if (year) {
      filtered = filtered.filter((h) => h.year === year);
    }
    const uniqueHistories = filtered;
    return uniqueHistories.sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year;
      }
      return b.month - a.month;
    });
  }

  /**
   * 従業員情報から社保加入履歴を自動生成
   */
  async generateInsuranceStatusHistory(
    employeeId: string,
    employee: Employee,
    years?: number[]
  ): Promise<void> {
    if (!employeeId) {
      throw new Error('従業員IDが設定されていません');
    }
    if (!employee) {
      throw new Error('従業員情報が設定されていません');
    }
    if (!employee.birthDate) {
      return; // 生年月日がない場合は処理をスキップ
    }
    // 年度が指定されていない場合は、選択可能な年度すべてを生成（2023-2026）
    if (!years) {
      years = [2023, 2024, 2025, 2026];
    }

    const roomId =
      (employee as any).roomId || this.roomIdService.requireRoomId();

    for (const year of years) {
      if (isNaN(year) || year < 1900 || year > 2100) {
        continue; // 無効な年度はスキップ
      }
      for (let month = 1; month <= 12; month++) {
        // 年齢計算（簡易版）
        const birthDate = new Date(employee.birthDate);
        if (isNaN(birthDate.getTime())) {
          continue; // 無効な生年月日はスキップ
        }
        const targetDate = new Date(year, month - 1, 1);
        if (isNaN(targetDate.getTime())) {
          continue; // 無効な日付はスキップ
        }
        let age = targetDate.getFullYear() - birthDate.getFullYear();
        const monthDiff = targetDate.getMonth() - birthDate.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && targetDate.getDate() < birthDate.getDate())
        ) {
          age--;
        }

        // 年齢到達の判定
        let ageMilestone: 40 | 65 | 70 | 75 | undefined;
        if (age === 40) ageMilestone = 40;
        if (age === 65) ageMilestone = 65;
        if (age === 70) ageMilestone = 70;
        if (age === 75) ageMilestone = 75;

        // 社会保険非加入の判定（勤務区分による）
        const isNonInsured =
          this.employeeWorkCategoryService.isNonInsured(employee);

        // 健康保険状態
        let healthStatus:
          | 'joined'
          | 'lost'
          | 'exempt_maternity'
          | 'exempt_childcare' = 'joined';
        // 社会保険非加入の場合は「喪失」として設定（他の条件より優先）
        if (isNonInsured) {
          healthStatus = 'lost';
        } else if (age >= 75) {
          healthStatus = 'lost';
        } else if (this.isInMaternityLeave(employee, year, month)) {
          healthStatus = 'exempt_maternity';
        } else if (this.isInChildcareLeave(employee, year, month)) {
          healthStatus = 'exempt_childcare';
        } else if (employee.retireDate) {
          const retireDate = new Date(employee.retireDate);
          if (!isNaN(retireDate.getTime())) {
            if (
              year === retireDate.getFullYear() &&
              month > retireDate.getMonth() + 1
            ) {
              healthStatus = 'lost';
            }
          }
        }

        // 介護保険状態
        let careStatus:
          | 'joined'
          | 'lost'
          | 'exempt_maternity'
          | 'exempt_childcare'
          | 'type1' = 'joined';
        // 社会保険非加入の場合は「喪失」として設定
        if (isNonInsured) {
          careStatus = 'lost';
        } else if (age >= 75) {
          careStatus = 'lost';
        } else if (age >= 65) {
          careStatus = 'type1';
        } else if (age < 40) {
          careStatus = 'lost';
        } else if (this.isInMaternityLeave(employee, year, month)) {
          careStatus = 'exempt_maternity';
        } else if (this.isInChildcareLeave(employee, year, month)) {
          careStatus = 'exempt_childcare';
        }

        // 厚生年金状態
        let pensionStatus:
          | 'joined'
          | 'lost'
          | 'exempt_maternity'
          | 'exempt_childcare' = 'joined';
        // 社会保険非加入の場合は「喪失」として設定
        if (isNonInsured) {
          pensionStatus = 'lost';
        } else if (age >= 70) {
          pensionStatus = 'lost';
        } else if (this.isInMaternityLeave(employee, year, month)) {
          pensionStatus = 'exempt_maternity';
        } else if (this.isInChildcareLeave(employee, year, month)) {
          pensionStatus = 'exempt_childcare';
        } else if (employee.retireDate) {
          const retireDate = new Date(employee.retireDate);
          if (!isNaN(retireDate.getTime())) {
            if (
              year === retireDate.getFullYear() &&
              month > retireDate.getMonth() + 1
            ) {
              pensionStatus = 'lost';
            }
          }
        }

        // 既存の履歴を確認（employeeId + year + monthで一意に特定）
        const existingDocId = `${employeeId}_${year}_${month}`;
        const existingRef = doc(
          this.firestore,
          `rooms/${roomId}/employees/${employeeId}/insuranceStatusHistories/${existingDocId}`
        );
        const existingSnap = await getDoc(existingRef);

        // 既存の履歴がない場合も、ある場合も更新（状態が変わっている可能性があるため）
        // IDを指定することで、同じ年月の履歴が重複しないようにする
        await this.saveInsuranceStatusHistory({
          id: existingDocId,
          employeeId,
          year,
          month,
          healthInsuranceStatus: healthStatus,
          careInsuranceStatus: careStatus,
          pensionInsuranceStatus: pensionStatus,
          ageMilestone,
        });
      }
    }
  }

  private isInMaternityLeave(
    employee: Employee,
    year: number,
    month: number
  ): boolean {
    if (!employee) {
      return false;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return false;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return false;
    }
    if (!employee.maternityLeaveStart || !employee.maternityLeaveEnd) {
      return false;
    }
    const start = new Date(employee.maternityLeaveStart);
    const end = new Date(employee.maternityLeaveEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return false;
    }
    const target = new Date(year, month - 1, 1);
    if (isNaN(target.getTime())) {
      return false;
    }
    return target >= start && target <= end;
  }

  private isInChildcareLeave(
    employee: Employee,
    year: number,
    month: number
  ): boolean {
    if (!employee) {
      return false;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return false;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      return false;
    }
    if (!employee.childcareLeaveStart || !employee.childcareLeaveEnd) {
      return false;
    }
    const start = new Date(employee.childcareLeaveStart);
    const end = new Date(employee.childcareLeaveEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return false;
    }
    const target = new Date(year, month - 1, 1);
    if (isNaN(target.getTime())) {
      return false;
    }
    return target >= start && target <= end;
  }
}
