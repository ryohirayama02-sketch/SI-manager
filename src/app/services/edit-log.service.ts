import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from '@angular/fire/firestore';
import { EditLog } from '../models/edit-log.model';
import { AuthService } from './auth.service';
import { RoomIdService } from './room-id.service';

@Injectable({ providedIn: 'root' })
export class EditLogService {
  constructor(
    private firestore: Firestore,
    private authService: AuthService,
    private roomIdService: RoomIdService
  ) {}

  private sanitize(value: any) {
    return value === undefined ? null : value;
  }

  /**
   * 編集ログを記録
   */
  async logEdit(
    action: 'create' | 'update' | 'delete',
    entityType: string,
    entityId: string | undefined,
    entityName: string | undefined,
    description: string,
    oldValue?: string,
    newValue?: string
  ): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      console.warn(
        '[EditLogService] ユーザーがログインしていないため、ログを記録できません'
      );
      return;
    }

    const roomId = this.roomIdService.requireRoomId();

    const editLog: Omit<EditLog, 'id'> = {
      userId: currentUser.uid,
      userName: currentUser.displayName || currentUser.email || '不明',
      action,
      entityType,
      entityId,
      entityName,
      description,
      timestamp: new Date(),
      roomId,
      oldValue: this.sanitize(oldValue),
      newValue: this.sanitize(newValue),
    };

    try {
      await addDoc(
        collection(this.firestore, `rooms/${roomId}/editLogs`),
        editLog
      );
    } catch (error) {
      console.error('[EditLogService] ログ記録エラー:', error);
    }
  }

  /**
   * 編集ログを取得（最新順）
   * インデックスエラーを回避するため、まずroomIdでフィルタしてからクライアント側でソート
   */
  async getEditLogs(maxCount: number = 100): Promise<EditLog[]> {
    const roomId = this.roomIdService.requireRoomId();

    try {
      // roomIdでフィルタのみ（インデックス不要）
      const q = query(
        collection(this.firestore, `rooms/${roomId}/editLogs`),
        limit(maxCount * 2) // 余分に取得してクライアント側でソート
      );

      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map((doc) => {
        const data = doc.data();
        let timestamp: Date;

        if (data['timestamp']) {
          if (typeof data['timestamp'].toDate === 'function') {
            timestamp = data['timestamp'].toDate();
          } else if (data['timestamp'] instanceof Date) {
            timestamp = data['timestamp'];
          } else {
            timestamp = new Date(data['timestamp']);
          }
        } else {
          timestamp = new Date();
        }

        return {
          id: doc.id,
          ...data,
          timestamp,
        } as EditLog;
      });

      // クライアント側で日時順にソート（降順）
      logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // 最大件数まで返す
      return logs.slice(0, maxCount);
    } catch (error) {
      console.error('[EditLogService] ログ取得エラー:', error);
      return [];
    }
  }
}
