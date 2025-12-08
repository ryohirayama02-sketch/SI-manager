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
        console.log(
          `[employee-change-history] 同じ変更内容の履歴が既に存在するためスキップ: ${history.employeeId}, ${history.changeType}, ${history.changeDate}, ${history.oldValue} → ${history.newValue}`
        );
        return;
      }
    }

    // 新しい変更履歴を保存（同じ日でも変更内容が異なる場合は保存）
    console.log(
      `[employee-change-history] 新しい変更履歴を保存: ${history.employeeId}, ${history.changeType}, ${history.changeDate}, ${history.oldValue} → ${history.newValue}`
    );
    await addDoc(col, { ...history, createdAt: new Date(), roomId });
    console.log(`[employee-change-history] 変更履歴の保存が完了しました`);
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
}
