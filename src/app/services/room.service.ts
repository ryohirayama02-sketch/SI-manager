import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

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
}
