import { Injectable } from '@angular/core';
import { Firestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, orderBy } from '@angular/fire/firestore';
import { FamilyMember, FamilyMemberHistory } from '../models/family-member.model';

@Injectable({ providedIn: 'root' })
export class FamilyMemberService {
  constructor(private firestore: Firestore) {}

  /**
   * 家族情報を保存
   */
  async saveFamilyMember(familyMember: FamilyMember): Promise<string> {
    // IDが存在しない場合は新規作成（Firestoreが自動生成）
    let docId: string;
    if (familyMember.id) {
      docId = familyMember.id;
    } else {
      // 新規作成時はランダムなIDを生成
      const newRef = doc(collection(this.firestore, 'familyMembers'));
      docId = newRef.id;
    }
    
    const ref = doc(this.firestore, 'familyMembers', docId);
    // undefinedのフィールドを削除（Firestoreはundefinedをサポートしていない）
    const data: any = {
      employeeId: familyMember.employeeId,
      name: familyMember.name,
      birthDate: familyMember.birthDate,
      relationship: familyMember.relationship,
      livingTogether: familyMember.livingTogether,
      isThirdCategory: familyMember.isThirdCategory,
      updatedAt: new Date(),
      createdAt: familyMember.createdAt || new Date()
    };
    
    // 値がある場合のみ追加
    if (familyMember.expectedIncome !== null && familyMember.expectedIncome !== undefined) {
      data.expectedIncome = familyMember.expectedIncome;
    }
    if (familyMember.supportStartDate) {
      data.supportStartDate = familyMember.supportStartDate;
    }
    if (familyMember.supportEndDate) {
      data.supportEndDate = familyMember.supportEndDate;
    }
    if (familyMember.changeDate) {
      data.changeDate = familyMember.changeDate;
    }
    
    await setDoc(ref, data, { merge: true });
    return docId;
  }

  /**
   * 家族情報を取得
   */
  async getFamilyMember(familyMemberId: string): Promise<FamilyMember | null> {
    const ref = doc(this.firestore, 'familyMembers', familyMemberId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as FamilyMember;
  }

  /**
   * 従業員の家族情報一覧を取得
   */
  async getFamilyMembersByEmployeeId(employeeId: string): Promise<FamilyMember[]> {
    const ref = collection(this.firestore, 'familyMembers');
    const q = query(ref, where('employeeId', '==', employeeId));
    const snapshot = await getDocs(q);
    const members = snapshot.docs.map(doc => {
      const data = doc.data();
      // FirestoreのTimestampをDateに変換
      let createdAt: Date | undefined;
      if (data['createdAt']) {
        if (data['createdAt'].toDate) {
          createdAt = data['createdAt'].toDate();
        } else if (data['createdAt'] instanceof Date) {
          createdAt = data['createdAt'];
        }
      }
      let updatedAt: Date | undefined;
      if (data['updatedAt']) {
        if (data['updatedAt'].toDate) {
          updatedAt = data['updatedAt'].toDate();
        } else if (data['updatedAt'] instanceof Date) {
          updatedAt = data['updatedAt'];
        }
      }
      return { 
        id: doc.id, 
        ...data,
        createdAt,
        updatedAt
      } as FamilyMember;
    });
    // クライアント側でソート（createdAtでソート、なければnameでソート）
    return members.sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
        const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
        return aTime - bTime;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  /**
   * 家族情報を削除
   */
  async deleteFamilyMember(familyMemberId: string): Promise<void> {
    const ref = doc(this.firestore, 'familyMembers', familyMemberId);
    await deleteDoc(ref);
  }

  /**
   * 扶養履歴を保存
   */
  async saveFamilyMemberHistory(history: FamilyMemberHistory): Promise<void> {
    const ref = doc(this.firestore, 'familyMemberHistories', history.id || `temp_${Date.now()}`);
    // undefinedのフィールドを削除（Firestoreはundefinedをサポートしていない）
    const data: any = {
      familyMemberId: history.familyMemberId,
      employeeId: history.employeeId,
      changeDate: history.changeDate,
      changeType: history.changeType,
      createdAt: history.createdAt || new Date()
    };
    
    // 値がある場合のみ追加
    if (history.previousValue !== null && history.previousValue !== undefined) {
      data.previousValue = history.previousValue;
    }
    if (history.newValue !== null && history.newValue !== undefined) {
      data.newValue = history.newValue;
    }
    
    await setDoc(ref, data, { merge: true });
  }

  /**
   * 家族情報の履歴を取得
   */
  async getFamilyMemberHistories(familyMemberId: string): Promise<FamilyMemberHistory[]> {
    const ref = collection(this.firestore, 'familyMemberHistories');
    const q = query(ref, where('familyMemberId', '==', familyMemberId));
    const snapshot = await getDocs(q);
    const histories = snapshot.docs.map(doc => {
      const data = doc.data();
      // FirestoreのTimestampをDateに変換
      let createdAt: Date;
      if (data['createdAt']) {
        if (data['createdAt'].toDate) {
          createdAt = data['createdAt'].toDate();
        } else if (data['createdAt'] instanceof Date) {
          createdAt = data['createdAt'];
        } else {
          createdAt = new Date();
        }
      } else {
        createdAt = new Date();
      }
      return { 
        id: doc.id, 
        ...data,
        createdAt
      } as FamilyMemberHistory;
    });
    // クライアント側でソート（changeDateで降順ソート）
    return histories.sort((a, b) => {
      return b.changeDate.localeCompare(a.changeDate);
    });
  }

  /**
   * 子の年齢を計算して扶養見直しアラートを判定
   */
  calculateAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * 扶養見直しアラートを取得
   */
  getSupportReviewAlerts(familyMembers: FamilyMember[]): FamilyMember[] {
    return familyMembers.filter(member => {
      const age = this.calculateAge(member.birthDate);
      const relationship = member.relationship.toLowerCase();
      // 子の場合、18歳または22歳で扶養見直し
      if (relationship.includes('子') || relationship.includes('child')) {
        return age === 18 || age === 22;
      }
      return false;
    });
  }
}

