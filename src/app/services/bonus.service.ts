import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from '@angular/fire/firestore';
import { serverTimestamp } from 'firebase/firestore';
import { Bonus } from '../models/bonus.model';

@Injectable({ providedIn: 'root' })
export class BonusService {
  constructor(private firestore: Firestore) {}

  async addBonus(bonus: Bonus): Promise<void> {
    const col = collection(this.firestore, 'bonuses');
    await addDoc(col, bonus);
  }

  async getBonusCountByYear(employeeId: string, year: number): Promise<number> {
    const col = collection(this.firestore, 'bonuses');
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const q = query(
      col,
      where('employeeId', '==', employeeId),
      where('payDate', '>=', startDate),
      where('payDate', '<=', endDate)
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
  }

  async getBonusCountLast12Months(
    employeeId: string,
    payDate: Date
  ): Promise<number> {
    // 過去12ヶ月（支給日ベース）の賞与を取得
    const bonuses = await this.getBonusesLast12Months(employeeId, payDate);
    return bonuses.length;
  }

  /**
   * 過去12ヶ月（支給日ベース）の賞与を取得
   * @param employeeId 従業員ID
   * @param payDate 現在の支給日
   * @returns 過去12ヶ月の賞与リスト（今回の支給日を含む）
   */
  async getBonusesLast12Months(
    employeeId: string,
    payDate: Date
  ): Promise<Bonus[]> {
    // 支給日から12ヶ月前の日付を計算
    const startDate = new Date(payDate);
    startDate.setMonth(startDate.getMonth() - 12);
    const startDateISO = startDate.toISOString().split('T')[0];
    // 支給日当日まで（今回の支給日を含む）
    const endDateISO = payDate.toISOString().split('T')[0];
    
    // 過去12ヶ月に含まれる可能性のある年度を取得
    const startYear = startDate.getFullYear();
    const endYear = payDate.getFullYear();
    const yearsToCheck: number[] = [];
    for (let year = startYear; year <= endYear; year++) {
      yearsToCheck.push(year);
    }
    
    const allBonuses: Bonus[] = [];
    
    // 各年度の賞与データを取得
    for (const year of yearsToCheck) {
      try {
        const path = `bonus/${year}/employees/${employeeId}/items`;
        const ref = collection(this.firestore, path);
        
        // payDateでフィルタリング（過去12ヶ月の期間内）
        const q = query(
          ref,
          where('payDate', '>=', startDateISO),
          where('payDate', '<=', endDateISO)
        );
        
        const snapshot = await getDocs(q);
        const bonuses = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Bonus)
        );
        
        allBonuses.push(...bonuses);
      } catch (error) {
        // 年度のコレクションが存在しない場合はスキップ
        console.log(`[bonus.service] 年度${year}の賞与データが存在しません:`, error);
      }
    }
    
    // payDateで再度フィルタリング（念のため）
    const filteredBonuses = allBonuses.filter(bonus => {
      if (!bonus.payDate) return false;
      const payDateStr = bonus.payDate;
      return payDateStr >= startDateISO && payDateStr <= endDateISO;
    });
    
    console.log(
      `[bonus.service] 過去12ヶ月で取得した賞与データ: ${filteredBonuses.length}件`,
      filteredBonuses.map(b => ({ payDate: b.payDate, amount: b.amount }))
    );
    
