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

    // デバッグログ: 保存前の情報
    console.log(
      `[STANDARD_REMUNERATION] SAVE_START | employeeId=${
        history.employeeId
      } | applyStartYear=${history.applyStartYear} | applyStartMonth=${
        history.applyStartMonth
      } | determinationReason=${history.determinationReason} | grade=${
        history.grade
      } | standardMonthlyRemuneration=${
        history.standardMonthlyRemuneration
      } | existingId=${history.id || 'none'}`
    );

    // 既存の履歴を取得
    const existingHistories = await this.getStandardRemunerationHistories(
      history.employeeId
    );

    // IDが指定されていない場合、同じ適用開始年月・同じ決定理由の既存履歴のIDを使用
    let historyId = history.id;
    if (!historyId) {
      const existingHistory = existingHistories.find(
        (h) =>
          h.applyStartYear === history.applyStartYear &&
          h.applyStartMonth === history.applyStartMonth &&
          h.determinationReason === history.determinationReason
      );
      if (existingHistory?.id) {
        historyId = existingHistory.id;
        console.log(
          `[STANDARD_REMUNERATION] SAVE_FOUND_EXISTING_ID | employeeId=${history.employeeId} | applyStartYear=${history.applyStartYear} | applyStartMonth=${history.applyStartMonth} | determinationReason=${history.determinationReason} | existingId=${historyId}`
        );
      }
    }

    // 同じ適用開始年月・同じ決定理由の既存履歴を削除（重複を防ぐため）
    // ただし、使用するIDの履歴は除外
    const duplicateHistories = existingHistories.filter(
      (h) =>
        h.applyStartYear === history.applyStartYear &&
        h.applyStartMonth === history.applyStartMonth &&
        h.determinationReason === history.determinationReason &&
        h.id !== historyId // 使用するIDの履歴は除外
    );

    if (duplicateHistories.length > 0) {
      console.log(
        `[STANDARD_REMUNERATION] SAVE_DELETE_DUPLICATES | employeeId=${
          history.employeeId
        } | applyStartYear=${history.applyStartYear} | applyStartMonth=${
          history.applyStartMonth
        } | determinationReason=${
          history.determinationReason
        } | duplicateCount=${
          duplicateHistories.length
        } | duplicateIds=[${duplicateHistories.map((d) => d.id).join(',')}]`
      );
    }

    for (const duplicate of duplicateHistories) {
      if (duplicate.id) {
        await this.deleteStandardRemunerationHistory(
          duplicate.id,
          history.employeeId
        );
      }
    }

    // IDが指定されている場合は既存の履歴を更新、なければ新規作成
    const docId = historyId || `temp_${Date.now()}`;
    const roomId = this.roomIdService.requireRoomId();
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/employees/${history.employeeId}/standardRemunerationHistory/${docId}`
    );

    // 既存のドキュメントを取得してcreatedAtを保持
    const existingSnap = await getDoc(ref);
    const isUpdate = existingSnap.exists();
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

    // デバッグログ: 保存後の情報
    console.log(
      `[STANDARD_REMUNERATION] SAVE_COMPLETE | employeeId=${history.employeeId} | applyStartYear=${history.applyStartYear} | applyStartMonth=${history.applyStartMonth} | determinationReason=${history.determinationReason} | grade=${history.grade} | standardMonthlyRemuneration=${history.standardMonthlyRemuneration} | docId=${docId} | isUpdate=${isUpdate}`
    );
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
   * 指定された年月に適用される標準報酬履歴オブジェクトを取得
   * @param employeeId 従業員ID
   * @param year 年
   * @param month 月（1-12）
   * @returns 標準報酬履歴オブジェクト（見つからない場合はnull）
   */
  async getApplicableStandardRemunerationHistory(
    employeeId: string,
    year: number,
    month: number
  ): Promise<StandardRemunerationHistory | null> {
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

    // デバッグログ: 取得した履歴を確認
    console.log(
      `[STANDARD_REMUNERATION] GET_APPLICABLE_START | employeeId=${employeeId} | year=${year} | month=${month} | histories count=${histories.length}`
    );
    if (histories.length > 0) {
      const historiesDetail = histories.map((h) => ({
        id: h.id,
        applyStartYear: h.applyStartYear,
        applyStartMonth: h.applyStartMonth,
        determinationReason: h.determinationReason,
        grade: h.grade,
        standardMonthlyRemuneration: h.standardMonthlyRemuneration,
      }));
      console.log(
        `[STANDARD_REMUNERATION] GET_APPLICABLE_ALL_HISTORIES | employeeId=${employeeId} | year=${year} | month=${month} | ${JSON.stringify(
          historiesDetail
        )}`
      );
    }

    // 指定された年月以前で最も新しい履歴を取得
    // 同じ適用開始年月の複数の履歴がある場合、随時改定を優先する
    const filteredHistories = histories.filter((h) => {
      // 適用開始年が選択年より前の場合
      if (h.applyStartYear < year) return true;
      // 適用開始年が選択年と同じで、適用開始月がその月以前の場合
      if (h.applyStartYear === year && h.applyStartMonth <= month) return true;
      return false;
    });

    // デバッグログ: フィルタリング後の履歴を確認
    console.log(
      `[STANDARD_REMUNERATION] GET_APPLICABLE_FILTERED | employeeId=${employeeId} | year=${year} | month=${month} | filteredHistories count=${filteredHistories.length}`
    );
    if (filteredHistories.length > 0) {
      const filteredDetail = filteredHistories.map((h) => ({
        id: h.id,
        applyStartYear: h.applyStartYear,
        applyStartMonth: h.applyStartMonth,
        determinationReason: h.determinationReason,
        grade: h.grade,
        standardMonthlyRemuneration: h.standardMonthlyRemuneration,
      }));
      console.log(
        `[STANDARD_REMUNERATION] GET_APPLICABLE_FILTERED_DETAIL | employeeId=${employeeId} | year=${year} | month=${month} | ${JSON.stringify(
          filteredDetail
        )}`
      );
    }

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

    // デバッグログ: ソート後の履歴を確認
    if (sortedHistories.length > 0) {
      const sortedDetail = sortedHistories.map((h, index) => ({
        index: index,
        id: h.id,
        applyStartYear: h.applyStartYear,
        applyStartMonth: h.applyStartMonth,
        determinationReason: h.determinationReason,
        grade: h.grade,
        standardMonthlyRemuneration: h.standardMonthlyRemuneration,
      }));
      console.log(
        `[STANDARD_REMUNERATION] GET_APPLICABLE_SORTED | employeeId=${employeeId} | year=${year} | month=${month} | sortedHistories count=${
          sortedHistories.length
        } | ${JSON.stringify(sortedDetail)}`
      );
    }

    // ソート後の先頭の履歴を返す
    if (sortedHistories.length > 0) {
      const result = sortedHistories[0];
      console.log(
        `[STANDARD_REMUNERATION] GET_APPLICABLE_RESULT | employeeId=${employeeId} | year=${year} | month=${month} | resultId=${result.id} | applyStartYear=${result.applyStartYear} | applyStartMonth=${result.applyStartMonth} | determinationReason=${result.determinationReason} | grade=${result.grade} | standardMonthlyRemuneration=${result.standardMonthlyRemuneration}`
      );
      return result;
    }

    console.log(
      `[STANDARD_REMUNERATION] GET_APPLICABLE_NO_RESULT | employeeId=${employeeId} | year=${year} | month=${month}`
    );
    return null;
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
    // デバッグログ: 6月の標準報酬月額取得を重点的に確認（7月の変動処理時に呼ばれる）
    const isJuneForJulyChange = month === 6;
    if (isJuneForJulyChange) {
      console.log(
        `[SUIJI_DEBUG] GET_STANDARD_FOR_MONTH_START | employeeId=${employeeId} | year=${year} | month=${month} | purpose=getting standard for July change detection`
      );
    }

    const history = await this.getApplicableStandardRemunerationHistory(
      employeeId,
      year,
      month
    );

    const result = history?.standardMonthlyRemuneration ?? null;

    // デバッグログ: 6月の標準報酬月額取得結果を重点的に確認
    if (isJuneForJulyChange) {
      console.log(
        `[SUIJI_DEBUG] GET_STANDARD_FOR_MONTH_RESULT | employeeId=${employeeId} | year=${year} | month=${month} | result=${result} | historyId=${
          history?.id || 'none'
        } | historyApplyStartYear=${
          history?.applyStartYear || 'none'
        } | historyApplyStartMonth=${
          history?.applyStartMonth || 'none'
        } | historyDeterminationReason=${
          history?.determinationReason || 'none'
        }`
      );
    }

    return result;
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
    const rangeCurrentYear = new Date().getFullYear();

    // 処理範囲を決定
    let startYear: number;
    let endYear: number;

    if (fromYear !== undefined && toYear !== undefined) {
      // 指定された範囲を使用
      startYear = fromYear;
      endYear = toYear;
    } else {
      // デフォルト：過去2年から将来1年まで
      startYear = rangeCurrentYear - 2;
      endYear = rangeCurrentYear + 1;
    }

    // 年度の配列を生成
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      if (y >= 1900 && y <= 2100) {
        years.push(y);
      }
    }

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
      const monthSalaryData = await this.monthlySalaryService.getEmployeeSalary(
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

        // 古い入社日の資格取得時決定の履歴を削除
        // 新しい入社年月と異なる資格取得時決定の履歴を探す
        const oldAcquisitionHistories = existingHistories.filter(
          (h) =>
            h.determinationReason === 'acquisition' &&
            (h.applyStartYear !== acquisitionYear ||
              h.applyStartMonth !== acquisitionMonth)
        );
        for (const oldHistory of oldAcquisitionHistories) {
          if (oldHistory.id) {
            await this.deleteStandardRemunerationHistory(
              oldHistory.id,
              employeeId
            );
          }
        }
      } else {
        // 既存の資格取得時決定が存在し、値も同じ場合でも、
        // 古い入社日の資格取得時決定の履歴を削除（入社日が変更された可能性があるため）
        const oldAcquisitionHistories = existingHistories.filter(
          (h) =>
            h.determinationReason === 'acquisition' &&
            (h.applyStartYear !== acquisitionYear ||
              h.applyStartMonth !== acquisitionMonth)
        );
        for (const oldHistory of oldAcquisitionHistories) {
          if (oldHistory.id) {
            await this.deleteStandardRemunerationHistory(
              oldHistory.id,
              employeeId
            );
          }
        }
      }
    }

    // 入社月から現在まで連続的に処理
    const roomId =
      (employee as any).roomId || this.roomIdService.requireRoomId();
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // 処理開始年月を決定（入社月または処理範囲の開始年1月）
    let processYear: number;
    let processMonth: number;
    if (joinDate) {
      processYear = joinDate.getFullYear();
      processMonth = joinDate.getMonth() + 1;
    } else {
      processYear = startYear;
      processMonth = 1;
    }

    // 処理終了年月を決定
    const endProcessYear = toYear !== undefined ? toYear : currentYear;
    const endProcessMonth = toYear !== undefined ? 12 : currentMonth;

    // デバッグログ: 処理範囲を確認
    console.log(
      `[STANDARD_REMUNERATION] PROCESS_RANGE | employeeId=${employeeId} | processStart=${processYear}/${processMonth} | processEnd=${endProcessYear}/${endProcessMonth} | startYear=${startYear} | endYear=${endYear}`
    );

    // 連続処理用の変数
    let prevFixed = 0; // 前月の固定給（変動検出用）
    const changeMonths: Array<{ year: number; month: number }> = []; // 変動月のリスト（年度情報を含む）
    const generatedApplyStartMonths: Array<{ year: number; month: number }> =
      []; // 生成された履歴の適用開始年月

    // 入社月から現在まで連続的にループ
    while (
      processYear < endProcessYear ||
      (processYear === endProcessYear && processMonth <= endProcessMonth)
    ) {
      // 該当月の給与データを取得
      const monthData = await this.monthlySalaryService.getEmployeeSalary(
        roomId,
        employeeId,
        processYear,
        processMonth
      );

      // 給与データがある場合のみ処理
      if (monthData) {
        const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
        const variable = monthData.variableSalary ?? monthData.variable ?? 0;
        const deductionTotal = monthData.deductionTotal ?? 0;
        const total =
          (monthData.totalSalary ?? monthData.total ?? fixed + variable) -
          deductionTotal;
        const workingDays = monthData.workingDays;

        // デバッグログ: 給与データを確認（2024年10-12月、2025年1-3月を重点的に）
        if (
          (processYear === 2024 && processMonth >= 10) ||
          (processYear === 2025 && processMonth <= 3)
        ) {
          console.log(
            `[STANDARD_REMUNERATION] SALARY_DATA | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | fixed=${fixed} | prevFixed=${prevFixed} | workingDays=${workingDays}`
          );
        }

        // 変動検出（前月と比較、年度境界を意識しない）
        // デバッグログ: 7月の変動検出を重点的に確認
        if (processMonth === 7) {
          console.log(
            `[SUIJI_DEBUG] CHANGE_DETECTION_CHECK | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | prevFixed=${prevFixed} | currentFixed=${fixed} | workingDays=${workingDays} | hasMonthData=${!!monthData}`
          );
        }

        if (prevFixed > 0 && fixed !== prevFixed) {
          // 支払基礎日数が17日未満の場合はスキップ
          if (workingDays === undefined || workingDays >= 17) {
            // 変動月を記録（年度と月の情報を含む）
            changeMonths.push({ year: processYear, month: processMonth });
            console.log(
              `[STANDARD_REMUNERATION] DETECTED_CHANGE | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | prevFixed=${prevFixed} | currentFixed=${fixed}`
            );
            // デバッグログ: 7月の変動検出を重点的に確認
            if (processMonth === 7) {
              console.log(
                `[SUIJI_DEBUG] CHANGE_DETECTED_JULY | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | prevFixed=${prevFixed} | currentFixed=${fixed} | changeMonthsCount=${changeMonths.length}`
              );
            }
          } else {
            console.log(
              `[STANDARD_REMUNERATION] CHANGE_SKIPPED_LOW_WORKING_DAYS | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | prevFixed=${prevFixed} | currentFixed=${fixed} | workingDays=${workingDays}`
            );
            // デバッグログ: 7月の変動がスキップされた場合
            if (processMonth === 7) {
              console.log(
                `[SUIJI_DEBUG] CHANGE_SKIPPED_JULY_LOW_WORKING_DAYS | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | prevFixed=${prevFixed} | currentFixed=${fixed} | workingDays=${workingDays}`
              );
            }
          }
        } else if (prevFixed > 0 && fixed === prevFixed) {
          // デバッグログ: 変動なしの場合（7月を重点的に）
          if (processMonth === 7) {
            console.log(
              `[SUIJI_DEBUG] NO_CHANGE_JULY | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | prevFixed=${prevFixed} | currentFixed=${fixed} | prevFixedEqualsFixed=${
                prevFixed === fixed
              }`
            );
          }
          // デバッグログ: 変動なしの場合（2024年10-12月、2025年1-3月を重点的に）
          if (
            (processYear === 2024 && processMonth >= 10) ||
            (processYear === 2025 && processMonth <= 3)
          ) {
            console.log(
              `[STANDARD_REMUNERATION] NO_CHANGE | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | prevFixed=${prevFixed} | currentFixed=${fixed}`
            );
          }
        } else if (prevFixed === 0) {
          // デバッグログ: prevFixedが0の場合（7月を重点的に）
          if (processMonth === 7) {
            console.log(
              `[SUIJI_DEBUG] PREV_FIXED_ZERO_JULY | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | prevFixed=${prevFixed} | currentFixed=${fixed}`
            );
          }
        }

        // 前月の固定給を更新（支払基礎日数が17日未満の場合はスキップして維持）
        const prevFixedBeforeUpdate = prevFixed;
        if (workingDays === undefined || workingDays >= 17) {
          if (prevFixed === 0) {
            prevFixed = fixed;
          } else {
            prevFixed = fixed;
          }
        }
        // デバッグログ: prevFixedの更新（7月を重点的に確認）
        if (processMonth === 7) {
          console.log(
            `[SUIJI_DEBUG] PREV_FIXED_UPDATE | employeeId=${employeeId} | year=${processYear} | month=${processMonth} | prevFixedBefore=${prevFixedBeforeUpdate} | prevFixedAfter=${prevFixed} | currentFixed=${fixed} | workingDays=${workingDays} | updated=${
              workingDays === undefined || workingDays >= 17
            }`
          );
        }
      }

      // 定時決定の処理（9月に年度の4-6月平均を計算）
      if (processMonth === 9) {
        const fiscalYear = processYear; // 4-6月が属する年度
        await this.processTeijiKettei(
          employeeId,
          employee,
          fiscalYear,
          roomId,
          generatedApplyStartMonths
        );
      }

      // 次の月へ
      processMonth++;
      if (processMonth > 12) {
        processMonth = 1;
        processYear++;
      }
    }

    // デバッグログ: 検出された変動月を確認
    console.log(
      `[STANDARD_REMUNERATION] DETECTED_CHANGES_SUMMARY | employeeId=${employeeId} | changeMonths count=${
        changeMonths.length
      } | ${JSON.stringify(changeMonths)}`
    );
    // デバッグログ: 7月の変動が含まれているか確認
    const julyChange = changeMonths.find((cm) => cm.month === 7);
    if (julyChange) {
      console.log(
        `[SUIJI_DEBUG] JULY_CHANGE_DETECTED | employeeId=${employeeId} | julyChange=${JSON.stringify(
          julyChange
        )} | changeMonthsCount=${changeMonths.length}`
      );
    } else {
      console.log(
        `[SUIJI_DEBUG] JULY_CHANGE_NOT_DETECTED | employeeId=${employeeId} | changeMonthsCount=${
          changeMonths.length
        } | changeMonths=${JSON.stringify(changeMonths)}`
      );
    }

    // 変動月ごとに随時改定を計算（連続処理で検出した変動月を処理）
    for (const changeMonthInfo of changeMonths) {
      console.log(
        `[STANDARD_REMUNERATION] PROCESSING_SUIJI | employeeId=${employeeId} | changeYear=${changeMonthInfo.year} | changeMonth=${changeMonthInfo.month}`
      );
      // デバッグログ: 随時改定処理の開始（7月の変動を重点的に確認）
      if (changeMonthInfo.month === 7) {
        console.log(
          `[SUIJI_DEBUG] PROCESSING_SUIJI_JULY_START | employeeId=${employeeId} | changeYear=${
            changeMonthInfo.year
          } | changeMonth=${
            changeMonthInfo.month
          } | changeMonthsIndex=${changeMonths.indexOf(
            changeMonthInfo
          )} | changeMonthsTotal=${
            changeMonths.length
          } | generatedApplyStartMonthsBefore=${JSON.stringify(
            generatedApplyStartMonths
          )}`
        );
      }
      await this.processSuijiKoutei(
        employeeId,
        employee,
        changeMonthInfo.year,
        changeMonthInfo.month,
        roomId,
        generatedApplyStartMonths
      );
      // デバッグログ: 随時改定処理の終了（7月の変動を重点的に確認）
      if (changeMonthInfo.month === 7) {
        console.log(
          `[SUIJI_DEBUG] PROCESSING_SUIJI_JULY_END | employeeId=${employeeId} | changeYear=${
            changeMonthInfo.year
          } | changeMonth=${
            changeMonthInfo.month
          } | generatedApplyStartMonthsAfter=${JSON.stringify(
            generatedApplyStartMonths
          )}`
        );
      }
    }

    // 古い履歴のクリーンアップ
    await this.cleanupOldHistories(
      employeeId,
      joinDate,
      generatedApplyStartMonths,
      startYear,
      endYear
    );
  }

  /**
   * 定時決定を処理（9月に年度の4-6月平均を計算）
   */
  private async processTeijiKettei(
    employeeId: string,
    employee: Employee,
    fiscalYear: number,
    roomId: string,
    generatedApplyStartMonths: Array<{ year: number; month: number }>
  ): Promise<void> {
    // 年度の4-6月の給与データを取得
    const salaries: {
      [key: string]: {
        total: number;
        fixed: number;
        variable: number;
        workingDays?: number;
        deductionTotal?: number;
      };
    } = {};

    for (let month = 4; month <= 6; month++) {
      const monthData = await this.monthlySalaryService.getEmployeeSalary(
        roomId,
        employeeId,
        fiscalYear,
        month
      );
      if (monthData) {
        const key = this.salaryCalculationService.getSalaryKey(
          employeeId,
          month
        );
        const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
        const variable = monthData.variableSalary ?? monthData.variable ?? 0;
        const deductionTotal = monthData.deductionTotal ?? 0;
        const total =
          (monthData.totalSalary ?? monthData.total ?? fixed + variable) -
          deductionTotal;
        salaries[key] = {
          total: total,
          fixed: fixed,
          variable: variable,
          workingDays: monthData.workingDays,
          deductionTotal: deductionTotal,
        };
      }
    }

    if (Object.keys(salaries).length === 0) {
      return;
    }

    // 標準報酬等級表を取得
    const gradeTable = await this.settingsService.getStandardTable(fiscalYear);

    // 7月、8月、9月に随時改定の適用開始があるかチェック
    const existingHistories = await this.getStandardRemunerationHistories(
      employeeId
    );
    let hasSuijiIn789 = false;

    // 既存の随時改定履歴からチェック
    const existingSuijiHistories = existingHistories.filter(
      (h) => h.determinationReason === 'suiji'
    );
    for (const suijiHistory of existingSuijiHistories) {
      if (
        suijiHistory.applyStartYear === fiscalYear &&
        (suijiHistory.applyStartMonth === 7 ||
          suijiHistory.applyStartMonth === 8 ||
          suijiHistory.applyStartMonth === 9)
      ) {
        hasSuijiIn789 = true;
        break;
      }
    }

    // 定時決定を計算
    const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
      employeeId,
      salaries,
      gradeTable,
      fiscalYear
    );

    const existingTeijiHistory = existingHistories.find(
      (h) =>
        h.applyStartYear === fiscalYear &&
        h.applyStartMonth === 9 &&
        h.determinationReason === 'teiji'
    );

    // 7月、8月、9月に随時改定の適用開始がある場合、定時決定を保存しない
    if (hasSuijiIn789) {
      if (existingTeijiHistory) {
        await this.deleteStandardRemunerationHistory(
          existingTeijiHistory.id!,
          employeeId
        );
      }
    } else if (teijiResult.standardMonthlyRemuneration > 0) {
      if (
        !existingTeijiHistory ||
        existingTeijiHistory.standardMonthlyRemuneration !==
          teijiResult.standardMonthlyRemuneration ||
        existingTeijiHistory.grade !== teijiResult.grade
      ) {
        await this.saveStandardRemunerationHistory({
          id: existingTeijiHistory?.id,
          employeeId,
          applyStartYear: fiscalYear,
          applyStartMonth: 9,
          grade: teijiResult.grade,
          standardMonthlyRemuneration: teijiResult.standardMonthlyRemuneration,
          determinationReason: 'teiji',
          memo: `定時決定（${fiscalYear}年4〜6月平均）`,
          createdAt: existingTeijiHistory?.createdAt,
        });
      }
      generatedApplyStartMonths.push({ year: fiscalYear, month: 9 });
    }
  }

  /**
   * 随時改定を処理
   */
  private async processSuijiKoutei(
    employeeId: string,
    employee: Employee,
    changeYear: number,
    changeMonth: number,
    roomId: string,
    generatedApplyStartMonths: Array<{ year: number; month: number }>
  ): Promise<void> {
    // デバッグログ: 随時改定処理の開始（7月の変動を重点的に確認）
    if (changeMonth === 7) {
      console.log(
        `[SUIJI_DEBUG] PROCESS_SUIJI_START | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | generatedApplyStartMonths=${JSON.stringify(
          generatedApplyStartMonths
        )}`
      );
    }

    // 変動月の前月に適用されている標準報酬月額を取得
    let targetYear = changeYear;
    let targetMonth = changeMonth - 1;
    if (targetMonth < 1) {
      targetMonth = 12;
      targetYear = changeYear - 1;
    }

    // デバッグログ: 標準報酬月額取得前の情報（7月の変動を重点的に確認）
    if (changeMonth === 7) {
      console.log(
        `[SUIJI_DEBUG] GET_STANDARD_BEFORE | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | targetYear=${targetYear} | targetMonth=${targetMonth}`
      );
    }

    // 変動月に適用開始される随時改定があるかチェック
    // 例：4月変動→7月適用開始、7月変動の場合、7月に適用される標準報酬月額を基準にする
    // 注意：変動月は時系列順に処理されるため、先に処理された変動による履歴が既に存在する
    let currentStandard = 0;

    // 変動月に適用開始される履歴を取得（既存のメソッドを活用）
    const applicableHistoryInChangeMonth =
      await this.getApplicableStandardRemunerationHistory(
        employeeId,
        changeYear,
        changeMonth
      );

    if (
      applicableHistoryInChangeMonth &&
      applicableHistoryInChangeMonth.applyStartYear === changeYear &&
      applicableHistoryInChangeMonth.applyStartMonth === changeMonth
    ) {
      // 変動月が随時改定の適用開始月と同じ場合、変動月に適用される標準報酬月額を基準にする
      currentStandard =
        applicableHistoryInChangeMonth.standardMonthlyRemuneration || 0;
      console.log(
        `[SUIJI_DEBUG] USING_APPLICABLE_STANDARD_IN_CHANGE_MONTH | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applicableStandard=${currentStandard} | applicableHistoryId=${applicableHistoryInChangeMonth.id} | determinationReason=${applicableHistoryInChangeMonth.determinationReason}`
      );
    } else {
      // 通常通り、変動月の前月に適用されている標準報酬月額を取得
      currentStandard =
        (await this.getStandardRemunerationForMonth(
          employeeId,
          targetYear,
          targetMonth
        )) || 0;
    }

    // デバッグログ: 標準報酬月額取得後の情報（7月の変動を重点的に確認）
    if (changeMonth === 7) {
      console.log(
        `[SUIJI_DEBUG] GET_STANDARD_AFTER | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | targetYear=${targetYear} | targetMonth=${targetMonth} | currentStandard=${currentStandard} | usedApplicableHistory=${
          applicableHistoryInChangeMonth &&
          applicableHistoryInChangeMonth.applyStartYear === changeYear &&
          applicableHistoryInChangeMonth.applyStartMonth === changeMonth
        }`
      );
    }

    if (currentStandard === 0) {
      const fallbackStandard =
        (employee as any).currentStandardMonthlyRemuneration ||
        (employee as any).acquisitionStandard ||
        0;
      // デバッグログ: フォールバック処理（7月の変動を重点的に確認）
      if (changeMonth === 7) {
        console.log(
          `[SUIJI_DEBUG] STANDARD_FALLBACK | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | fallbackStandard=${fallbackStandard} | employeeCurrentStandard=${
            (employee as any).currentStandardMonthlyRemuneration
          } | employeeAcquisitionStandard=${
            (employee as any).acquisitionStandard
          }`
        );
      }
      currentStandard = fallbackStandard;
    }

    // 標準報酬等級表を取得（変動月の年度）
    const gradeTable = await this.settingsService.getStandardTable(changeYear);
    let currentGrade = 0;

    if (currentStandard > 0) {
      const result =
        this.salaryCalculationService.getStandardMonthlyRemuneration(
          currentStandard,
          gradeTable
        );
      currentGrade = result?.rank || 0;
    }

    // デバッグログ: 標準報酬月額と等級の確認（7月の変動を重点的に確認）
    if (changeMonth === 7) {
      console.log(
        `[SUIJI_DEBUG] STANDARD_AND_GRADE_CHECK | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | currentStandard=${currentStandard} | currentGrade=${currentGrade} | willReturn=${
          currentStandard === 0 || currentGrade === 0
        }`
      );
    }

    if (currentStandard === 0 || currentGrade === 0) {
      // デバッグログ: 早期リターン（7月の変動を重点的に確認）
      if (changeMonth === 7) {
        console.log(
          `[SUIJI_DEBUG] EARLY_RETURN | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | currentStandard=${currentStandard} | currentGrade=${currentGrade} | reason=${
            currentStandard === 0 ? 'currentStandard is 0' : 'currentGrade is 0'
          }`
        );
      }
      return;
    }

    // 変動月を含む3ヶ月の給与データを取得
    const salariesForSuiji: {
      [key: string]: {
        total: number;
        fixed: number;
        variable: number;
        workingDays?: number;
        deductionTotal?: number;
      };
    } = {};

    for (let i = 0; i < 3; i++) {
      const month = changeMonth + i;
      let year = changeYear;
      let actualMonth = month;
      if (month > 12) {
        actualMonth = month - 12;
        year = changeYear + 1;
      }

      const monthData = await this.monthlySalaryService.getEmployeeSalary(
        roomId,
        employeeId,
        year,
        actualMonth
      );

      if (monthData) {
        const key = this.salaryCalculationService.getSalaryKey(
          employeeId,
          actualMonth
        );
        const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
        const variable = monthData.variableSalary ?? monthData.variable ?? 0;
        const deductionTotal = monthData.deductionTotal ?? 0;
        const total =
          (monthData.totalSalary ?? monthData.total ?? fixed + variable) -
          deductionTotal;
        salariesForSuiji[key] = {
          total: total,
          fixed: fixed,
          variable: variable,
          workingDays: monthData.workingDays,
          deductionTotal: deductionTotal,
        };
      }
    }

    // デバッグログ: 3ヶ月の給与データ取得結果（7月の変動を重点的に確認）
    if (changeMonth === 7) {
      console.log(
        `[SUIJI_DEBUG] SALARIES_FOR_SUIJI | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | salariesForSuijiKeys=${Object.keys(
          salariesForSuiji
        ).join(',')} | salariesForSuijiCount=${
          Object.keys(salariesForSuiji).length
        }`
      );
      for (const [key, salary] of Object.entries(salariesForSuiji)) {
        console.log(
          `[SUIJI_DEBUG] SALARY_DATA_DETAIL | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | key=${key} | total=${salary.total} | fixed=${salary.fixed} | variable=${salary.variable} | workingDays=${salary.workingDays}`
        );
      }
    }

    if (Object.keys(salariesForSuiji).length === 0) {
      // デバッグログ: 給与データなしで早期リターン（7月の変動を重点的に確認）
      if (changeMonth === 7) {
        console.log(
          `[SUIJI_DEBUG] EARLY_RETURN_NO_SALARIES | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | reason=salariesForSuiji is empty`
        );
      }
      return;
    }

    // 随時改定を計算
    const suijiResult =
      this.salaryCalculationService.calculateFixedSalaryChangeSuiji(
        employeeId,
        changeMonth,
        salariesForSuiji,
        gradeTable,
        currentGrade
      );

    // デバッグログ: 随時改定の計算結果を確認（7月の変動を重点的に確認）
    console.log(
      `[STANDARD_REMUNERATION] SUIJI_RESULT | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | willApply=${suijiResult.willApply} | applyMonth=${suijiResult.applyMonth} | currentGrade=${currentGrade} | newGrade=${suijiResult.newGrade} | diff=${suijiResult.diff}`
    );
    if (changeMonth === 7) {
      console.log(
        `[SUIJI_DEBUG] SUIJI_RESULT_JULY | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | willApply=${
          suijiResult.willApply
        } | applyMonth=${
          suijiResult.applyMonth
        } | currentGrade=${currentGrade} | newGrade=${
          suijiResult.newGrade
        } | diff=${suijiResult.diff} | averageSalary=${
          suijiResult.averageSalary
        } | reasons=${JSON.stringify(suijiResult.reasons)}`
      );
    }

    // 随時改定が適用される場合
    if (suijiResult.willApply && suijiResult.applyMonth !== null) {
      // 適用開始月を計算（変動月の3ヶ月後）
      // 注意: suijiResult.applyMonthは既に1-12に正規化されているため、
      // changeMonth + 3で年度をまたぐかどうかを判定する必要がある
      const applyStartMonthRaw = changeMonth + 3;
      let applyStartYear = changeYear;
      let applyStartMonth = applyStartMonthRaw;
      if (applyStartMonthRaw > 12) {
        applyStartMonth = applyStartMonthRaw - 12;
        applyStartYear = changeYear + 1;
      }

      // デバッグログ: 適用開始年月を確認
      console.log(
        `[STANDARD_REMUNERATION] APPLY_START_CALC | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applyStartMonthRaw=${applyStartMonthRaw} | applyStartYear=${applyStartYear} | applyStartMonth=${applyStartMonth}`
      );
      // デバッグログ: 適用開始年月の計算結果（7月の変動を重点的に確認）
      if (changeMonth === 7) {
        console.log(
          `[SUIJI_DEBUG] APPLY_START_CALC_JULY | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applyStartMonthRaw=${applyStartMonthRaw} | applyStartYear=${applyStartYear} | applyStartMonth=${applyStartMonth}`
        );
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

        // デバッグログ: 既存の履歴確認（7月の変動を重点的に確認）
        if (changeMonth === 7) {
          console.log(
            `[SUIJI_DEBUG] EXISTING_HISTORIES_CHECK | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applyStartYear=${applyStartYear} | applyStartMonth=${applyStartMonth} | existingHistoriesCount=${existingHistoriesForSuiji.length}`
          );
          const existingHistoriesDetail = existingHistoriesForSuiji.map(
            (h) => ({
              id: h.id,
              applyStartYear: h.applyStartYear,
              applyStartMonth: h.applyStartMonth,
              determinationReason: h.determinationReason,
              changeMonth: (h as any).changeMonth,
              changeYear: (h as any).changeYear,
              grade: h.grade,
              standardMonthlyRemuneration: h.standardMonthlyRemuneration,
            })
          );
          console.log(
            `[SUIJI_DEBUG] EXISTING_HISTORIES_DETAIL | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | ${JSON.stringify(
              existingHistoriesDetail
            )}`
          );
        }

        // 同じ変動月の既存の随時改定履歴を全て削除
        const existingSuijiHistories = existingHistoriesForSuiji.filter(
          (h) =>
            h.determinationReason === 'suiji' &&
            (h as any).changeMonth === changeMonth &&
            (h as any).changeYear === changeYear
        );

        // デバッグログ: 同じ変動月の既存履歴削除（7月の変動を重点的に確認）
        if (changeMonth === 7) {
          console.log(
            `[SUIJI_DEBUG] DELETE_EXISTING_SAME_CHANGE_MONTH | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | existingSuijiHistoriesCount=${existingSuijiHistories.length}`
          );
        }

        for (const existingHistory of existingSuijiHistories) {
          if (existingHistory.id) {
            // デバッグログ: 既存履歴の削除（7月の変動を重点的に確認）
            if (changeMonth === 7) {
              console.log(
                `[SUIJI_DEBUG] DELETING_EXISTING_HISTORY | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | existingHistoryId=${existingHistory.id} | applyStartYear=${existingHistory.applyStartYear} | applyStartMonth=${existingHistory.applyStartMonth}`
              );
            }
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
            (h as any).changeMonth === changeMonth &&
            (h as any).changeYear === changeYear
        );

        // デバッグログ: 既存履歴の検索結果（7月の変動を重点的に確認）
        if (changeMonth === 7) {
          console.log(
            `[SUIJI_DEBUG] EXISTING_HISTORY_FOUND | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applyStartYear=${applyStartYear} | applyStartMonth=${applyStartMonth} | existingSuijiHistory=${
              existingSuijiHistory ? 'found' : 'not found'
            } | existingSuijiHistoryId=${existingSuijiHistory?.id || 'none'}`
          );
        }

        // 既存の履歴がない場合、または計算結果が異なる場合は保存/更新
        const shouldSave =
          !existingSuijiHistory ||
          existingSuijiHistory.standardMonthlyRemuneration !== suijiStandard ||
          existingSuijiHistory.grade !== suijiResult.newGrade;

        // デバッグログ: 保存判定（7月の変動を重点的に確認）
        if (changeMonth === 7) {
          console.log(
            `[SUIJI_DEBUG] SAVE_DECISION | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applyStartYear=${applyStartYear} | applyStartMonth=${applyStartMonth} | shouldSave=${shouldSave} | existingSuijiHistory=${
              existingSuijiHistory ? 'exists' : 'not exists'
            } | existingStandard=${
              existingSuijiHistory?.standardMonthlyRemuneration || 'none'
            } | newStandard=${suijiStandard} | existingGrade=${
              existingSuijiHistory?.grade || 'none'
            } | newGrade=${suijiResult.newGrade}`
          );
        }

        if (shouldSave) {
          // デバッグログ: 保存前（7月の変動を重点的に確認）
          if (changeMonth === 7) {
            console.log(
              `[SUIJI_DEBUG] SAVING_SUIJI_HISTORY | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applyStartYear=${applyStartYear} | applyStartMonth=${applyStartMonth} | grade=${suijiResult.newGrade} | standardMonthlyRemuneration=${suijiStandard}`
            );
          }
          await this.saveStandardRemunerationHistory({
            id: existingSuijiHistory?.id,
            employeeId,
            applyStartYear: applyStartYear,
            applyStartMonth: applyStartMonth,
            grade: suijiResult.newGrade,
            standardMonthlyRemuneration: suijiStandard,
            determinationReason: 'suiji',
            memo: `随時改定（変動月: ${changeYear}年${changeMonth}月、適用開始: ${applyStartYear}年${applyStartMonth}月）`,
            createdAt: existingSuijiHistory?.createdAt,
            changeMonth: changeMonth,
            changeYear: changeYear,
          } as any);
          // デバッグログ: 保存後（7月の変動を重点的に確認）
          if (changeMonth === 7) {
            console.log(
              `[SUIJI_DEBUG] SAVED_SUIJI_HISTORY | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applyStartYear=${applyStartYear} | applyStartMonth=${applyStartMonth} | grade=${suijiResult.newGrade} | standardMonthlyRemuneration=${suijiStandard}`
            );
          }
        } else {
          // デバッグログ: 保存スキップ（7月の変動を重点的に確認）
          if (changeMonth === 7) {
            console.log(
              `[SUIJI_DEBUG] SKIPPED_SAVE_SUIJI_HISTORY | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applyStartYear=${applyStartYear} | applyStartMonth=${applyStartMonth} | reason=existing history matches`
            );
          }
        }
        generatedApplyStartMonths.push({
          year: applyStartYear,
          month: applyStartMonth,
        });
        // デバッグログ: generatedApplyStartMonthsへの追加（7月の変動を重点的に確認）
        if (changeMonth === 7) {
          console.log(
            `[SUIJI_DEBUG] ADDED_TO_GENERATED_MONTHS | employeeId=${employeeId} | changeYear=${changeYear} | changeMonth=${changeMonth} | applyStartYear=${applyStartYear} | applyStartMonth=${applyStartMonth} | generatedApplyStartMonthsCount=${generatedApplyStartMonths.length}`
          );
        }
      }
    }
  }

  /**
   * 古い履歴をクリーンアップ
   */
  private async cleanupOldHistories(
    employeeId: string,
    joinDate: Date | null,
    generatedApplyStartMonths: Array<{ year: number; month: number }>,
    startYear: number,
    endYear: number
  ): Promise<void> {
    const allExistingHistories = await this.getStandardRemunerationHistories(
      employeeId
    );

    // デバッグログ: クリーンアップ開始（10月適用開始の履歴を重点的に確認）
    const octoberHistories = allExistingHistories.filter(
      (h) => h.applyStartMonth === 10
    );
    if (octoberHistories.length > 0) {
      console.log(
        `[SUIJI_DEBUG] CLEANUP_START | employeeId=${employeeId} | octoberHistoriesCount=${
          octoberHistories.length
        } | generatedApplyStartMonths=${JSON.stringify(
          generatedApplyStartMonths
        )}`
      );
      for (const h of octoberHistories) {
        console.log(
          `[SUIJI_DEBUG] OCTOBER_HISTORY_BEFORE_CLEANUP | employeeId=${employeeId} | id=${
            h.id
          } | applyStartYear=${h.applyStartYear} | applyStartMonth=${
            h.applyStartMonth
          } | determinationReason=${h.determinationReason} | changeMonth=${
            (h as any).changeMonth || 'none'
          } | changeYear=${(h as any).changeYear || 'none'}`
        );
      }
    }

    // 資格取得時決定の適用開始年月を追加
    if (joinDate) {
      const acquisitionYear = joinDate.getFullYear();
      const acquisitionMonth = joinDate.getMonth() + 1;
      generatedApplyStartMonths.push({
        year: acquisitionYear,
        month: acquisitionMonth,
      });
    }

    // 処理対象年度の履歴で、生成された適用開始年月に含まれていないものを削除
    for (const existingHistory of allExistingHistories) {
      // 処理対象年度より前の年度の履歴は削除しない
      if (existingHistory.applyStartYear < startYear) {
        continue;
      }

      // 処理対象年度または翌年度の履歴のみチェック
      if (
        existingHistory.applyStartYear >= startYear &&
        existingHistory.applyStartYear <= endYear + 1
      ) {
        // 生成された適用開始年月に含まれているかチェック
        const isGenerated = generatedApplyStartMonths.some(
          (generated) =>
            generated.year === existingHistory.applyStartYear &&
            generated.month === existingHistory.applyStartMonth
        );

        // デバッグログ: 10月適用開始の履歴の削除判定を重点的に確認
        if (existingHistory.applyStartMonth === 10) {
          console.log(
            `[SUIJI_DEBUG] OCTOBER_HISTORY_CLEANUP_CHECK | employeeId=${employeeId} | id=${
              existingHistory.id
            } | applyStartYear=${
              existingHistory.applyStartYear
            } | applyStartMonth=${
              existingHistory.applyStartMonth
            } | determinationReason=${
              existingHistory.determinationReason
            } | changeMonth=${
              (existingHistory as any).changeMonth || 'none'
            } | changeYear=${
              (existingHistory as any).changeYear || 'none'
            } | isGenerated=${isGenerated} | willDelete=${
              !isGenerated && !!existingHistory.id
            }`
          );
        }

        // 生成された適用開始年月に含まれていない場合、削除
        if (!isGenerated && existingHistory.id) {
          // デバッグログ: 10月適用開始の履歴の削除を重点的に確認
          if (existingHistory.applyStartMonth === 10) {
            console.log(
              `[SUIJI_DEBUG] DELETING_OCTOBER_HISTORY | employeeId=${employeeId} | id=${
                existingHistory.id
              } | applyStartYear=${
                existingHistory.applyStartYear
              } | applyStartMonth=${
                existingHistory.applyStartMonth
              } | determinationReason=${
                existingHistory.determinationReason
              } | changeMonth=${
                (existingHistory as any).changeMonth || 'none'
              } | changeYear=${(existingHistory as any).changeYear || 'none'}`
            );
          }
          await this.deleteStandardRemunerationHistory(
            existingHistory.id,
            employeeId
          );
        }
      }
    }

    // デバッグログ: クリーンアップ終了（10月適用開始の履歴を重点的に確認）
    const octoberHistoriesAfter = await this.getStandardRemunerationHistories(
      employeeId
    );
    const octoberHistoriesAfterFiltered = octoberHistoriesAfter.filter(
      (h) => h.applyStartMonth === 10
    );
    if (
      octoberHistoriesAfterFiltered.length > 0 ||
      octoberHistories.length > 0
    ) {
      console.log(
        `[SUIJI_DEBUG] CLEANUP_END | employeeId=${employeeId} | octoberHistoriesBefore=${octoberHistories.length} | octoberHistoriesAfter=${octoberHistoriesAfterFiltered.length}`
      );
      for (const h of octoberHistoriesAfterFiltered) {
        console.log(
          `[SUIJI_DEBUG] OCTOBER_HISTORY_AFTER_CLEANUP | employeeId=${employeeId} | id=${
            h.id
          } | applyStartYear=${h.applyStartYear} | applyStartMonth=${
            h.applyStartMonth
          } | determinationReason=${h.determinationReason} | changeMonth=${
            (h as any).changeMonth || 'none'
          } | changeYear=${(h as any).changeYear || 'none'}`
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
    const birthDate = new Date(employee.birthDate);
    const birthYear = birthDate.getFullYear();
    const birthMonth = birthDate.getMonth() + 1;

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
        // 年齢計算
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
