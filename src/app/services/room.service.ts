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
    const roomRef = doc(this.firestore, `rooms/${roomId}`);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
      return false;
    }

    const roomData = roomSnap.data();
    return roomData['password'] === password;
  }

  async createRoom(
    roomId: string,
    password: string,
    companyName: string,
    userId: string
  ): Promise<boolean> {
    try {
      // 既に存在するかチェック
      const roomRef = doc(this.firestore, `rooms/${roomId}`);
      const roomSnap = await getDoc(roomRef);

      if (roomSnap.exists()) {
        throw new Error('この企業IDは既に使用されています');
      }

      // 新規ルームを作成
      const roomData: RoomData = {
        password,
        companyName,
        createdAt: new Date(),
        createdBy: userId,
      };

      await setDoc(roomRef, roomData);
      return true;
    } catch (error) {
      console.error('[RoomService] createRoom: エラー', error);
      throw error;
    }
  }

  async getRoom(roomId: string): Promise<RoomData | null> {
    try {
      const roomRef = doc(this.firestore, `rooms/${roomId}`);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        return null;
      }

      const data = roomSnap.data();
      return {
        password: data['password'],
        companyName: data['companyName'],
        createdAt: data['createdAt']?.toDate() || new Date(),
        createdBy: data['createdBy'],
      };
    } catch (error) {
      console.error('[RoomService] getRoom: エラー', error);
      throw error;
    }
  }

  /**
   * ユーザーが所属するルーム一覧を取得
   */
  async getUserRooms(uid: string): Promise<{ roomId: string; joinedAt?: Date }[]> {
    const colRef = collection(this.firestore, `users/${uid}/rooms`);
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        roomId: d.id,
        joinedAt: data['joinedAt']?.toDate?.() || data['joinedAt'],
      };
    });
  }

  /**
   * ユーザーのルーム所属を作成（既存なら何もしない）
   */
  async ensureUserRoomMembership(uid: string, roomId: string): Promise<void> {
    const ref = doc(this.firestore, `users/${uid}/rooms/${roomId}`);
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    await setDoc(ref, { joinedAt: serverTimestamp() });
  }
}








