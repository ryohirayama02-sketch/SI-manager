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
    const col = collection(this.firestore, 'bonuses');
    const startDate = new Date(payDate);
    startDate.setDate(startDate.getDate() - 365);
    const startDateISO = startDate.toISOString().split('T')[0];
    
    const q = query(
      col,
      where('employeeId', '==', employeeId),
      where('payDate', '>=', startDateISO)
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
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

