import { Injectable } from '@angular/core';
import { Firestore, collection, addDoc, query, where, getDocs, orderBy, limit } from '@angular/fire/firestore';
import { EmployeeChangeHistory } from '../models/employee-change-history.model';

@Injectable({ providedIn: 'root' })
export class EmployeeChangeHistoryService {
  constructor(private firestore: Firestore) {}

  /**
   * 変更履歴を保存（重複チェック付き）
   * 同じ従業員、同じ変更種別、同じ変更日、同じ変更内容（oldValue/newValue）の場合は重複とみなす
   */
  async saveChangeHistory(history: Omit<EmployeeChangeHistory, 'id' | 'createdAt'>): Promise<void> {
    // 同じ従業員、同じ変更種別、同じ変更日の履歴を取得
    const col = collection(this.firestore, 'employeeChangeHistory');
    const q = query(
      col,
      where('employeeId', '==', history.employeeId),
      where('changeType', '==', history.changeType),
      where('changeDate', '==', history.changeDate)
    );
    
    const existingSnapshot = await getDocs(q);
    
    // 既存の履歴の中に、同じ変更内容（oldValue/newValue）のものがあるかチェック
    if (!existingSnapshot.empty) {
      const isDuplicate = existingSnapshot.docs.some(doc => {
        const data = doc.data();
        return data['oldValue'] === history.oldValue && data['newValue'] === history.newValue;
      });
      
      if (isDuplicate) {
        console.log(`[employee-change-history] 同じ変更内容の履歴が既に存在するためスキップ: ${history.employeeId}, ${history.changeType}, ${history.changeDate}, ${history.oldValue} → ${history.newValue}`);
        return;
      }
    }
    
    // 新しい変更履歴を保存（同じ日でも変更内容が異なる場合は保存）
    console.log(`[employee-change-history] 新しい変更履歴を保存: ${history.employeeId}, ${history.changeType}, ${history.changeDate}, ${history.oldValue} → ${history.newValue}`);
    await addDoc(col, {
      ...history,
      createdAt: new Date(),
    });
    console.log(`[employee-change-history] 変更履歴の保存が完了しました`);
  }

  /**
   * 従業員の変更履歴を取得（変更日から5日以内のもののみ）
   */
  async getRecentChangeHistory(employeeId: string, days: number = 5): Promise<EmployeeChangeHistory[]> {
    const col = collection(this.firestore, 'employeeChangeHistory');
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const q = query(
      col,
      where('employeeId', '==', employeeId),
      where('changeDate', '>=', cutoffDateStr),
      orderBy('changeDate', 'desc')
    );

    const snapshot = await getDocs(q);
    const histories = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data()['createdAt']?.toDate() || new Date(),
    } as EmployeeChangeHistory));

    // メモリ上でcreatedAtでソート
    return histories.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 全従業員の変更履歴を取得（変更日から5日以内のもののみ）
   */
  async getAllRecentChangeHistory(days: number = 5): Promise<EmployeeChangeHistory[]> {
    const col = collection(this.firestore, 'employeeChangeHistory');
    const today = new Date();
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const q = query(
      col,
      where('changeDate', '>=', cutoffDateStr),
      orderBy('changeDate', 'desc')
    );

    const snapshot = await getDocs(q);
    const histories = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data()['createdAt']?.toDate() || new Date(),
    } as EmployeeChangeHistory));

    // メモリ上でcreatedAtでソート
    return histories.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

