import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, query, where, getDocs } from '@angular/fire/firestore';
import { Bonus } from '../models/bonus.model';

@Injectable({ providedIn: 'root' })
export class BonusService {
  constructor(private firestore: Firestore) {}

  async addBonus(bonus: Bonus): Promise<void> {
    const col = collection(this.firestore, 'bonuses');
    await addDoc(col, bonus);
  }

  async getBonusCountByYear(employeeId: string, year: number): Promise<number> {
    const col = collection(this.firestore, 'bonuses');
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const q = query(
      col,
      where('employeeId', '==', employeeId),
      where('payDate', '>=', startDate),
      where('payDate', '<=', endDate)
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
  }

  async getBonusCountLast12Months(employeeId: string, payDate: Date): Promise<number> {
    // 過去12ヶ月（支給日ベース）の賞与を取得
    const bonuses = await this.getBonusesLast12Months(employeeId, payDate);
    return bonuses.length;
  }

  /**
   * 過去12ヶ月（支給日ベース）の賞与を取得
   * @param employeeId 従業員ID
   * @param payDate 現在の支給日
   * @returns 過去12ヶ月の賞与リスト（今回の支給日を含む）
   */
  async getBonusesLast12Months(employeeId: string, payDate: Date): Promise<Bonus[]> {
    const col = collection(this.firestore, 'bonuses');
    // 支給日から12ヶ月前の日付を計算
    const startDate = new Date(payDate);
    startDate.setMonth(startDate.getMonth() - 12);
    const startDateISO = startDate.toISOString().split('T')[0];
    // 支給日当日まで（今回の支給日を含む）
    const endDateISO = payDate.toISOString().split('T')[0];
    
    const q = query(
      col,
      where('employeeId', '==', employeeId),
      where('payDate', '>=', startDateISO),
      where('payDate', '<=', endDateISO)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bonus));
  }

  async getBonusesByEmployee(employeeId: string, payDate?: Date): Promise<Bonus[]> {
    const col = collection(this.firestore, 'bonuses');
    const baseDate = payDate || new Date();
    const startDate = new Date(baseDate);
    startDate.setMonth(startDate.getMonth() - 12);
    const startDateISO = startDate.toISOString().split('T')[0];
    
    const q = query(
      col,
      where('employeeId', '==', employeeId),
      where('payDate', '>=', startDateISO)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bonus));
  }

  async getBonusesForResult(employeeId: string, year: number): Promise<Bonus[]> {
    const col = collection(this.firestore, 'bonuses');
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const q = query(
      col,
      where('employeeId', '==', employeeId),
      where('payDate', '>=', startDate),
      where('payDate', '<=', endDate)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bonus));
  }
}

