import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  addDoc,
  collectionData,
  updateDoc,
} from '@angular/fire/firestore';
import { Office } from '../models/office.model';
import { RoomIdService } from './room-id.service';
import { EditLogService } from './edit-log.service';

@Injectable({ providedIn: 'root' })
export class OfficeService {
  constructor(
    private firestore: Firestore,
    private roomIdService: RoomIdService,
    private editLogService: EditLogService
  ) {}

  private sanitize(value: any) {
    return value === undefined ? null : value;
  }

  /**
   * 事業所マスタを保存
   */
  async saveOffice(office: Office): Promise<string> {
    const roomId = this.roomIdService.requireRoomId();

    let docId: string;
    let isNew = false;
    if (office.id) {
      docId = office.id;

      // 既存データのroomIdを確認（セキュリティチェック）
      const existingRef = doc(
        this.firestore,
        `rooms/${roomId}/offices/${docId}`
      );
      const existingDoc = await getDoc(existingRef);
      if (existingDoc.exists()) {
        const existingData = existingDoc.data();
        if (existingData['roomId'] !== roomId) {
          throw new Error('この事業所データにアクセスする権限がありません');
        }
      }
    } else {
      const newRef = doc(collection(this.firestore, `rooms/${roomId}/offices`));
      docId = newRef.id;
      isNew = true;
    }

    // id を必ずセットし、undefined を null にサニタイズして保存
    const payload = {
      ...office,
      id: docId,
      roomId,
      updatedAt: new Date(),
      createdAt: office.createdAt ?? new Date(),
    };
    const dataToSave = Object.fromEntries(
      Object.entries(payload).map(([k, v]) => [k, this.sanitize(v)])
    );

    const ref = doc(this.firestore, `rooms/${roomId}/offices/${docId}`);
    await setDoc(ref, dataToSave, { merge: true });

    // 編集ログを記録
    const officeName =
      office.officeName || office.officeCode || office.officeNumber || '不明';
    await this.editLogService.logEdit(
      isNew ? 'create' : 'update',
      'office',
      docId,
      officeName,
      `事業所「${officeName}」を${isNew ? '追加' : '更新'}しました`
    );

    return docId;
  }

