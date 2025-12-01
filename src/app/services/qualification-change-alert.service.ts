import { Injectable } from '@angular/core';
import { Firestore, collection, doc, setDoc, getDocs } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class QualificationChangeAlertService {
  constructor(private firestore: Firestore) {}

  /**
   * 削除済みアラートIDを保存
   */
  async markAsDeleted(alertId: string): Promise<void> {
    const ref = doc(this.firestore, `qualificationChangeAlertDeletions/${alertId}`);
    await setDoc(ref, {
      deletedAt: new Date(),
    });
  }

  /**
   * 削除済みアラートIDのリストを取得
   */
  async getDeletedAlertIds(): Promise<Set<string>> {
    const col = collection(this.firestore, 'qualificationChangeAlertDeletions');
    const snapshot = await getDocs(col);
    const deletedIds = new Set<string>();
    snapshot.docs.forEach(doc => {
      deletedIds.add(doc.id);
    });
    return deletedIds;
  }
}

