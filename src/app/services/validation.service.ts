import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';

export interface SalaryData {
  total: number;
  fixed: number;
  variable: number;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

@Injectable({ providedIn: 'root' })
export class ValidationService {
  /**
   * 給与データのバリデーション
   * @param employeeId 従業員ID
   * @param employee 従業員情報
   * @param salaries 給与データ（{ employeeId_month: { total, fixed, variable } }）
   * @param months 月の配列
   * @param getStandardMonthlyRemuneration 標準報酬月額を取得する関数
   * @returns エラーと警告の配列
   */
  validateSalaryData(
    employeeId: string,
    employee: Employee,
    salaries: { [key: string]: SalaryData },
    months: number[],
    getStandardMonthlyRemuneration: (total: number) => { rank: number; standard: number } | null
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 各月の給与データをチェック
    for (const month of months) {
      const key = `${employeeId}_${month}`;
      const salaryData = salaries[key];
      if (!salaryData) continue;

      const total = salaryData.total || 0;
      const fixed = salaryData.fixed || 0;
      const variable = salaryData.variable || 0;

      // 報酬月額の整合性チェック（固定+非固定=総支給）
      if (total > 0 && Math.abs(fixed + variable - total) > 1) {
        const errorMsg = `${month}月：固定的賃金と非固定的賃金の合計が総支給と一致しません（総支給: ${total.toLocaleString()}円、合計: ${(
          fixed + variable
        ).toLocaleString()}円）`;
        if (!errors.includes(errorMsg)) {
          errors.push(errorMsg);
        }
      }

      // 等級が算出できない場合のチェック（標準報酬月額が算出できない）
      // 入力途中の値（10,000円未満）はチェックしない
      if (total >= 10000) {
        const stdResult = getStandardMonthlyRemuneration(total);
        if (!stdResult || !stdResult.standard) {
          const warningMsg = `${month}月：標準報酬月額テーブルに該当する等級が見つかりません（報酬: ${total.toLocaleString()}円）`;
          if (!warnings.includes(warningMsg)) {
            warnings.push(warningMsg);
          }
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * 従業員の年齢関連エラーをチェック
   * @param employee 従業員情報
   * @param age 年齢
   * @param premiums 保険料データ
   * @returns エラーと警告の配列
   */
  checkEmployeeErrors(
    employee: Employee,
    age: number,
    premiums: any
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 70歳以上なのに厚生年金の保険料が計算されている
    if (age >= 70 && premiums && premiums.pension_employee > 0) {
      const errorMsg = `70歳以上は厚生年金保険料は発生しません`;
      if (!errors.includes(errorMsg)) {
        errors.push(errorMsg);
      }
    }

    // 75歳以上なのに健康保険・介護保険が計算されている
    if (
      age >= 75 &&
      premiums &&
      (premiums.health_employee > 0 || premiums.care_employee > 0)
    ) {
      const errorMsg = `75歳以上は健康保険・介護保険は発生しません`;
      if (!errors.includes(errorMsg)) {
        errors.push(errorMsg);
      }
    }

    return { errors, warnings };
  }
}

