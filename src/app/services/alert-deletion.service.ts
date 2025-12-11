import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
} from '@angular/fire/firestore';
import { RoomIdService } from './room-id.service';

/**
 * アラート削除を永続化し、再生成時に除外するためのサービス
 */
@Injectable({ providedIn: 'root' })
export class AlertDeletionService {
  constructor(
    private firestore: Firestore,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 削除済みアラートを記録
   * @param type アラート種別（例: 'age', 'leave', 'bonus', 'teiji', 'family', 'qualification', 'suiji'）
   * @param alertId アラートID
   */
  async markAsDeleted(type: string, alertId: string): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const docId = `${type}_${alertId}`;
    const ref = doc(this.firestore, `rooms/${roomId}/alertDeletions/${docId}`);
    await setDoc(ref, {
      type,
      alertId,
      deletedAt: new Date(),
    });
  }

  /**
   * 削除済みアラートIDのセットを取得
   * @param type アラート種別
   */
  async getDeletedIds(type: string): Promise<Set<string>> {
    const roomId = this.roomIdService.requireRoomId();
    const col = collection(this.firestore, `rooms/${roomId}/alertDeletions`);
    const q = query(col, where('type', '==', type));
    const snap = await getDocs(q);
    const ids = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data['alertId']) {
        ids.add(data['alertId']);
      }
    });
    return ids;
  }
}

