import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  getDocs,
  orderBy,
  limit,
  doc,
  deleteDoc,
  where,
} from '@angular/fire/firestore';
import { RoomIdService } from './room-id.service';
import { EmployeeChangeHistory } from '../models/employee-change-history.model';

@Injectable({ providedIn: 'root' })
export class EmployeeChangeHistoryService {
  constructor(
    private firestore: Firestore,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 変更履歴を保存（重複チェック付き）
   * 同じ従業員、同じ変更種別、同じ変更日、同じ変更内容（oldValue/newValue）の場合は重複とみなす
   */
  async saveChangeHistory(
    history: Omit<EmployeeChangeHistory, 'id' | 'createdAt'>
  ): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const col = collection(
      this.firestore,
      `rooms/${roomId}/employees/${history.employeeId}/employeeChangeHistory`
    );
    const existingSnapshot = await getDocs(col);

    // 既存の履歴の中に、同じ変更内容（oldValue/newValue）のものがあるかチェック
    if (!existingSnapshot.empty) {
      const isDuplicate = existingSnapshot.docs.some((doc) => {
        const data = doc.data();
        return (
          data['oldValue'] === history.oldValue &&
          data['newValue'] === history.newValue
        );
      });

      if (isDuplicate) {
        return;
      }
    }

    // 新しい変更履歴を保存（同じ日でも変更内容が異なる場合は保存）
    const payload = { ...history, createdAt: new Date(), roomId };
    // 個別従業員配下に保存
    await addDoc(col, payload);
    // 集約用コレクションにも保存（一覧取得で使用）
    const roomCol = collection(
      this.firestore,
      `rooms/${roomId}/employeeChangeHistory`
    );
    await addDoc(roomCol, payload);
  }

  /**
   * 従業員の変更履歴を取得（変更日から5日以内のもののみ）
   */
  async getRecentChangeHistory(
    employeeId: string,
    days: number = 5
  ): Promise<EmployeeChangeHistory[]> {
    const roomId = this.roomIdService.requireRoomId();
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const col = collection(
      this.firestore,
      `rooms/${roomId}/employees/${employeeId}/employeeChangeHistory`
    );
    const q = query(col, orderBy('changeDate', 'desc'));

    const snapshot = await getDocs(col);
    const histories = snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data()['createdAt']?.toDate() || new Date(),
        } as EmployeeChangeHistory)
    );

    // メモリ上でcreatedAtでソート
    return histories.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * 全従業員の変更履歴を取得（変更日から5日以内のもののみ）
   */
  async getAllRecentChangeHistory(
    days: number = 5
  ): Promise<EmployeeChangeHistory[]> {
    const roomId = this.roomIdService.requireRoomId();
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const col = collection(
      this.firestore,
      `rooms/${roomId}/employeeChangeHistory`
    );
    const q = query(col, orderBy('changeDate', 'desc'));

    const snapshot = await getDocs(col);
    const histories = snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data()['createdAt']?.toDate() || new Date(),
        } as EmployeeChangeHistory)
    );

    // メモリ上でcreatedAtでソート
    return histories.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * 従業員に紐づく変更履歴を全て削除
   * @param roomId ルームID
   * @param employeeId 従業員ID
   */
  async deleteByEmployee(roomId: string, employeeId: string): Promise<void> {
    if (!roomId || !employeeId) {
      throw new Error('roomIdとemployeeIdは必須です');
    }

    try {
      // 1. サブコレクション（個別従業員配下）の変更履歴を削除
      const subCol = collection(
        this.firestore,
        `rooms/${roomId}/employees/${employeeId}/employeeChangeHistory`
      );
      const subSnapshot = await getDocs(subCol);
      for (const docSnap of subSnapshot.docs) {
        await deleteDoc(docSnap.ref);
      }

      // 2. 集約用コレクションから該当従業員の変更履歴を削除
      const roomCol = collection(
        this.firestore,
        `rooms/${roomId}/employeeChangeHistory`
      );
      const roomQuery = query(roomCol, where('employeeId', '==', employeeId));
      const roomSnapshot = await getDocs(roomQuery);
      for (const docSnap of roomSnapshot.docs) {
        await deleteDoc(docSnap.ref);
      }
    } catch (error) {
      console.error(
        `[EmployeeChangeHistoryService] deleteByEmployeeエラー: roomId=${roomId}, employeeId=${employeeId}`,
        error
      );
      // エラーが発生しても処理を継続（他の削除処理に影響を与えないため）
      throw error;
    }
  }
}
