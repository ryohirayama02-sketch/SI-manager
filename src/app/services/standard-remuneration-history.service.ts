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

@Injectable({ providedIn: 'root' })
export class StandardRemunerationHistoryService {
  constructor(
    private firestore: Firestore,
    private monthlySalaryService: MonthlySalaryService,
    private salaryCalculationService: SalaryCalculationService,
    private settingsService: SettingsService,
    private roomIdService: RoomIdService,
    private suijiService: SuijiService
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
  async deleteStandardRemunerationHistory(historyId: string, employeeId: string): Promise<void> {
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
    // 履歴は降順ソートされているので、最初に見つかったものが該当する
    for (const history of histories) {
      const isApplicable =
        history.applyStartYear < year ||
        (history.applyStartYear === year && history.applyStartMonth <= month);

      if (isApplicable) {
        return history.standardMonthlyRemuneration;
      }
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

    // 資格取得時決定（入社時）の履歴を先に登録
    let joinDate: Date | null = employee.joinDate ? new Date(employee.joinDate) : null;
    if (joinDate && isNaN(joinDate.getTime())) {
      // 無効な日付の場合はnullに設定
      joinDate = null;
    }
    const acquisitionStandard =
      (employee as any).currentStandardMonthlyRemuneration ||
      (employee as any).acquisitionStandard ||
      null;
    let effectiveAcquisitionStandard = acquisitionStandard;
    // currentStandardMonthlyRemunerationが無い場合、月額賃金から算定して補完
    if (
      (!effectiveAcquisitionStandard ||
        effectiveAcquisitionStandard === 0 ||
        Number.isNaN(effectiveAcquisitionStandard)) &&
      (employee as any).monthlyWage
    ) {
      const wage = Number((employee as any).monthlyWage);
      if (!Number.isNaN(wage) && wage > 0 && joinDate) {
        const table = await this.settingsService.getStandardTable(
          joinDate.getFullYear()
        );
        const res = this.salaryCalculationService.getStandardMonthlyRemuneration(
          wage,
          table || []
        );
        effectiveAcquisitionStandard = res?.standard ?? wage;
      }
    }

    if (joinDate && effectiveAcquisitionStandard && effectiveAcquisitionStandard > 0) {
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
        }
      }
      if (!Object.keys(salaryData).length) continue;

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
          const total = (monthData.totalSalary ?? monthData.total ?? (fixed + variable)) - deductionTotal;
          salaries[key] = {
            total: total,
            fixed: fixed,
            variable: variable,
            workingDays: monthData.workingDays, // 支払基礎日数
            deductionTotal: deductionTotal, // 欠勤控除
          };
        }
      }

      // 標準報酬等級表を取得
      const gradeTable = await this.settingsService.getStandardTable(year);

      // 7月、8月、9月に随時改定の適用開始があるかチェック
      // 前年度と当年度の両方をチェック（年度をまたぐ場合があるため）
      const suijiAlertsCurrentYear = await this.suijiService.loadAlerts(year);
      const suijiAlertsPrevYear = year > 1900 ? await this.suijiService.loadAlerts(year - 1) : [];
      const allSuijiAlerts = [...suijiAlertsCurrentYear, ...suijiAlertsPrevYear];
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
        if (applyStartYear === year && (applyStartMonth === 7 || applyStartMonth === 8 || applyStartMonth === 9)) {
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
          if (suijiHistory.applyStartYear === year && 
              (suijiHistory.applyStartMonth === 7 || suijiHistory.applyStartMonth === 8 || suijiHistory.applyStartMonth === 9)) {
            hasSuijiIn789 = true;
            break;
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
          await this.deleteStandardRemunerationHistory(existingTeijiHistory.id!, employeeId);
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
      const existingHistoriesBefore = await this.getStandardRemunerationHistories(
        employeeId
      );
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
        const applyStartYearGradeTable = await this.settingsService.getStandardTable(
          applyStartYear
        );
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
            existingSuijiHistory.standardMonthlyRemuneration !== suijiStandard ||
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

        // 健康保険状態
        let healthStatus:
          | 'joined'
          | 'lost'
          | 'exempt_maternity'
          | 'exempt_childcare' = 'joined';
        if (age >= 75) {
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
        if (age >= 75) {
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
        if (age >= 70) {
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
