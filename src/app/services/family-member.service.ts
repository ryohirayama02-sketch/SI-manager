import { Injectable } from '@angular/core';
import { Firestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, orderBy } from '@angular/fire/firestore';
import { FamilyMember, FamilyMemberHistory } from '../models/family-member.model';

@Injectable({ providedIn: 'root' })
export class FamilyMemberService {
  constructor(private firestore: Firestore) {}

  /**
   * 家族情報を保存
   */
  async saveFamilyMember(familyMember: FamilyMember): Promise<void> {
    const ref = doc(this.firestore, 'familyMembers', familyMember.id || `temp_${Date.now()}`);
    const data = {
      ...familyMember,
      updatedAt: new Date(),
      createdAt: familyMember.createdAt || new Date()
    };
    await setDoc(ref, data, { merge: true });
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
    const q = query(ref, where('employeeId', '==', employeeId), orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FamilyMember));
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
    const data = {
      ...history,
      createdAt: history.createdAt || new Date()
    };
    await setDoc(ref, data, { merge: true });
  }

  /**
   * 家族情報の履歴を取得
   */
  async getFamilyMemberHistories(familyMemberId: string): Promise<FamilyMemberHistory[]> {
    const ref = collection(this.firestore, 'familyMemberHistories');
    const q = query(ref, where('familyMemberId', '==', familyMemberId), orderBy('changeDate', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FamilyMemberHistory));
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

