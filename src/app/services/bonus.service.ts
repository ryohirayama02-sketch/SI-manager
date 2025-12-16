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
    if (!roomId || !employeeId || !bonusId) {
      throw new Error('buildBonusDocPath: 必須パラメータが不足しています');
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      throw new Error(`buildBonusDocPath: 無効な年度: ${year}`);
    }
    return `rooms/${roomId}/bonuses/${employeeId}/years/${year}/bonuses/${bonusId}`;
  }

  private buildBonusCollectionPath(
    roomId: string,
    employeeId: string,
    year: number
  ): string {
    if (!roomId || !employeeId) {
      throw new Error('buildBonusCollectionPath: 必須パラメータが不足しています');
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      throw new Error(`buildBonusCollectionPath: 無効な年度: ${year}`);
    }
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
    if (!roomId || !employeeId) {
      throw new Error('saveBonus: roomIdとemployeeIdは必須です');
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      throw new Error(`saveBonus: 無効な年度: ${year}`);
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('saveBonus: payloadはオブジェクトである必要があります');
    }

    try {
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
    } catch (error) {
      console.error(`[BonusService] saveBonusエラー: roomId=${roomId}, employeeId=${employeeId}, year=${year}`, error);
      throw error;
    }
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
    if (!roomId || !employeeId || !bonusId) {
      return null;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return null;
    }

    try {
      const ref = doc(
        this.firestore,
        this.buildBonusDocPath(roomId, employeeId, year, bonusId)
      );
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        return null;
      }
      const data = snapshot.data();
      if (!data) {
        return null;
      }
      return { id: snapshot.id, ...data };
    } catch (error) {
      console.error(`[BonusService] getBonusエラー: roomId=${roomId}, employeeId=${employeeId}, year=${year}, bonusId=${bonusId}`, error);
      return null;
    }
  }

  /**
   * 指定年度の賞与一覧を取得（新パス構造）
   */
  async listBonuses(
    roomId: string,
    employeeId: string,
    year: number
  ): Promise<any[]> {
    if (!roomId || !employeeId) {
      return [];
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return [];
    }

    try {
      const ref = collection(
        this.firestore,
        this.buildBonusCollectionPath(roomId, employeeId, year)
      );
      const snapshot = await getDocs(ref);
      if (!snapshot || !snapshot.docs) {
        return [];
      }
      return snapshot.docs
        .map((docSnapshot) => {
          if (!docSnapshot || !docSnapshot.exists()) {
            return null;
          }
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            ...data,
          };
        })
        .filter((bonus) => bonus !== null);
    } catch (error) {
      console.error(`[BonusService] listBonusesエラー: roomId=${roomId}, employeeId=${employeeId}, year=${year}`, error);
      return [];
    }
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
    if (!roomId || !employeeId || !bonusId) {
      throw new Error('deleteBonus: roomId、employeeId、bonusIdは必須です');
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      throw new Error(`deleteBonus: 無効な年度: ${year}`);
    }

    try {
      const ref = doc(
        this.firestore,
        this.buildBonusDocPath(roomId, employeeId, year, bonusId)
      );
      await deleteDoc(ref);
    } catch (error) {
      console.error(`[BonusService] deleteBonusエラー: roomId=${roomId}, employeeId=${employeeId}, year=${year}, bonusId=${bonusId}`, error);
      throw error;
    }
  }
}
