import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
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
      const existingRef = doc(this.firestore, 'offices', docId);
      const existingDoc = await getDoc(existingRef);
      if (existingDoc.exists()) {
        const existingData = existingDoc.data();
        if (existingData['roomId'] !== roomId) {
          throw new Error('この事業所データにアクセスする権限がありません');
        }
      }
    } else {
      const newRef = doc(collection(this.firestore, 'offices'));
      docId = newRef.id;
      isNew = true;
    }

    const dataToSave: any = {
      roomId, // roomIdを自動付与
      updatedAt: new Date(),
      createdAt: office.createdAt || new Date(),
    };

    if (office.officeCode !== null && office.officeCode !== undefined) {
      dataToSave.officeCode = office.officeCode;
    }
    if (office.officeNumber !== null && office.officeNumber !== undefined) {
      dataToSave.officeNumber = office.officeNumber;
    }
    if (
      office.corporateNumber !== null &&
      office.corporateNumber !== undefined
    ) {
      dataToSave.corporateNumber = office.corporateNumber;
    }
    if (office.prefecture !== null && office.prefecture !== undefined) {
      dataToSave.prefecture = office.prefecture;
    }
    if (office.address !== null && office.address !== undefined) {
      dataToSave.address = office.address;
    }
    if (office.officeName !== null && office.officeName !== undefined) {
      dataToSave.officeName = office.officeName;
    }
    if (office.phoneNumber !== null && office.phoneNumber !== undefined) {
      dataToSave.phoneNumber = office.phoneNumber;
    }
    if (office.ownerName !== null && office.ownerName !== undefined) {
      dataToSave.ownerName = office.ownerName;
    }

    const ref = doc(this.firestore, 'offices', docId);
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
    const roomId = this.roomIdService.getCurrentRoomId();
    if (!roomId) {
      console.warn('[OfficeService] roomIdが取得できないため、nullを返します');
      return null;
    }

    const ref = doc(this.firestore, 'offices', officeId);
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
    const roomId = this.roomIdService.getCurrentRoomId();
    if (!roomId) {
      console.warn(
        '[OfficeService] roomIdが取得できないため、空配列を返します'
      );
      return [];
    }

    const ref = collection(this.firestore, 'offices');
    const q = query(ref, where('roomId', '==', roomId));
    const snapshot = await getDocs(q);
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

    const ref = doc(this.firestore, 'offices', officeId);

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
}
