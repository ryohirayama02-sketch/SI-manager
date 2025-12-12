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
  query,
  where,
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
      `rooms/${roomId}/monthlySalaries/${employeeId}/years/${year}/months/${month}`
    );
    await setDoc(ref, normalizedPayload, { merge: true });
  }

  /**
   * 給与データを正規化（項目別形式を優先、既存形式はフォールバック）
   */
  private normalizeSalaryData(payload: any): any {
    const normalizeMonth = (monthData: any) => {
      if (monthData && typeof monthData === 'object') {
        // 新しい項目別形式を優先
        if (monthData.salaryItems && Array.isArray(monthData.salaryItems)) {
          return {
            ...monthData,
            fixed: monthData.fixedTotal ?? 0,
            variable: monthData.variableTotal ?? 0,
            total: monthData.total ?? 0,
            fixedSalary: monthData.fixedTotal ?? 0,
            variableSalary: monthData.variableTotal ?? 0,
            totalSalary: monthData.total ?? 0,
          };
        }

        // 既存形式：fixed/variable/totalから計算
        const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
        const variable = monthData.variableSalary ?? monthData.variable ?? 0;
        const total =
          monthData.totalSalary ?? monthData.total ?? fixed + variable;

        const calculatedTotal = fixed + variable;
        const alignedTotal =
          Math.abs(total - calculatedTotal) > 0.01 ? calculatedTotal : total;

        return {
          ...monthData,
          fixedSalary: fixed,
          variableSalary: variable,
          totalSalary: alignedTotal,
          fixed,
          variable,
          total: alignedTotal,
        };
      }
      return monthData;
    };

    const isSingleMonth =
      payload &&
      typeof payload === 'object' &&
      (Array.isArray(payload.salaryItems) ||
        [
          'fixed',
          'variable',
          'total',
          'fixedSalary',
          'variableSalary',
          'totalSalary',
          'workingDays',
        ].some((k) => payload[k] !== undefined));

    if (isSingleMonth) {
      return normalizeMonth(payload);
    }

    const normalized: any = {};
    for (const key in payload) {
      normalized[key] = normalizeMonth(payload[key]);
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
      `rooms/${roomId}/monthlySalaries/${employeeId}/years/${year}/months/${month}`
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
      `rooms/${roomId}/monthlySalaries/${employeeId}/years/${year}/months/${month}`
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
      `rooms/${roomId}/monthlySalaries/${employeeId}/years/${year}/months`
    );
    const snap = await getDocs(col);
    return snap.docs.map((d) => d.id);
  }

  /**
   * 月次給与データの変更を監視する
   * @param year 年度
   * @returns Observable<void>
   */
  observeMonthlySalaries(year: number): Observable<void> {
    const roomId = this.roomIdService.requireRoomId();
    // 指定ルームの指定年度の給与データのみを監視
    const colGroup = query(
      collectionGroup(this.firestore, 'months'),
      where('roomId', '==', roomId)
    );
    return new Observable<void>((observer) => {
      const unsubscribe = onSnapshot(
        colGroup,
        (snapshot: QuerySnapshot<DocumentData>) => {
          // 指定年度のドキュメントが変更された場合のみ通知
          const yearSegment = `/years/${year}/months/`;
          const hasChanges = snapshot
            .docChanges()
            .some((change: DocumentChange<DocumentData>) =>
              change.doc.ref.path.includes(yearSegment)
            );
          if (hasChanges || snapshot.docChanges().length > 0) {
            observer.next();
          }
        }
      );
      return () => unsubscribe();
    });
  }
}
