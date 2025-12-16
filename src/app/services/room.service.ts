import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp,
} from '@angular/fire/firestore';

export interface RoomData {
  password: string;
  companyName?: string;
  createdAt: Date;
  createdBy: string;
}

@Injectable({ providedIn: 'root' })
export class RoomService {
  constructor(private firestore: Firestore) {}

  async verifyRoom(roomId: string, password: string): Promise<boolean> {
    try {
      if (!roomId || !password) {
        return false;
      }

      const roomRef = doc(this.firestore, `rooms/${roomId}`);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        return false;
      }

      const roomData = roomSnap.data();
      if (!roomData) {
        return false;
      }

      return roomData['password'] === password;
    } catch (error) {
      // エラーが発生した場合はfalseを返す
      return false;
    }
  }

  async createRoom(
    roomId: string,
    password: string,
    companyName: string,
    userId: string
  ): Promise<boolean> {
    try {
      if (!roomId || !password || !userId) {
        throw new Error('必須パラメータが不足しています');
      }

      // 既に存在するかチェック
      const roomRef = doc(this.firestore, `rooms/${roomId}`);
      const roomSnap = await getDoc(roomRef);

      if (roomSnap.exists()) {
        throw new Error('この企業IDは既に使用されています');
      }

      // 新規ルームを作成
      const roomData: RoomData = {
        password,
        companyName: companyName || '',
        createdAt: new Date(),
        createdBy: userId,
      };

      await setDoc(roomRef, roomData);
      return true;
    } catch (error) {
      // エラーは呼び出し元に伝播させる（エラーメッセージを保持）
      throw error;
    }
  }

  async getRoom(roomId: string): Promise<RoomData | null> {
    try {
      if (!roomId) {
        return null;
      }

      const roomRef = doc(this.firestore, `rooms/${roomId}`);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        return null;
      }

      const data = roomSnap.data();
      if (!data) {
        return null;
      }

      return {
        password: data['password'] || '',
        companyName: data['companyName'] || '',
        createdAt: data['createdAt']?.toDate() || new Date(),
        createdBy: data['createdBy'] || '',
      };
    } catch (error) {
      // エラーが発生した場合はnullを返す（呼び出し元でエラーハンドリング）
      return null;
    }
  }

  /**
   * ユーザーが所属するルーム一覧を取得
   */
  async getUserRooms(uid: string): Promise<{ roomId: string; joinedAt?: Date }[]> {
    try {
      if (!uid) {
        return [];
      }

      const colRef = collection(this.firestore, `users/${uid}/rooms`);
      const snap = await getDocs(colRef);
      if (!snap || !snap.docs) {
        return [];
      }
      const results: { roomId: string; joinedAt?: Date }[] = [];
      for (const d of snap.docs) {
        try {
          const data = d.data();
          if (data) {
            results.push({
              roomId: d.id,
              joinedAt: data['joinedAt']?.toDate?.() || data['joinedAt'],
            });
          }
        } catch (error) {
          // エラーが発生したドキュメントはスキップ
          continue;
        }
      }
      return results;
    } catch (error) {
      // エラーが発生した場合は空配列を返す
      return [];
    }
  }

  /**
   * ユーザーのルーム所属を作成（既存なら何もしない）
   */
  async ensureUserRoomMembership(uid: string, roomId: string): Promise<void> {
    try {
      if (!uid || !roomId) {
        return;
      }

      const ref = doc(this.firestore, `users/${uid}/rooms/${roomId}`);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        return;
      }
      await setDoc(ref, { joinedAt: serverTimestamp() });
    } catch (error) {
      // エラーは静かに処理（メンバーシップの作成に失敗してもアプリケーションの動作に影響しないため）
    }
  }
}








