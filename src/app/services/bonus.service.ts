import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from '@angular/fire/firestore';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ providedIn: 'root' })
export class BonusService {
  constructor(private firestore: Firestore) {}

  private buildBonusDocPath(
    roomId: string,
    employeeId: string,
    year: number,
    bonusId: string
  ): string {
    return `rooms/${roomId}/bonuses/${employeeId}/years/${year}/bonuses/${bonusId}`;
  }

  private buildBonusCollectionPath(
    roomId: string,
    employeeId: string,
    year: number
  ): string {
    return `rooms/${roomId}/bonuses/${employeeId}/years/${year}/bonuses`;
      }

  /**
   * 賞与を保存（新パス構造）
   */
  async saveBonus(
    roomId: string,
    employeeId: string,
    year: number,
    bonusId: string,
    payload: any
  ): Promise<void> {
    const finalBonusId = bonusId || uuidv4();
    const ref = doc(
      this.firestore,
      this.buildBonusDocPath(roomId, employeeId, year, finalBonusId)
    );

    const data = { ...payload };
    Object.keys(data).forEach((key) => {
      if (data[key] === undefined) {
        delete data[key];
      }
    });

    await setDoc(ref, data, { merge: true });
  }

  /**
   * 賞与を取得（新パス構造）
   */
  async getBonus(
    roomId: string,
    employeeId: string,
    year: number,
    bonusId: string
  ): Promise<any | null> {
    const ref = doc(
      this.firestore,
      this.buildBonusDocPath(roomId, employeeId, year, bonusId)
    );
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...snapshot.data() };
  }

  /**
   * 指定年度の賞与一覧を取得（新パス構造）
   */
  async listBonuses(
    roomId: string,
    employeeId: string,
    year: number
  ): Promise<any[]> {
    const ref = collection(
      this.firestore,
      this.buildBonusCollectionPath(roomId, employeeId, year)
    );
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    }));
  }

  /**
   * 賞与を削除（新パス構造）
   */
  async deleteBonus(
    roomId: string,
    employeeId: string,
    year: number,
    bonusId: string
  ): Promise<void> {
    const ref = doc(
      this.firestore,
      this.buildBonusDocPath(roomId, employeeId, year, bonusId)
    );
    await deleteDoc(ref);
  }
}
