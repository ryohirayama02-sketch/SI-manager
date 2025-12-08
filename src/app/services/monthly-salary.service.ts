import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  collection,
  deleteDoc,
  getDocs,
  collectionGroup,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
  DocumentChange,
} from '@angular/fire/firestore';
import {
  MonthlySalaryData,
  SalaryItemEntry,
} from '../models/monthly-salary.model';
import { SalaryItem } from '../models/salary-item.model';
import { Observable } from 'rxjs';
import { RoomIdService } from './room-id.service';
import { EmployeeService } from './employee.service';

@Injectable({ providedIn: 'root' })
export class MonthlySalaryService {
  constructor(
    private firestore: Firestore,
    private roomIdService: RoomIdService,
    private employeeService: EmployeeService
  ) {}

  async saveEmployeeSalary(
    roomId: string,
    employeeId: string,
    year: number,
    month: number,
    payload: any
  ): Promise<void> {

    // 従業員のroomIdを確認（セキュリティチェック）
    const employee = await this.employeeService.getEmployeeById(employeeId);
    if (!employee) {
      throw new Error('従業員データが見つかりません');
    }
    if (employee.roomId !== roomId) {
      throw new Error('この従業員の給与データにアクセスする権限がありません');
    }

    // 給与保存時のバリデーションと自動補正
    const normalizedPayload = this.normalizeSalaryData(payload);

    // roomIdを自動付与
    normalizedPayload.roomId = roomId;

    // 構造: rooms/{roomId}/monthlySalaries/{employeeId}/years/{year}/{month}
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/monthlySalaries/${employeeId}/years/${year}/${month}`
    );
    await setDoc(ref, normalizedPayload, { merge: true });
  }

  /**
   * 給与データを正規化（項目別形式を優先、既存形式はフォールバック）
   */
  private normalizeSalaryData(payload: any): any {
    const normalized: any = { ...payload };

    // 月ごとのデータを正規化
    for (const key in normalized) {
      const monthData = normalized[key];
      if (monthData && typeof monthData === 'object') {
        // 新しい項目別形式を優先
        if (monthData.salaryItems && Array.isArray(monthData.salaryItems)) {
          // 項目別形式：fixedTotal/variableTotal/totalは既に計算済み
          normalized[key] = {
            ...monthData,
            // 後方互換性のため既存属性も設定
            fixed: monthData.fixedTotal ?? 0,
            variable: monthData.variableTotal ?? 0,
            total: monthData.total ?? 0,
            fixedSalary: monthData.fixedTotal ?? 0,
            variableSalary: monthData.variableTotal ?? 0,
            totalSalary: monthData.total ?? 0,
          };
        } else {
          // 既存形式：fixed/variable/totalから計算
          const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
          const variable = monthData.variableSalary ?? monthData.variable ?? 0;
          const total =
            monthData.totalSalary ?? monthData.total ?? fixed + variable;

          // 自動算出：totalSalary = fixedSalary + variableSalary
          const calculatedTotal = fixed + variable;

          // バリデーション：fixed + variable が total と一致しない場合 → 自動補正
          if (Math.abs(total - calculatedTotal) > 0.01) {
            normalized[key] = {
              ...monthData,
              fixedSalary: fixed,
              variableSalary: variable,
              totalSalary: calculatedTotal,
              fixed: fixed,
              variable: variable,
              total: calculatedTotal,
            };
          } else {
            normalized[key] = {
              ...monthData,
              fixedSalary: fixed,
              variableSalary: variable,
              totalSalary: total,
              fixed: fixed,
              variable: variable,
              total: total,
            };
          }
        }
      }
    }

    return normalized;
  }

  async getEmployeeSalary(
    roomId: string,
    employeeId: string,
    year: number,
    month: number
  ): Promise<any | null> {
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/monthlySalaries/${employeeId}/years/${year}/${month}`
    );
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return this.normalizeSalaryData(snap.data());
  }

  async deleteEmployeeSalary(
    roomId: string,
    employeeId: string,
    year: number,
    month: number
  ): Promise<void> {
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/monthlySalaries/${employeeId}/years/${year}/${month}`
    );
    await deleteDoc(ref);
  }

  async listEmployeeSalaryMonths(
    roomId: string,
    employeeId: string,
    year: number
  ): Promise<string[]> {
    const col = collection(
      this.firestore,
      `rooms/${roomId}/monthlySalaries/${employeeId}/years/${year}`
    );
    const snap = await getDocs(col);
    return snap.docs.map((d) => d.id);
  }

  async getMonthlyPremiums(
    employeeId: string,
    year: number,
    standardMonthlyRemuneration: number,
    age: number,
    rates: any
  ): Promise<{
    [month: number]: {
      healthEmployee: number;
      healthEmployer: number;
      careEmployee: number;
      careEmployer: number;
      pensionEmployee: number;
      pensionEmployer: number;
    };
  }> {
    const result: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      };
    } = {};

    if (!rates || !standardMonthlyRemuneration) {
      return result;
    }

    // 健康保険：総額を計算 → 折半 → それぞれ10円未満切り捨て
    const healthTotal =
      standardMonthlyRemuneration *
      (rates.health_employee + rates.health_employer);
    const healthHalf = healthTotal / 2;
    const healthEmployee = Math.floor(healthHalf / 10) * 10; // 10円未満切り捨て
    const healthEmployer = Math.floor(healthHalf / 10) * 10; // 10円未満切り捨て

    // 介護保険：総額を計算 → 折半 → それぞれ10円未満切り捨て
    const careTotal =
      age >= 40 && age <= 64
        ? standardMonthlyRemuneration *
          (rates.care_employee + rates.care_employer)
        : 0;
    const careHalf = careTotal / 2;
    const careEmployee =
      age >= 40 && age <= 64
        ? Math.floor(careHalf / 10) * 10 // 10円未満切り捨て
        : 0;
    const careEmployer =
      age >= 40 && age <= 64
        ? Math.floor(careHalf / 10) * 10 // 10円未満切り捨て
        : 0;

    // 厚生年金：個人分を計算 → 10円未満切り捨て → 会社分 = 総額 - 個人分
    const pensionTotal =
      standardMonthlyRemuneration *
      (rates.pension_employee + rates.pension_employer);
    const pensionHalf = pensionTotal / 2;
    const pensionEmployee = Math.floor(pensionHalf / 10) * 10; // 個人分：10円未満切り捨て
    const pensionEmployer = pensionTotal - pensionEmployee; // 会社分 = 総額 - 個人分

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
        pensionEmployer,
      };
    }

    return result;
  }

  /**
   * 月次給与データの変更を監視する
   * @param year 年度
   * @returns Observable<void>
   */
  observeMonthlySalaries(year: number): Observable<void> {
    // 全従業員の給与データを監視するため、collectionGroupを使用
    // 実際の構造: monthlySalaries/{employeeId}/years/{year}
    const colGroup = collectionGroup(this.firestore, 'years');
    return new Observable<void>((observer) => {
      const unsubscribe = onSnapshot(colGroup, (snapshot: QuerySnapshot<DocumentData>) => {
        // 指定年度のドキュメントが変更された場合のみ通知
        const hasChanges = snapshot.docChanges().some((change: DocumentChange<DocumentData>) => {
          const docData = change.doc.data();
          // 年度が一致するか、または親パスに年度が含まれるかを確認
          // 簡易的な実装：すべての変更を通知（年度フィルタリングは呼び出し側で行う）
          return true;
        });
        if (hasChanges || snapshot.docChanges().length > 0) {
          observer.next();
        }
      });
      return () => unsubscribe();
    });
  }
}
