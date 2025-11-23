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
}
