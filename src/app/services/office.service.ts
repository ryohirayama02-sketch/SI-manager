import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
} from '@angular/fire/firestore';
import { Office } from '../models/office.model';

@Injectable({ providedIn: 'root' })
export class OfficeService {
  constructor(private firestore: Firestore) {}

  /**
   * 事業所マスタを保存
   */
  async saveOffice(office: Office): Promise<string> {
    let docId: string;
    if (office.id) {
      docId = office.id;
    } else {
      const newRef = doc(collection(this.firestore, 'offices'));
      docId = newRef.id;
    }

    const dataToSave: any = {
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
    return docId;
  }

  /**
   * 事業所マスタを取得
   */
  async getOffice(officeId: string): Promise<Office | null> {
    const ref = doc(this.firestore, 'offices', officeId);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      const data = snapshot.data();
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
   * 全事業所マスタを取得
   */
  async getAllOffices(): Promise<Office[]> {
    const ref = collection(this.firestore, 'offices');
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
   * 事業所マスタを削除
   */
  async deleteOffice(officeId: string): Promise<void> {
    const ref = doc(this.firestore, 'offices', officeId);
    await deleteDoc(ref);
  }
}
