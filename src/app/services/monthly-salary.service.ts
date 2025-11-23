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
    // 構造: monthlySalaries/{employeeId}/{year}
    const ref = doc(this.firestore, 'monthlySalaries', employeeId, year.toString());
    await setDoc(ref, payload, { merge: true });
  }

  async getEmployeeSalary(
    employeeId: string,
    year: number
  ): Promise<any | null> {
    const ref = doc(this.firestore, `monthlySalaries/${employeeId}/${year}`);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
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
