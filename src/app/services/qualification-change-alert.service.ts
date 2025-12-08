import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDocs,
} from '@angular/fire/firestore';
import { RoomIdService } from './room-id.service';

@Injectable({ providedIn: 'root' })
export class QualificationChangeAlertService {
  constructor(
    private firestore: Firestore,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 削除済みアラートIDを保存
   */
  async markAsDeleted(alertId: string): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/qualificationChangeAlertDeletions/${alertId}`
    );
    await setDoc(ref, {
      deletedAt: new Date(),
    });
  }

  /**
   * 削除済みアラートIDのリストを取得
   */
  async getDeletedAlertIds(): Promise<Set<string>> {
    const roomId = this.roomIdService.requireRoomId();
    const col = collection(
      this.firestore,
      `rooms/${roomId}/qualificationChangeAlertDeletions`
    );
    const snapshot = await getDocs(col);
    const deletedIds = new Set<string>();
    snapshot.docs.forEach((doc) => {
      deletedIds.add(doc.id);
    });
    return deletedIds;
  }
}
