import { Injectable } from '@angular/core';
import { Firestore, doc, setDoc, collection, getDocs } from '@angular/fire/firestore';
import { MonthlySalaryData } from '../models/monthly-salary.model';
import { SalaryItem } from '../models/salary-item.model';
import { FixedChangeResult } from '../models/suiji.model';
import { SuijiKouhoResult } from './salary-calculation.service';

@Injectable({ providedIn: 'root' })
export class SuijiService {
  constructor(private firestore: Firestore) {}
  
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
    const employeeMonths: { [employeeId: string]: { [month: number]: number } } = {};

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
      
      // 2月以降について、前月と比較
      for (let month = 2; month <= 12; month++) {
        const currentFixed = months[month] ?? 0;
        const previousFixed = months[month - 1] ?? 0;
        
        // 変動がある場合（0以外の差分）
        if (currentFixed !== previousFixed) {
          results.push({
            employeeId,
            changeMonth: month,
            fixedBefore: previousFixed,
            fixedAfter: currentFixed
          });
        }
      }
    }

    return results;
  }

  /**
   * 変動月を含む3か月平均を算出する
   * @param salaryData 給与データ（キー形式: employeeId_month）
   * @param employeeId 従業員ID
   * @param changeMonth 変動月（1-12）
   * @returns 3か月平均（M, M+1, M+2の平均）、いずれかが存在しない場合はnull
   */
  calculateThreeMonthAverage(
    salaryData: { [key: string]: MonthlySalaryData },
    employeeId: string,
    changeMonth: number
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

    // fixedTotalを取得
    const fixed1 = data1.fixedTotal ?? data1.fixed ?? data1.fixedSalary ?? null;
    const fixed2 = data2.fixedTotal ?? data2.fixed ?? data2.fixedSalary ?? null;
    const fixed3 = data3.fixedTotal ?? data3.fixed ?? data3.fixedSalary ?? null;

    // いずれかがnullまたはundefinedの場合はnullを返す
    if (fixed1 === null || fixed1 === undefined || 
        fixed2 === null || fixed2 === undefined || 
        fixed3 === null || fixed3 === undefined) {
      return null;
    }

    // 3か月平均を計算
    const average = (fixed1 + fixed2 + fixed3) / 3;
    return average;
  }

  /**
   * 3か月平均額から標準報酬等級を判定する
   * @param average 3か月平均額
   * @param standardTable 標準報酬等級表（rank, lower, upper, standardを含む配列）
   * @returns 等級（rank）、該当しない場合はnull
   */
  getGradeFromAverage(
    average: number,
    standardTable: any[]
  ): number | null {
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
   * @param change 固定的賃金変動検出結果
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
    const diff = newGrade - currentGrade;

    // 適用開始月を計算（変動月の3ヶ月後）
    const applyStartMonth = change.changeMonth + 3;
    // 12を超える場合は翌年扱いだが、今回は月のみ計算でOK
    const normalizedApplyMonth = applyStartMonth > 12 ? applyStartMonth - 12 : applyStartMonth;

    // 判定理由を設定
    const reasons: string[] = [];
    reasons.push(`固定的賃金が${change.fixedBefore.toLocaleString()}円から${change.fixedAfter.toLocaleString()}円に変動`);
    reasons.push(`変動月（${change.changeMonth}月）を含む3か月平均: ${average.toLocaleString()}円`);
    reasons.push(`現行等級: ${currentGrade} → 新等級: ${newGrade}（等級差: ${diff}）`);

    // 随時改定の成立可否を判定（等級差が2以上）
    const isEligible = diff >= 2;

    if (isEligible) {
      reasons.push(`等級差が2以上（${diff}）のため、随時改定が成立`);
    } else {
      reasons.push(`等級差が1以下（${diff}）のため、随時改定は不成立`);
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
      isEligible: isEligible
    };
  }

  /**
   * 随時改定候補をFirestoreに保存する
   * @param year 年度
   * @param result 随時改定候補結果
   */
  async saveSuijiKouho(year: number, result: SuijiKouhoResult): Promise<void> {
    const docId = `${result.employeeId}_${result.changeMonth}`;
    const ref = doc(this.firestore, `suiji/${year}/alerts/${docId}`);
    await setDoc(ref, result, { merge: true });
  }

  /**
   * 随時改定アラートをFirestoreから読み込む
   * @param year 年度
   * @returns 随時改定候補結果の配列
   */
  async loadAlerts(year: number): Promise<SuijiKouhoResult[]> {
    const ref = collection(this.firestore, `suiji/${year}/alerts`);
    const snap = await getDocs(ref);
    return snap.docs.map(d => d.data() as SuijiKouhoResult);
  }
}

