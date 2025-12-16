import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { MonthlySalaryData } from '../models/monthly-salary.model';
import { SalaryItem } from '../models/salary-item.model';
import { FixedChangeResult } from '../models/suiji.model';
import { SuijiKouhoResult } from './salary-calculation.service';
import { SettingsService } from './settings.service';
import { Employee } from '../models/employee.model';
import { RoomIdService } from './room-id.service';

export interface SalaryData {
  total: number;
  fixed: number;
  variable: number;
  workingDays?: number; // 支払基礎日数
}

@Injectable({ providedIn: 'root' })
export class SuijiService {
  constructor(
    private firestore: Firestore,
    private settingsService: SettingsService,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 固定的賃金の変動を検出する
   * @param salaryData 給与データ（キー形式: employeeId_month）
   * @param salaryItemMaster 給与項目マスタ（使用しないが将来の拡張用）
   * @returns 変動検出結果の配列
   */
  detectFixedSalaryChange(
    salaryData: { [key: string]: MonthlySalaryData },
    salaryItemMaster: SalaryItem[]
  ): FixedChangeResult[] {
    const results: FixedChangeResult[] = [];
    const employeeMonths: {
      [employeeId: string]: { [month: number]: number };
    } = {};

    // 給与データを従業員IDと月ごとに整理
    for (const key in salaryData) {
      const parts = key.split('_');
      if (parts.length !== 2) continue;

      const employeeId = parts[0];
      const month = parseInt(parts[1], 10);

      if (isNaN(month) || month < 1 || month > 12) continue;

      const data = salaryData[key];
      const fixedTotal = data.fixedTotal ?? data.fixed ?? data.fixedSalary ?? 0;

      if (!employeeMonths[employeeId]) {
        employeeMonths[employeeId] = {};
      }
      employeeMonths[employeeId][month] = fixedTotal;
    }

    // 各従業員について、月ごとの変動を検出
    for (const employeeId in employeeMonths) {
      const months = employeeMonths[employeeId];
      let prevFixed = 0; // 基準固定費（支払基礎日数17日未満の月はスキップして維持）

      // 1月から12月まで順にチェック
      for (let month = 1; month <= 12; month++) {
        const key = `${employeeId}_${month}`;
        const data = salaryData[key];
        const workingDays = data?.workingDays;
        const currentFixed = months[month] ?? 0;

        // 支払基礎日数が17日未満の月は固定費のチェックをスキップ（基準固定費は維持）
        if (workingDays !== undefined && workingDays < 17) {
          // この月はスキップ。prevFixedは維持されたまま次の月へ
          continue;
        }

        // 前月と比較して変動があったか判定
        if (month > 1 && prevFixed > 0 && currentFixed !== prevFixed) {
          results.push({
            employeeId,
            changeMonth: month,
            fixedBefore: prevFixed,
            fixedAfter: currentFixed,
          });
        }

        // 初月または前月のfixedが0の場合は、現在のfixedを記録
        if (month === 1 || prevFixed === 0) {
          prevFixed = currentFixed;
        } else {
          prevFixed = currentFixed;
        }
      }
    }

    return results;
  }

  /**
   * 変動月を含む3か月平均を算出する（報酬月額ベース）
   * @param salaryData 給与データ（キー形式: employeeId_month）
   * @param salaryItemData 給与項目データ（キー形式: employeeId_month: { itemId: amount }）
   * @param salaryItems 給与項目マスタ
   * @param employeeId 従業員ID
   * @param changeMonth 変動月（1-12）
   * @returns 3か月平均（M, M+1, M+2の報酬月額平均）、いずれかが存在しない場合はnull
   */
  calculateThreeMonthAverage(
    salaryData: { [key: string]: MonthlySalaryData },
    employeeId: string,
    changeMonth: number,
    salaryItemData?: { [key: string]: { [itemId: string]: number } },
    salaryItems?: SalaryItem[]
  ): number | null {
    // M, M+1, M+2の月を取得
    const month1 = changeMonth;
    const month2 = changeMonth + 1;
    const month3 = changeMonth + 2;

    // 12月を超える場合はnullを返す
    if (month3 > 12) {
      return null;
    }

    // 各月のデータを取得
    const key1 = `${employeeId}_${month1}`;
    const key2 = `${employeeId}_${month2}`;
    const key3 = `${employeeId}_${month3}`;

    const data1 = salaryData[key1];
    const data2 = salaryData[key2];
    const data3 = salaryData[key3];

    // いずれかが存在しない場合はnullを返す
    if (!data1 || !data2 || !data3) {
      return null;
    }

    // 報酬月額を計算（総支給額 - 欠勤控除）
    const remuneration1 = this.calculateRemunerationAmount(
      data1,
      key1,
      salaryItemData,
      salaryItems
    );
    const remuneration2 = this.calculateRemunerationAmount(
      data2,
      key2,
      salaryItemData,
      salaryItems
    );
    const remuneration3 = this.calculateRemunerationAmount(
      data3,
      key3,
      salaryItemData,
      salaryItems
    );

    // いずれかがnullの場合はnullを返す
    if (
      remuneration1 === null ||
      remuneration2 === null ||
      remuneration3 === null
    ) {
      return null;
    }

    // 3か月平均を計算（円未満切り捨て）
    const average = Math.floor(
      (remuneration1 + remuneration2 + remuneration3) / 3
    );
    return average;
  }

  /**
   * 報酬月額を計算（総支給額 - 欠勤控除 - 賞与）
   * @param salaryData 給与データ
   * @param key キー（employeeId_month）
   * @param salaryItemData 給与項目データ
   * @param salaryItems 給与項目マスタ
   * @returns 報酬月額、計算できない場合はnull
   */
  private calculateRemunerationAmount(
    salaryData: MonthlySalaryData,
    key: string,
    salaryItemData?: { [key: string]: { [itemId: string]: number } },
    salaryItems?: SalaryItem[]
  ): number | null {
    // 総支給額を取得
    const totalSalary = salaryData.total ?? salaryData.totalSalary ?? 0;

    // 欠勤控除を取得
    let absenceDeduction = 0;
    // 賞与を取得（随時改定の計算から除外するため）
    let bonusAmount = 0;

    if (salaryItemData && salaryItems) {
      const itemData = salaryItemData[key];
      if (itemData) {
        // 給与項目マスタから「欠勤控除」種別の項目を探す
        const deductionItems = salaryItems.filter(
          (item) => item.type === 'deduction'
        );
        for (const item of deductionItems) {
          absenceDeduction += itemData[item.id] || 0;
        }

        // 給与項目マスタから「賞与」という名前の項目を探す（随時改定の計算から除外）
        const bonusItems = salaryItems.filter(
          (item) =>
            item.name === '賞与' ||
            item.name.includes('賞与') ||
            item.name.includes('ボーナス')
        );
        for (const item of bonusItems) {
          bonusAmount += itemData[item.id] || 0;
        }
      }
    }

    // 報酬月額 = 総支給額 - 欠勤控除 - 賞与
    const remuneration = totalSalary - absenceDeduction - bonusAmount;
    return remuneration >= 0 ? remuneration : null;
  }

  /**
   * 3か月平均額から標準報酬等級を判定する
   * @param average 3か月平均額
   * @param standardTable 標準報酬等級表（rank, lower, upper, standardを含む配列）
   * @returns 等級（rank）、該当しない場合はnull
   */
  getGradeFromAverage(average: number, standardTable: any[]): number | null {
    if (!standardTable || standardTable.length === 0) {
      return null;
    }

    // lower <= average < upper に該当する行を検索
    const row = standardTable.find(
      (r: any) => average >= r.lower && average < r.upper
    );

    return row ? row.rank : null;
  }

  /**
   * 随時改定の本判定を行う
   * @param change 固定的賃金変動検出結果（互換性のため残すが、changeMonthのみ使用）
   * @param currentGrade 現行等級
   * @param newGrade 新等級（3か月平均から算出）
   * @param average 3か月平均額
   * @returns 随時改定候補結果、判定不可の場合はnull
   */
  judgeSuijiKouho(
    change: FixedChangeResult,
    currentGrade: number | null,
    newGrade: number | null,
    average: number | null
  ): SuijiKouhoResult | null {
    // currentGradeまたはnewGradeがnullの場合は判定不可
    if (currentGrade === null || newGrade === null || average === null) {
      return null;
    }

    // 等級差を計算
    const diff = Math.abs(newGrade - currentGrade);

    // 適用開始月を計算（変動月の3ヶ月後、つまり変動月が1か月目として4か月目が適用開始）
    const applyStartMonth = change.changeMonth + 3;
    // 12を超える場合は翌年扱いだが、今回は月のみ計算でOK
    const normalizedApplyMonth =
      applyStartMonth > 12 ? applyStartMonth - 12 : applyStartMonth;

    // 判定理由を設定（シンプルに）
    const reasons: string[] = [];

    // 随時改定の成立可否を判定（等級差が2以上）
    const isEligible = diff >= 2;

    if (isEligible) {
      reasons.push(`等級差${diff}で成立`);
    } else {
      reasons.push(`等級差${diff}で不成立`);
    }

    return {
      employeeId: change.employeeId,
      changeMonth: change.changeMonth,
      averageSalary: average,
      currentGrade: currentGrade,
      newGrade: newGrade,
      diff: diff,
      applyStartMonth: normalizedApplyMonth,
      reasons: reasons,
      isEligible: isEligible,
    };
  }

  /**
   * 随時改定の判定（報酬月額ベース）
   * @param currentGrade 現行等級
   * @param last3MonthsRemunerations 過去3ヶ月の報酬月額配列
   * @param gradeTable 標準報酬等級表
   * @returns 随時改定が適用可能かどうか
   */
  isZujikoteiApplicable(
    currentGrade: number | null,
    last3MonthsRemunerations: number[],
    gradeTable: any[]
  ): boolean {
    if (currentGrade === null || last3MonthsRemunerations.length !== 3) {
      return false;
    }

    // 3ヶ月平均を計算
    const average =
      (last3MonthsRemunerations[0] +
        last3MonthsRemunerations[1] +
        last3MonthsRemunerations[2]) /
      3;

    // 平均から等級を求める
    const newGrade = this.getGradeFromAverage(average, gradeTable);
    if (newGrade === null) {
      return false;
    }

    // 等級差が2以上なら随時改定適用可能
    const diff = Math.abs(newGrade - currentGrade);
    return diff >= 2;
  }

  /**
   * 随時改定候補をFirestoreに保存する
   * @param year 年度
   * @param result 随時改定候補結果
   */
  async saveSuijiKouho(year: number, result: SuijiKouhoResult): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const docId = `${result.employeeId}_${result.changeMonth}`;
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/suiji/${year}/alerts/${docId}`
    );
    await setDoc(ref, result, { merge: true });
  }

  /**
   * 随時改定アラートをFirestoreから読み込む
   * @param year 年度
   * @returns 随時改定候補結果の配列
   */
  async loadAlerts(
    year: number
  ): Promise<(SuijiKouhoResult & { id: string })[]> {
    const roomId = this.roomIdService.requireRoomId();
    const ref = collection(
      this.firestore,
      `rooms/${roomId}/suiji/${year}/alerts`
    );
    const snap = await getDocs(ref);
    return snap.docs.map(
      (d) => ({ ...d.data(), id: d.id } as SuijiKouhoResult & { id: string })
    );
  }

  /**
   * 全年度の随時改定アラートをFirestoreから読み込む
   * @param years 取得対象の年度配列（例: [2023, 2024, 2025, 2026]）
   * @returns 随時改定候補結果の配列（年度情報を含む）
   */
  async loadAllAlerts(
    years: number[]
  ): Promise<(SuijiKouhoResult & { id: string; year: number })[]> {
    const roomId = this.roomIdService.requireRoomId();
    const allAlerts: (SuijiKouhoResult & { id: string; year: number })[] = [];

    for (const year of years) {
      try {
        const ref = collection(
          this.firestore,
          `rooms/${roomId}/suiji/${year}/alerts`
        );
        const snap = await getDocs(ref);
        const yearAlerts = snap.docs.map(
          (d) =>
            ({
              ...d.data(),
              id: d.id,
              year: year,
            } as SuijiKouhoResult & { id: string; year: number })
        );
        allAlerts.push(...yearAlerts);
      } catch (error) {
        // 年度のコレクションが存在しない場合はスキップ
        console.warn(
          `[suiji-service] 年度 ${year} のアラート取得に失敗:`,
          error
        );
      }
    }

    return allAlerts;
  }

  /**
   * 随時改定アラートをFirestoreから削除する
   * @param year 年度
   * @param employeeId 従業員ID
   * @param changeMonth 変動月
   */
  async deleteAlert(
    year: number,
    employeeId: string,
    changeMonth: number
  ): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const docId = `${employeeId}_${changeMonth}`;
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/suiji/${year}/alerts/${docId}`
    );
    await deleteDoc(ref);
  }

  /**
   * 固定的賃金の変動を検出（月次給与画面用）
   * @param employeeId 従業員ID
   * @param month 月
   * @param salaries 給与データ（{ employeeId_month: { total, fixed, variable } }）
   * @param year 年度
   * @param employeeName 従業員名（オプショナル）
   * @returns 変動検出結果（警告メッセージを含む）
   */
  async detectFixedChangeForMonth(
    employeeId: string,
    month: number,
    salaries: { [key: string]: SalaryData },
    year: number,
    employee: Employee | null = null,
    employeeName: string = ''
  ): Promise<{ hasChange: boolean; warningMessage?: string }> {
    // 年度テーブルを取得
    const prefecture = employee
      ? (employee as any).prefecture || 'tokyo'
      : 'tokyo';
    const rates = await this.settingsService.getRates(
      year.toString(),
      prefecture
    );
    const gradeTable = await this.settingsService.getStandardTable(year);

    // 年度テーブルが取得できない場合はエラー
    if (!rates || !gradeTable || gradeTable.length === 0) {
      return { hasChange: false };
    }
    if (month <= 1) {
      return { hasChange: false };
    }

    const key = `${employeeId}_${month}`;
    const currentSalaryData = salaries[key];
    const cur = currentSalaryData?.fixed || 0;
    const currentWorkingDays = currentSalaryData?.workingDays;

    // 当月の支払基礎日数が17日未満の場合はスキップ
    if (currentWorkingDays !== undefined && currentWorkingDays < 17) {
      return { hasChange: false };
    }

    // 前月から遡って、支払基礎日数17日以上の月の固定費を基準にする
    let prev = 0;
    for (let checkMonth = month - 1; checkMonth >= 1; checkMonth--) {
      const checkKey = `${employeeId}_${checkMonth}`;
      const checkSalaryData = salaries[checkKey];
      const checkWorkingDays = checkSalaryData?.workingDays;
      
      // 支払基礎日数が17日未満の月はスキップ
      if (checkWorkingDays !== undefined && checkWorkingDays < 17) {
        continue;
      }
      
      // 有効な月の固定費を基準にする
      prev = checkSalaryData?.fixed || 0;
      break;
    }

    // 固定的賃金の変動を検出（前月と異なり、かつ今月が0より大きい）
    const hasChange = prev !== cur && cur > 0;

    // 極端に不自然な固定的賃金の変動チェック（前月比50%以上）
    let warningMessage: string | undefined;
    if (prev > 0 && cur > 0) {
      const changeRate = Math.abs((cur - prev) / prev);
      if (changeRate >= 0.5) {
        warningMessage = `${month}月：固定的賃金が前月から極端に変動しています（前月: ${prev.toLocaleString()}円 → 今月: ${cur.toLocaleString()}円）`;
      }
    }

    return { hasChange, warningMessage };
  }
}