  /**
   * 事業所マスタを取得（roomIdで検証）
   */
  async getOffice(officeId: string): Promise<Office | null> {
    const roomId = this.roomIdService.requireRoomId();

    const ref = doc(this.firestore, `rooms/${roomId}/offices/${officeId}`);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      const data = snapshot.data();

      // roomIdの検証（セキュリティチェック）
      if (data['roomId'] !== roomId) {
        console.warn('[OfficeService] roomIdが一致しないため、nullを返します', {
          requestedRoomId: roomId,
          documentRoomId: data['roomId'],
        });
        return null;
      }

      let createdAt: Date | undefined;
      let updatedAt: Date | undefined;

      if (data['createdAt']) {
        if (typeof data['createdAt'].toDate === 'function') {
          createdAt = data['createdAt'].toDate();
        } else if (data['createdAt'] instanceof Date) {
          createdAt = data['createdAt'];
        }
      }
      if (data['updatedAt']) {
        if (typeof data['updatedAt'].toDate === 'function') {
          updatedAt = data['updatedAt'].toDate();
        } else if (data['updatedAt'] instanceof Date) {
          updatedAt = data['updatedAt'];
        }
      }
      return {
        id: snapshot.id,
        ...data,
        createdAt,
        updatedAt,
      } as Office;
    }
    return null;
  }

  /**
   * 全事業所マスタを取得（roomIdでフィルタリング）
   */
  async getAllOffices(): Promise<Office[]> {
    const roomId = this.roomIdService.requireRoomId();

    const ref = collection(this.firestore, `rooms/${roomId}/offices`);
    const snapshot = await getDocs(ref);
    const offices = snapshot.docs.map((doc) => {
      const data = doc.data();
      let createdAt: Date | undefined;
      let updatedAt: Date | undefined;

      if (data['createdAt']) {
        if (typeof data['createdAt'].toDate === 'function') {
          createdAt = data['createdAt'].toDate();
        } else if (data['createdAt'] instanceof Date) {
          createdAt = data['createdAt'];
        }
      }
      if (data['updatedAt']) {
        if (typeof data['updatedAt'].toDate === 'function') {
          updatedAt = data['updatedAt'].toDate();
        } else if (data['updatedAt'] instanceof Date) {
          updatedAt = data['updatedAt'];
        }
      }
      return {
        id: doc.id,
        ...data,
        createdAt,
        updatedAt,
      } as Office;
    });
    // クライアント側でソート（officeCode, officeNumberでソート）
    return offices.sort((a, b) => {
      const codeA = (a.officeCode || '') + (a.officeNumber || '');
      const codeB = (b.officeCode || '') + (b.officeNumber || '');
      return codeA.localeCompare(codeB);
    });
  }

  /**
   * 事業所マスタを削除（roomIdで検証）
   */
  async deleteOffice(officeId: string): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();

    const ref = doc(this.firestore, `rooms/${roomId}/offices/${officeId}`);

    // 既存データのroomIdを確認（セキュリティチェック）
    const existingDoc = await getDoc(ref);
    if (!existingDoc.exists()) {
      throw new Error('事業所データが見つかりません');
    }
    const existingData = existingDoc.data();
    if (existingData['roomId'] !== roomId) {
      throw new Error('この事業所データを削除する権限がありません');
    }

    // 編集ログを記録（削除前に記録）
    const officeName =
      existingData['officeName'] ||
      existingData['officeCode'] ||
      existingData['officeNumber'] ||
      '不明';
    await this.editLogService.logEdit(
      'delete',
      'office',
      officeId,
      officeName,
      `事業所「${officeName}」を削除しました`
    );

    await deleteDoc(ref);
  }

  // ---------- rooms/{roomId}/offices 系（新構造用） ----------

  /**
   * 指定ルームの事業所一覧を取得（リアルタイム購読）
   */
  getOfficesByRoom(roomId: string) {
    const colRef = collection(this.firestore, `rooms/${roomId}/offices`);
    return collectionData(colRef, { idField: 'id' });
  }

  /**
   * 指定ルームの事業所を取得
   */
  async getOfficeByRoom(
    roomId: string,
    officeId: string
  ): Promise<Office | null> {
    const ref = doc(this.firestore, `rooms/${roomId}/offices/${officeId}`);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as Office) : null;
  }

  /**
   * 指定ルームに事業所を作成（自動ID）
   */
  async createOfficeInRoom(roomId: string, office: Office): Promise<string> {
    const newRef = doc(collection(this.firestore, `rooms/${roomId}/offices`));
    const docId = newRef.id;

    const payload = {
      ...office,
      id: docId,
      roomId,
      createdAt: office.createdAt ?? new Date(),
      updatedAt: new Date(),
    };

    const dataToSave = Object.fromEntries(
      Object.entries(payload).map(([k, v]) => [k, this.sanitize(v)])
    );

    await setDoc(newRef, dataToSave, { merge: true });
    return docId;
  }

  /**
   * 指定ルームの事業所を更新（roomId を保持）
   */
  async updateOfficeInRoom(
    roomId: string,
    officeId: string,
    office: Office
  ): Promise<void> {
    const ref = doc(this.firestore, `rooms/${roomId}/offices/${officeId}`);
    const payload = { ...office, roomId };
    await updateDoc(ref, payload as any);
  }

  /**
   * 指定ルームの事業所を削除
   */
  async deleteOfficeInRoom(roomId: string, officeId: string): Promise<void> {
    const ref = doc(this.firestore, `rooms/${roomId}/offices/${officeId}`);
    await deleteDoc(ref);
  }
}
