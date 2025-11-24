import { Injectable } from '@angular/core';
import { Firestore, doc, setDoc, getDoc } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class MonthlySalaryService {
  constructor(private firestore: Firestore) {}

  async saveEmployeeSalary(
    employeeId: string,
    year: number,
    payload: any
  ): Promise<void> {
    // 給与保存時のバリデーションと自動補正
    const normalizedPayload = this.normalizeSalaryData(payload);
    
    // 構造: monthlySalaries/{employeeId}/years/{year} (偶数セグメント)
    const ref = doc(this.firestore, 'monthlySalaries', employeeId, 'years', year.toString());
    await setDoc(ref, normalizedPayload, { merge: true });
  }

  /**
   * 給与データを正規化（totalSalary = fixedSalary + variableSalary を保証）
   */
  private normalizeSalaryData(payload: any): any {
    const normalized: any = { ...payload };
    
    // 月ごとのデータを正規化
    for (const key in normalized) {
      const monthData = normalized[key];
      if (monthData && typeof monthData === 'object') {
        // 既存のfixed/variable/totalからfixedSalary/variableSalary/totalSalaryを設定
        const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
        const variable = monthData.variableSalary ?? monthData.variable ?? 0;
        const total = monthData.totalSalary ?? monthData.total ?? (fixed + variable);
        
        // 自動算出：totalSalary = fixedSalary + variableSalary
        const calculatedTotal = fixed + variable;
        
        // バリデーション：fixed + variable が total と一致しない場合 → 自動補正
        if (Math.abs(total - calculatedTotal) > 0.01) {
          // 不一致がある場合は、calculatedTotalを優先（エラーログは上位で処理）
          normalized[key] = {
            ...monthData,
            fixedSalary: fixed,
            variableSalary: variable,
            totalSalary: calculatedTotal,
            // 後方互換性のため既存属性も設定
            fixed: fixed,
            variable: variable,
            total: calculatedTotal
          };
        } else {
          // 一致している場合は、新しい属性を設定
          normalized[key] = {
            ...monthData,
            fixedSalary: fixed,
            variableSalary: variable,
            totalSalary: total,
            // 後方互換性のため既存属性も設定
            fixed: fixed,
            variable: variable,
            total: total
          };
        }
      }
    }
    
    return normalized;
  }

  async getEmployeeSalary(
    employeeId: string,
    year: number
  ): Promise<any | null> {
    // 構造: monthlySalaries/{employeeId}/years/{year} (偶数セグメント)
    const ref = doc(this.firestore, 'monthlySalaries', employeeId, 'years', year.toString());
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    
    // 取得したデータを正規化（totalSalary = fixedSalary + variableSalary を保証）
    const data = snap.data();
    return this.normalizeSalaryData(data);
  }

  async getMonthlyPremiums(
    employeeId: string,
    year: number,
    standardMonthlyRemuneration: number,
    age: number,
    rates: any
  ): Promise<{ [month: number]: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
  } }> {
    const result: { [month: number]: {
      healthEmployee: number;
      healthEmployer: number;
      careEmployee: number;
      careEmployer: number;
      pensionEmployee: number;
      pensionEmployer: number;
    } } = {};

    if (!rates || !standardMonthlyRemuneration) {
      return result;
    }

    const healthEmployee = Math.floor(standardMonthlyRemuneration * rates.health_employee);
    const healthEmployer = Math.floor(standardMonthlyRemuneration * rates.health_employer);
    const careEmployee = (age >= 40 && age <= 64) ? Math.floor(standardMonthlyRemuneration * rates.care_employee) : 0;
    const careEmployer = (age >= 40 && age <= 64) ? Math.floor(standardMonthlyRemuneration * rates.care_employer) : 0;
    const pensionEmployee = Math.floor(standardMonthlyRemuneration * rates.pension_employee);
    const pensionEmployer = Math.floor(standardMonthlyRemuneration * rates.pension_employer);

    // 12ヶ月分の保険料を設定（簡略化：標準報酬月額は年間を通じて同じと仮定）
    // TODO: 支給日基準 / 締日基準の切り替えに対応（設定画面の値を参照する）
    // TODO: 随時改定による標準報酬月額の変更に対応
    for (let month = 1; month <= 12; month++) {
      result[month] = {
        healthEmployee,
        healthEmployer,
        careEmployee,
        careEmployer,
        pensionEmployee,
        pensionEmployer
      };
    }

    return result;
  }
}
