import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  Timestamp,
  deleteDoc,
} from '@angular/fire/firestore';
import { UncollectedPremium } from '../models/uncollected-premium.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RoomIdService } from './room-id.service';

/**
 * UncollectedPremiumService
 *
 * 徴収不能額（会社立替額）の管理を行うサービス
 * 月次給与が本人負担保険料を下回る場合の差額を記録・管理
 */
@Injectable({ providedIn: 'root' })
export class UncollectedPremiumService {
  constructor(
    private firestore: Firestore,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 徴収不能額を計算してFirestoreに保存
   * @param employeeId 従業員ID
   * @param year 年
   * @param month 月（1-12）
   * @param totalSalary 総支給額
   * @param employeeTotalPremium 本人負担保険料合計
   */
  async saveUncollectedPremium(
    employeeId: string,
    year: number,
    month: number,
    totalSalary: number,
    employeeTotalPremium: number
  ): Promise<void> {
    // 徴収不能額を計算
    // 条件：総支給額 < 本人負担保険料
    // 本人負担保険料は、確定した標準報酬月額（定時決定・随時改定・資格取得時決定）に基づいて計算される

    console.log(`[徴収不能保存] 従業員ID: ${employeeId}, ${year}年${month}月`, {
      totalSalary,
      employeeTotalPremium,
      condition: totalSalary < employeeTotalPremium,
      uncollectedAmount:
        totalSalary < employeeTotalPremium
          ? employeeTotalPremium - totalSalary
          : 0,
    });

    const roomId = this.roomIdService.requireRoomId();

    if (totalSalary < employeeTotalPremium) {
      const uncollectedAmount = employeeTotalPremium - totalSalary;

      console.log(
        `[徴収不能保存] アラート生成: ${year}年${month}月, 徴収不能額=${uncollectedAmount}円`
      );

      // ドキュメントIDを生成（employeeId_year_month）
      const docId = `${employeeId}_${year}_${month}`;
      const ref = doc(
        this.firestore,
        `rooms/${roomId}/uncollected-premiums/${docId}`
      );

      const data: Omit<UncollectedPremium, 'id'> = {
        employeeId,
        year,
        month,
        amount: uncollectedAmount,
        createdAt: Timestamp.now(),
        reason: '給与 < 本人負担保険料 による徴収不能',
        resolved: false,
      };

      await setDoc(ref, data, { merge: true });
      console.log(
        `[徴収不能保存] Firestoreに保存完了: docId=${docId}, amount=${uncollectedAmount}円`
      );
    } else {
      console.log(
        `[徴収不能保存] アラートなし: 総支給額(${totalSalary}円) >= 本人負担保険料(${employeeTotalPremium}円)`
      );

      // 徴収不能額が0以下の場合は、既存データがあれば削除
      const docId = `${employeeId}_${year}_${month}`;
      const ref = doc(
        this.firestore,
        `rooms/${roomId}/uncollected-premiums/${docId}`
      );
      const snapshot = await getDocs(
        query(
          collection(this.firestore, `rooms/${roomId}/uncollected-premiums`),
          where('__name__', '==', docId)
        )
      );
      if (!snapshot.empty) {
        console.log(
          `[徴収不能保存] 既存データを解消済みに更新: docId=${docId}`
        );
        // 金額を0に更新してresolvedをtrueにする（削除ではなく更新）
        await setDoc(
          ref,
          {
            employeeId,
            year,
            month,
            amount: 0,
            createdAt: Timestamp.now(),
            reason: '給与 >= 本人負担保険料 により解消',
            resolved: true,
          },
          { merge: true }
        );
      }
    }
  }

  /**
   * 従業員別・月別の徴収不能額を取得
   * @param employeeId 従業員ID（省略時は全従業員）
   * @param year 年（省略時は全年度）
   * @param resolved 対応済みフラグ（省略時は全件）
   */
  async getUncollectedPremiums(
    employeeId?: string,
    year?: number,
    resolved?: boolean
  ): Promise<UncollectedPremium[]> {
    const roomId = this.roomIdService.requireRoomId(); // roomId は必ず取得される

    const snapshot = await getDocs(
      collection(this.firestore, `rooms/${roomId}/uncollected-premiums`)
    );
    const premiums: UncollectedPremium[] = [];

    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const premium: UncollectedPremium = {
        id: docSnapshot.id,
        employeeId: data['employeeId'],
        year: data['year'],
        month: data['month'],
        amount: data['amount'],
        createdAt: data['createdAt'],
        reason: data['reason'],
        resolved: data['resolved'] ?? false,
      };

      // クライアント側でフィルタ
      if (employeeId && premium.employeeId !== employeeId) {
        return;
      }
      if (year !== undefined && premium.year !== year) {
        return;
      }
      if (resolved !== undefined && premium.resolved !== resolved) {
        return;
      }

      premiums.push(premium);
    });

    return premiums;
  }

  /**
   * 未対応の徴収不能額をリアルタイム購読
   * @param year 年（省略時は全年度）
   */
  observeUncollectedPremiums(year?: number): Observable<UncollectedPremium[]> {
    return new Observable((observer) => {
      const roomId = this.roomIdService.requireRoomId();
      const q = query(
        collection(this.firestore, `rooms/${roomId}/uncollected-premiums`)
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const premiums: UncollectedPremium[] = [];

          snapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            const premium: UncollectedPremium = {
              id: docSnapshot.id,
              employeeId: data['employeeId'],
              year: data['year'],
              month: data['month'],
              amount: data['amount'],
              createdAt: data['createdAt'],
              reason: data['reason'],
              resolved: data['resolved'] ?? false,
            };

            // フィルタリング
            if (year !== undefined && premium.year !== year) {
              return;
            }
            if (premium.resolved) {
              return; // 未対応のみ
            }
            if (premium.amount <= 0) {
              return; // 金額が0以下のものは除外
            }

            premiums.push(premium);
          });

          observer.next(premiums);
        },
        (error) => {
          console.error(
            '[UncollectedPremiumService] リアルタイム購読エラー:',
            error
          );
          observer.error(error);
        }
      );

      return () => unsubscribe();
    });
  }

  /**
   * 対応済みフラグを更新
   * @param id ドキュメントID
   * @param resolved 対応済みフラグ
   */
  async updateResolvedStatus(id: string, resolved: boolean): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const ref = doc(
      this.firestore,
      `rooms/${roomId}/uncollected-premiums/${id}`
    );
    await setDoc(ref, { resolved }, { merge: true });
  }

  /**
   * 複数の徴収不能額を一括で対応済みにする
   * @param ids ドキュメントIDの配列
   */
  async markAsResolved(ids: string[]): Promise<void> {
    const promises = ids.map((id) => this.updateResolvedStatus(id, true));
    await Promise.all(promises);
  }

  /**
   * 従業員に紐づく徴収不能アラートを全削除
   */
  async deleteByEmployee(roomId: string, employeeId: string): Promise<void> {
    const snapshot = await getDocs(
      query(
        collection(this.firestore, `rooms/${roomId}/uncollected-premiums`),
        where('employeeId', '==', employeeId)
      )
    );

    for (const docSnap of snapshot.docs) {
      await deleteDoc(docSnap.ref);
    }
  }
}