    return filteredBonuses;
  }

  async getBonusesByEmployee(
    employeeId: string,
    payDate?: Date
  ): Promise<Bonus[]> {
    const col = collection(this.firestore, 'bonuses');
    const baseDate = payDate || new Date();
    const startDate = new Date(baseDate);
    startDate.setMonth(startDate.getMonth() - 12);
    const startDateISO = startDate.toISOString().split('T')[0];

    const q = query(
      col,
      where('employeeId', '==', employeeId),
      where('payDate', '>=', startDateISO)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Bonus));
  }

  async getBonusesForResult(
    employeeId: string,
    year: number
  ): Promise<Bonus[]> {
    const path = `bonus/${year}/employees/${employeeId}/items`;
    console.log(
      `[bonus.service] 賞与取得: 年度=${year}, 従業員ID=${employeeId}, パス=${path}`
    );
    const ref = collection(this.firestore, path);
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    // payDateでフィルタリング（パス構造で年度は既に分離されているが、念のため）
    const q = query(
      ref,
      where('payDate', '>=', startDate),
      where('payDate', '<=', endDate)
    );
    
    const snapshot = await getDocs(q);
    let bonuses = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Bonus)
    );
    
    // yearフィールドでもフィルタリング（データの整合性を保つため）
    bonuses = bonuses.filter(bonus => {
      // yearフィールドを優先的に使用
      if (bonus.year !== undefined && bonus.year !== null) {
        return bonus.year === year;
      }
      // フォールバック: payDateから年度を判定
      if (bonus.payDate) {
        const payDateObj = new Date(bonus.payDate);
        return payDateObj.getFullYear() === year;
      }
      return false;
    });
    
    // yearフィールドがない場合は、payDateから設定（データの整合性を保つため）
    bonuses.forEach(bonus => {
      if (!bonus.year && bonus.payDate) {
        const payDateObj = new Date(bonus.payDate);
        bonus.year = payDateObj.getFullYear();
      }
    });
    
    // 賞与入力画面で免除期間中の賞与は0として保存されているため、
    // 他の画面では単純に保存されているデータ（amount=0のものも含む）を参照するだけ
    // amount=0の賞与は計算時に除外される
    console.log(`[bonus.service] 取得した賞与データ:`, bonuses);
    // デバッグ用：各賞与データの詳細をログ出力
    bonuses.forEach((bonus, index) => {
      console.log(`[bonus.service] 賞与データ[${index}]:`, {
        id: bonus.id,
        employeeId: bonus.employeeId,
        year: bonus.year,
        month: bonus.month,
        amount: bonus.amount,
        payDate: bonus.payDate,
        healthEmployee: bonus.healthEmployee,
        healthEmployer: bonus.healthEmployer,
        careEmployee: bonus.careEmployee,
        careEmployer: bonus.careEmployer,
        pensionEmployee: bonus.pensionEmployee,
        pensionEmployer: bonus.pensionEmployer,
        isExempted: bonus.isExempted,
        isSalaryInsteadOfBonus: bonus.isSalaryInsteadOfBonus
      });
    });
    return bonuses;
  }

  /**
   * 保険年度（4/1〜翌3/31）で賞与を取得（健保・介保の年間上限573万円の集計用）
   * @param employeeId 従業員ID
   * @param referenceDate 基準日（今回の賞与支給日）
   * @returns 保険年度内の賞与データの配列
   */
  async getBonusesForHealthAnnualLimit(
    employeeId: string,
    referenceDate: Date
  ): Promise<Bonus[]> {
    // 基準日が属する保険年度の開始日（4/1）と終了日（翌年3/31）を計算
    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth() + 1; // 1-12
    
    let fiscalYearStart: number;
    let fiscalYearEnd: number;
    
    if (refMonth >= 4) {
      // 4月〜12月の場合：当年度（4/1〜翌年3/31）
      fiscalYearStart = refYear;
      fiscalYearEnd = refYear + 1;
    } else {
      // 1月〜3月の場合：前年度（前年4/1〜当年3/31）
      fiscalYearStart = refYear - 1;
      fiscalYearEnd = refYear;
    }
    
    const startDate = `${fiscalYearStart}-04-01`;
    const endDate = `${fiscalYearEnd}-03-31`;
    
    console.log(
      `[bonus.service] 保険年度で賞与取得: 従業員ID=${employeeId}, 基準日=${referenceDate.toISOString().split('T')[0]}, 保険年度=${startDate}〜${endDate}`
    );
    
    // 保険年度に含まれる可能性のある暦年を取得
    const yearsToCheck = [fiscalYearStart, fiscalYearEnd];
    const allBonuses: Bonus[] = [];
    
    for (const year of yearsToCheck) {
      const path = `bonus/${year}/employees/${employeeId}/items`;
      const ref = collection(this.firestore, path);
      
      // payDateでフィルタリング（保険年度の期間内）
      const q = query(
        ref,
        where('payDate', '>=', startDate),
        where('payDate', '<=', endDate)
      );
      
      const snapshot = await getDocs(q);
      const bonuses = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Bonus)
      );
      
      allBonuses.push(...bonuses);
    }
    
    // payDateで再度フィルタリング（念のため）
    const filteredBonuses = allBonuses.filter(bonus => {
      if (!bonus.payDate) return false;
      const payDateObj = new Date(bonus.payDate);
      const payDateStr = payDateObj.toISOString().split('T')[0];
      return payDateStr >= startDate && payDateStr <= endDate;
    });
    
    console.log(
      `[bonus.service] 保険年度で取得した賞与データ: ${filteredBonuses.length}件`,
      filteredBonuses.map(b => ({ payDate: b.payDate, amount: b.amount }))
    );
    
    return filteredBonuses;
  }

  /**
   * 賞与を保存する（新しい構造）
   * @param year 年度
   * @param data 賞与データ
   */
  async saveBonus(year: number, data: Bonus): Promise<void> {
    const docId = `${data.employeeId}_${data.month}`;
    const path = `bonus/${year}/employees/${data.employeeId}/items/${docId}`;
    console.log(
      `[bonus.service] 賞与保存: 年度=${year}, パス=${path}, bonus.year=${data.year}`
    );
    const ref = doc(this.firestore, path);

    // undefinedのフィールドを削除し、createdAtを除外（後で正しく処理した値を追加するため）
    const cleanedData: any = {};
    let rawCreatedAt: any = undefined;
    for (const [key, value] of Object.entries(data)) {
      // createdAtは別途処理するため除外
      if (key === 'createdAt') {
        rawCreatedAt = value;
        continue;
      }
      if (value !== undefined) {
        cleanedData[key] = value;
      }
    }

    // createdAtの処理：既存データがある場合は保持、ない場合は新規作成として現在時刻を使用
    // @angular/fireを使用している場合、Dateオブジェクトをそのまま保存するとFirestoreが自動的にTimestampに変換する
    let createdAtValue: any;
    console.log(`[bonus.service] createdAt処理開始:`, { 
      rawCreatedAt, 
      type: typeof rawCreatedAt, 
      isDate: rawCreatedAt instanceof Date,
      hasToDate: rawCreatedAt && typeof rawCreatedAt === 'object' && 'toDate' in rawCreatedAt,
      constructor: rawCreatedAt?.constructor?.name
    });
    
    if (rawCreatedAt) {
      try {
        // FirestoreのTimestampオブジェクトかどうかを判定（toDateメソッドの存在で判定）
        if (rawCreatedAt && typeof rawCreatedAt === 'object' && 'toDate' in rawCreatedAt && typeof (rawCreatedAt as any).toDate === 'function') {
          // FirestoreのTimestampオブジェクトの場合は、Dateに変換（@angular/fireではDateオブジェクトをそのまま保存）
          const dateValue = (rawCreatedAt as any).toDate();
          if (dateValue instanceof Date) {
            createdAtValue = dateValue;
            console.log(`[bonus.service] Firestore TimestampをDateに変換:`, { dateValue });
          } else {
            console.warn(`[bonus.service] toDate()の戻り値がDateではないため、現在時刻を使用:`, dateValue);
            createdAtValue = new Date();
          }
        } else if (rawCreatedAt instanceof Date) {
          // Dateオブジェクトの場合はそのまま使用
          createdAtValue = rawCreatedAt;
          console.log(`[bonus.service] Dateオブジェクトをそのまま使用:`, { createdAtValue });
        } else if (rawCreatedAt && typeof rawCreatedAt === 'object' && 'seconds' in rawCreatedAt && 'nanoseconds' in rawCreatedAt) {
          // Timestamp形式のオブジェクト（seconds/nanosecondsプロパティがある場合）
          // Dateに変換
          try {
            const seconds = (rawCreatedAt as any).seconds;
            createdAtValue = new Date(seconds * 1000);
            console.log(`[bonus.service] seconds/nanosecondsからDateを作成:`, { seconds, createdAtValue });
          } catch (error) {
            console.warn(`[bonus.service] Date作成エラー:`, error);
            createdAtValue = new Date();
          }
        } else {
          // その他の場合は現在時刻を使用（安全のため）
          console.warn(`[bonus.service] createdAtが不明な型のため、現在時刻を使用:`, rawCreatedAt);
          createdAtValue = new Date();
        }
      } catch (error) {
        // エラーが発生した場合は現在時刻を使用
        console.warn(`[bonus.service] createdAtの変換エラー:`, error, rawCreatedAt);
        createdAtValue = new Date();
      }
    } else {
      // 新規作成の場合は、既存データがあるかどうかで判定
      // 既存データがない場合はserverTimestamp()を使用（サーバー側でタイムスタンプを生成）
      // 既存データがある場合は既存のcreatedAtを使用（上記の処理で変換済み）
      createdAtValue = undefined; // undefinedにすると、後でserverTimestamp()を使用するか、new Date()を使用する
      console.log(`[bonus.service] createdAtが未設定のため、undefinedに設定（後で処理）`);
    }
    
    // createdAtがundefinedの場合は、新規作成として現在時刻を使用
    // ただし、上書き保存の場合は既存のcreatedAtを保持する必要があるため、undefinedのままにしておく
    // 実際には、既存データがある場合は上記の処理でDateオブジェクトに変換されているはず
    if (createdAtValue === undefined) {
      // 新規作成の場合のみ現在時刻を使用
      createdAtValue = new Date();
      console.log(`[bonus.service] createdAtがundefinedのため、現在時刻を使用`);
    }

    const bonusData = {
      ...cleanedData,
      year, // パラメータのyearを使用（保存先のパスと一致させる）
      createdAt: createdAtValue, // 正しく処理したcreatedAtを追加
    };
    console.log(`[bonus.service] 保存データ:`, bonusData);
    console.log(`[bonus.service] createdAtの最終値:`, { createdAtValue, type: typeof createdAtValue, isDate: createdAtValue instanceof Date });
    await setDoc(ref, bonusData, { merge: true });
  }

  /**
   * 賞与を読み込む（新しい構造）
   * @param year 年度
   * @param employeeId 従業員ID（オプショナル）
   * @returns 賞与データの配列
   * 
   * 注意: 賞与入力画面で免除期間中の賞与は0として保存されているため、
   * このメソッドは単純に保存されているデータを返すだけ。
   * 免除期間の判定は賞与入力画面で行われる。
   */
  async loadBonus(year: number, employeeId?: string): Promise<Bonus[]> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    if (employeeId) {
      const ref = collection(
        this.firestore,
        `bonus/${year}/employees/${employeeId}/items`
      );
      // payDateでフィルタリング（getBonusesForResultと同様のロジック）
      const q = query(
        ref,
        where('payDate', '>=', startDate),
        where('payDate', '<=', endDate)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Bonus)
      );
    } else {
      // 全従業員の賞与データを取得
      const employeesRef = collection(
        this.firestore,
        `bonus/${year}/employees`
      );
      const employeesSnapshot = await getDocs(employeesRef);
      const allBonuses: Bonus[] = [];
      for (const empDoc of employeesSnapshot.docs) {
        const itemsRef = collection(
          this.firestore,
          `bonus/${year}/employees/${empDoc.id}/items`
        );
        // payDateでフィルタリング（getBonusesForResultと同様のロジック）
        const q = query(
          itemsRef,
          where('payDate', '>=', startDate),
          where('payDate', '<=', endDate)
        );
        const itemsSnapshot = await getDocs(q);
        allBonuses.push(
          ...itemsSnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as Bonus)
          )
        );
      }
      return allBonuses;
    }
  }

  /**
   * 賞与を削除する
   * @param year 年度
   * @param employeeId 従業員ID
   * @param bonusId 賞与ID（ドキュメントID）
   */
  async deleteBonus(
    year: number,
    employeeId: string,
    bonusId: string
  ): Promise<void> {
    const ref = doc(
      this.firestore,
      `bonus/${year}/employees/${employeeId}/items/${bonusId}`
    );
    await deleteDoc(ref);
  }

  /**
   * 賞与を1件取得する
   * @param year 年度
   * @param employeeId 従業員ID
   * @param bonusId 賞与ID（ドキュメントID）
   * @returns 賞与データ
   */
  async getBonus(
    year: number,
    employeeId: string,
    bonusId: string
  ): Promise<Bonus | null> {
    const ref = doc(
      this.firestore,
      `bonus/${year}/employees/${employeeId}/items/${bonusId}`
    );
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() } as Bonus;
    }
    return null;
  }

  /**
   * 指定年度の賞与一覧を取得する
   * @param employeeId 従業員ID
   * @param year 年度
   * @returns 賞与データの配列
   */
  async getBonusesByYear(employeeId: string, year: number): Promise<Bonus[]> {
    const ref = collection(
      this.firestore,
      `bonus/${year}/employees/${employeeId}/items`
    );
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Bonus));
  }

  /**
   * 賞与を1件取得する（年度を自動検索）
   * @param employeeId 従業員ID
   * @param bonusId 賞与ID（ドキュメントID）
   * @param preferredYear 優先検索年度（オプショナル）
   * @returns 賞与データと年度のタプル
   */
  async getBonusWithYear(
    employeeId: string,
    bonusId: string,
    preferredYear?: number
  ): Promise<{ bonus: Bonus; year: number } | null> {
    // 優先年度が指定されている場合は、まずその年度を検索
    if (preferredYear !== undefined) {
      const bonus = await this.getBonus(preferredYear, employeeId, bonusId);
      if (bonus) {
        return { bonus, year: preferredYear };
      }
    }

    // 現在年度±2年の範囲で検索
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 2; year <= currentYear + 2; year++) {
      // 優先年度は既に検索済みなのでスキップ
      if (preferredYear !== undefined && year === preferredYear) {
        continue;
      }
      const bonus = await this.getBonus(year, employeeId, bonusId);
      if (bonus) {
        return { bonus, year };
      }
    }
    return null;
  }

  /**
   * 賞与を更新する
   * @param year 年度
   * @param employeeId 従業員ID
   * @param bonusId 賞与ID（ドキュメントID）
   * @param data 更新データ
   */
  async updateBonus(
    year: number,
    employeeId: string,
    bonusId: string,
    data: Partial<Bonus>
  ): Promise<void> {
    const ref = doc(
      this.firestore,
      `bonus/${year}/employees/${employeeId}/items/${bonusId}`
    );

    // undefinedの値を除外
    const cleanData: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }

    await updateDoc(ref, cleanData);
  }
}
