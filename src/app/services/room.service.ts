import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';

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
}








