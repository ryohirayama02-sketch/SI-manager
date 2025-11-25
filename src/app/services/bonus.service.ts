import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from '@angular/fire/firestore';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
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

  async getBonusCountLast12Months(
    employeeId: string,
    payDate: Date
  ): Promise<number> {
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
  async getBonusesLast12Months(
    employeeId: string,
    payDate: Date
  ): Promise<Bonus[]> {
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
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Bonus));
  }

  async getBonusesByEmployee(
    employeeId: string,
    payDate?: Date
  ): Promise<Bonus[]> {
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
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Bonus));
  }

  async getBonusesForResult(
    employeeId: string,
    year: number
  ): Promise<Bonus[]> {
    const ref = collection(
      this.firestore,
      `bonus/${year}/employees/${employeeId}/items`
    );
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const q = query(
      ref,
      where('payDate', '>=', startDate),
      where('payDate', '<=', endDate)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Bonus));
  }

  /**
   * 賞与を保存する（新しい構造）
   * @param year 年度
   * @param data 賞与データ
   */
  async saveBonus(year: number, data: Bonus): Promise<void> {
    const docId = `${data.employeeId}_${data.month}`;
    const ref = doc(
      this.firestore,
      `bonus/${year}/employees/${data.employeeId}/items/${docId}`
    );
    const bonusData = {
      ...data,
      year,
      createdAt: data.createdAt || Timestamp.now(),
    };
    await setDoc(ref, bonusData, { merge: true });
  }

  /**
   * 賞与を読み込む（新しい構造）
   * @param year 年度
   * @param employeeId 従業員ID（オプショナル）
   * @returns 賞与データの配列
   */
  async loadBonus(year: number, employeeId?: string): Promise<Bonus[]> {
    if (employeeId) {
      const ref = collection(
        this.firestore,
        `bonus/${year}/employees/${employeeId}/items`
      );
      const snapshot = await getDocs(ref);
      return snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Bonus)
      );
    } else {
      // 全従業員の賞与データを取得
      const employeesRef = collection(
        this.firestore,
        `bonus/${year}/employees`
      );
      const employeesSnapshot = await getDocs(employeesRef);
      const allBonuses: Bonus[] = [];
      for (const empDoc of employeesSnapshot.docs) {
        const itemsRef = collection(
          this.firestore,
          `bonus/${year}/employees/${empDoc.id}/items`
        );
        const itemsSnapshot = await getDocs(itemsRef);
        allBonuses.push(
          ...itemsSnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as Bonus)
          )
        );
      }
      return allBonuses;
    }
  }

  /**
   * 賞与を削除する
   * @param year 年度
   * @param employeeId 従業員ID
   * @param bonusId 賞与ID（ドキュメントID）
   */
  async deleteBonus(year: number, employeeId: string, bonusId: string): Promise<void> {
    const ref = doc(
      this.firestore,
      `bonus/${year}/employees/${employeeId}/items/${bonusId}`
    );
    await deleteDoc(ref);
  }

  /**
   * 賞与を1件取得する
   * @param year 年度
   * @param employeeId 従業員ID
   * @param bonusId 賞与ID（ドキュメントID）
   * @returns 賞与データ
   */
  async getBonus(year: number, employeeId: string, bonusId: string): Promise<Bonus | null> {
    const ref = doc(
      this.firestore,
      `bonus/${year}/employees/${employeeId}/items/${bonusId}`
    );
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() } as Bonus;
    }
    return null;
  }

  /**
   * 指定年度の賞与一覧を取得する
   * @param employeeId 従業員ID
   * @param year 年度
   * @returns 賞与データの配列
   */
  async getBonusesByYear(employeeId: string, year: number): Promise<Bonus[]> {
    const ref = collection(
      this.firestore,
      `bonus/${year}/employees/${employeeId}/items`
    );
    const snapshot = await getDocs(ref);
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Bonus)
    );
  }

  /**
   * 賞与を1件取得する（年度を自動検索）
   * @param employeeId 従業員ID
   * @param bonusId 賞与ID（ドキュメントID）
   * @param preferredYear 優先検索年度（オプショナル）
   * @returns 賞与データと年度のタプル
   */
  async getBonusWithYear(employeeId: string, bonusId: string, preferredYear?: number): Promise<{ bonus: Bonus; year: number } | null> {
    // 優先年度が指定されている場合は、まずその年度を検索
    if (preferredYear !== undefined) {
      const bonus = await this.getBonus(preferredYear, employeeId, bonusId);
      if (bonus) {
        return { bonus, year: preferredYear };
      }
    }

    // 現在年度±2年の範囲で検索
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 2; year <= currentYear + 2; year++) {
      // 優先年度は既に検索済みなのでスキップ
      if (preferredYear !== undefined && year === preferredYear) {
        continue;
      }
      const bonus = await this.getBonus(year, employeeId, bonusId);
      if (bonus) {
        return { bonus, year };
      }
    }
    return null;
  }

  /**
   * 賞与を更新する
   * @param year 年度
   * @param employeeId 従業員ID
   * @param bonusId 賞与ID（ドキュメントID）
   * @param data 更新データ
   */
  async updateBonus(year: number, employeeId: string, bonusId: string, data: Partial<Bonus>): Promise<void> {
    const ref = doc(
      this.firestore,
      `bonus/${year}/employees/${employeeId}/items/${bonusId}`
    );
    
    // undefinedの値を除外
    const cleanData: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }
    
    await updateDoc(ref, cleanData);
  }
}
