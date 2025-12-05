import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from '@angular/fire/firestore';
import { Settings } from '../models/settings.model';
import { Rate } from '../models/rate.model';
import { SalaryItem } from '../models/salary-item.model';
import { RoomIdService } from './room-id.service';
import { EditLogService } from './edit-log.service';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  constructor(
    private firestore: Firestore,
    private roomIdService: RoomIdService,
    private editLogService: EditLogService
  ) {}

  async loadSettings(): Promise<Settings> {
    const ref = doc(this.firestore, 'settings/general');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        payrollMonthRule: data['payrollMonthRule'] || 'payday',
      };
    }
    return { payrollMonthRule: 'payday' };
  }

  async saveSettings(settings: Settings): Promise<void> {
    const ref = doc(this.firestore, 'settings/general');
    await setDoc(ref, settings, { merge: true });
  }

  /**
   * 給与月の判定方法を取得する
   * @returns 'payDate' | 'closingDate'（デフォルト: 'payDate'）
   */
  async getSalaryMonthRule(): Promise<string> {
    const ref = doc(this.firestore, 'settings/global');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return data['salaryMonthRule'] || 'payDate';
    }
    // データがない場合はデフォルト値を返す
    return 'payDate';
  }

  /**
   * 給与月の判定方法を保存する
   * @param rule 'payDate' | 'closingDate'
   */
  async saveSalaryMonthRule(rule: string): Promise<void> {
    const ref = doc(this.firestore, 'settings/global');
    await setDoc(ref, { salaryMonthRule: rule }, { merge: true });
  }

  /**
   * 料率バージョン情報を取得する
   * @param year 年度（文字列）
   * @returns applyFromMonth（改定月）とversionId
   */
  async getRateVersionInfo(
    year: string
  ): Promise<{ applyFromMonth: number; versionId: string }> {
    const ref = doc(this.firestore, `rates/${year}`);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const applyFromMonth = data['applyFromMonth'] || 4;
      const versionId =
        data['versionId'] ||
        `v${year}-${applyFromMonth.toString().padStart(2, '0')}`;
      return { applyFromMonth, versionId };
    }
    // データがない場合はデフォルト値（4月）を返す
    return { applyFromMonth: 4, versionId: `v${year}-04` };
  }

  /**
   * 料率バージョン情報を保存する
   * @param year 年度（文字列）
   * @param applyFromMonth 改定月（1〜12）
   */
  async saveRateVersionInfo(
    year: string,
    applyFromMonth: number
  ): Promise<void> {
    const versionId = `v${year}-${applyFromMonth.toString().padStart(2, '0')}`;
    const ref = doc(this.firestore, `rates/${year}`);
    await setDoc(
      ref,
      {
        applyFromMonth,
        versionId,
        createdAt: new Date(),
      },
      { merge: true }
    );
  }

  async getRates(
    year: string,
    prefecture: string,
    payMonth?: string
  ): Promise<any | null> {
    const roomId = this.roomIdService.getCurrentRoomId();
    if (!roomId) {
      console.warn(
        '[SettingsService] roomIdが取得できないため、nullを返します'
      );
      return null;
    }

    // バージョン情報を取得
    const versionInfo = await this.getRateVersionInfo(year);
    const versionId = versionInfo.versionId;

    // 新しい構造から取得: rates/{year}/versions/{versionId}/prefectures/{prefecture}
    const ref = doc(
      this.firestore,
      `rates/${year}/versions/${versionId}/prefectures/${prefecture}`
    );
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      // roomIdの検証（セキュリティチェック）
      if (data['roomId'] !== roomId) {
        console.warn(
          '[SettingsService] roomIdが一致しないため、nullを返します',
          {
            requestedRoomId: roomId,
            documentRoomId: data['roomId'],
          }
        );
        return null;
      }
      return data;
    }

    // 既存の単一ドキュメント構造との互換性チェック（後方互換性のため）
    const legacyRef = doc(
      this.firestore,
      `rates/${year}/prefectures/${prefecture}`
    );
    const legacySnap = await getDoc(legacyRef);
    if (legacySnap.exists()) {
      const legacyData = legacySnap.data();
      // effectiveFromがない場合は年度初日として扱う
      if (!legacyData['effectiveFrom']) {
        return legacyData;
      }
    }

    // 新しいサブコレクション構造から取得（後方互換性のため）
    const versionsRef = collection(
      this.firestore,
      `rates/${year}/prefectures/${prefecture}/versions`
    );

    if (payMonth) {
      // 支給月に応じて適切なレコードを選択
      // effectiveFrom <= payMonth の中で最も新しいものを選択
      const q = query(
        versionsRef,
        where('effectiveFrom', '<=', payMonth),
        orderBy('effectiveFrom', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].data();
      }
    } else {
      // payMonthが指定されていない場合は最新のレコードを取得
      const q = query(versionsRef, orderBy('effectiveFrom', 'desc'), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].data();
      }
    }

    return null;
  }

  async saveRates(year: string, prefecture: string, data: Rate): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();

    // バージョン情報を取得
    const versionInfo = await this.getRateVersionInfo(year);
    const versionId = versionInfo.versionId;

    // 新しい構造に保存: rates/{year}/versions/{versionId}/prefectures/{prefecture}
    const ref = doc(
      this.firestore,
      `rates/${year}/versions/${versionId}/prefectures/${prefecture}`
    );
    const effectiveFrom =
      data.effectiveFrom ||
      `${year}-${versionInfo.applyFromMonth.toString().padStart(2, '0')}`;
    // roomIdを自動付与
    await setDoc(ref, { ...data, effectiveFrom, roomId }, { merge: true });

    // 後方互換性のため、既存の構造にも保存
    const legacyRef = doc(
      this.firestore,
      `rates/${year}/prefectures/${prefecture}/versions/${effectiveFrom}`
    );
    await setDoc(
      legacyRef,
      { ...data, effectiveFrom, roomId },
      { merge: true }
    );

    // 都道府県コードを日本語名に変換
    const prefectureName = this.getPrefectureName(prefecture);

    // 編集ログを記録
    await this.editLogService.logEdit(
      'update',
      'settings',
      `${year}_${prefecture}`,
      `${year}年度 ${prefectureName}の料率`,
      `${year}年度 ${prefectureName}の保険料率を更新しました`
    );
  }

  /**
   * 都道府県コードを日本語名に変換
   */
  private getPrefectureName(code: string): string {
    const prefectureMap: { [key: string]: string } = {
      hokkaido: '北海道',
      aomori: '青森県',
      iwate: '岩手県',
      miyagi: '宮城県',
      akita: '秋田県',
      yamagata: '山形県',
      fukushima: '福島県',
      ibaraki: '茨城県',
      tochigi: '栃木県',
      gunma: '群馬県',
      saitama: '埼玉県',
      chiba: '千葉県',
      tokyo: '東京都',
      kanagawa: '神奈川県',
      niigata: '新潟県',
      toyama: '富山県',
      ishikawa: '石川県',
      fukui: '福井県',
      yamanashi: '山梨県',
      nagano: '長野県',
      gifu: '岐阜県',
      shizuoka: '静岡県',
      aichi: '愛知県',
      mie: '三重県',
      shiga: '滋賀県',
      kyoto: '京都府',
      osaka: '大阪府',
      hyogo: '兵庫県',
      nara: '奈良県',
      wakayama: '和歌山県',
      tottori: '鳥取県',
      shimane: '島根県',
      okayama: '岡山県',
      hiroshima: '広島県',
      yamaguchi: '山口県',
      tokushima: '徳島県',
      kagawa: '香川県',
      ehime: '愛媛県',
      kochi: '高知県',
      fukuoka: '福岡県',
      saga: '佐賀県',
      nagasaki: '長崎県',
      kumamoto: '熊本県',
      oita: '大分県',
      miyazaki: '宮崎県',
      kagoshima: '鹿児島県',
      okinawa: '沖縄県',
    };
    return prefectureMap[code] || code;
  }

  async getStandardTable(year: number): Promise<any[]> {
    const roomId = this.roomIdService.getCurrentRoomId();
    if (!roomId) {
      console.warn(
        '[SettingsService] roomIdが取得できないため、空配列を返します'
      );
      return [];
    }

    const ref = collection(this.firestore, `grades/${year}/table`);
    const q = query(ref, where('roomId', '==', roomId));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => {
      const data = d.data();
      // Firestoreのフィールド名（grade, remuneration）を既存コードのフィールド名（rank, standard）にマッピング
      return {
        id: d.id,
        rank: data['grade'] || data['rank'],
        lower: data['lower'],
        upper: data['upper'],
        standard: data['remuneration'] || data['standard'],
        year,
      };
    });

    // 等級で重複を排除（同じ等級が複数ある場合は、最新のもの（idが大きいもの）を優先）
    const rankMap = new Map<number, any>();
    for (const row of rows) {
      const rank = row.rank;
      if (rank !== null && rank !== undefined) {
        const existing = rankMap.get(rank);
        if (!existing || (row.id && existing.id && row.id > existing.id)) {
          rankMap.set(rank, row);
        }
      }
    }

    // 等級順にソートして返す
    return Array.from(rankMap.values()).sort(
      (a, b) => (a.rank || 0) - (b.rank || 0)
    );
  }

  async saveStandardTable(year: number, rows: any[]): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const basePath = `grades/${year}/table`;

    // 既存のデータをすべて削除（重複を防ぐため、roomIdでフィルタ）
    const existingRef = collection(this.firestore, basePath);
    const existingQ = query(existingRef, where('roomId', '==', roomId));
    const existingSnap = await getDocs(existingQ);
    const deletePromises = existingSnap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);

    // 新しいデータを保存
    for (const row of rows) {
      // 既存コードのフィールド名（rank, standard）をFirestoreのフィールド名（grade, remuneration）にマッピング
      const gradeId = row.id || row.rank?.toString() || `grade_${row.rank}`;
      const ref = doc(this.firestore, `${basePath}/${gradeId}`);
      await setDoc(ref, {
        roomId, // roomIdを自動付与
        grade: row.rank,
        lower: row.lower,
        upper: row.upper,
        remuneration: row.standard,
        year,
      });
    }

    // 編集ログを記録
    await this.editLogService.logEdit(
      'update',
      'settings',
      `${year}_standardTable`,
      `${year}年度 標準報酬等級表`,
      `${year}年度の標準報酬等級表を更新しました（${rows.length}件）`
    );
  }

  /**
   * 標準報酬等級表の初期データ（協会けんぽ50等級）を取得
   * @returns 標準報酬等級表の配列
   */
  getDefaultStandardTable(): any[] {
    return [
      { rank: 1, lower: 58000, upper: 63000, standard: 58000 },
      { rank: 2, lower: 63000, upper: 68000, standard: 63000 },
      { rank: 3, lower: 68000, upper: 73000, standard: 68000 },
      { rank: 4, lower: 73000, upper: 79000, standard: 73000 },
      { rank: 5, lower: 79000, upper: 85000, standard: 79000 },
      { rank: 6, lower: 85000, upper: 91000, standard: 85000 },
      { rank: 7, lower: 91000, upper: 97000, standard: 91000 },
      { rank: 8, lower: 97000, upper: 103000, standard: 97000 },
      { rank: 9, lower: 103000, upper: 109000, standard: 103000 },
      { rank: 10, lower: 109000, upper: 115000, standard: 109000 },
      { rank: 11, lower: 115000, upper: 122000, standard: 115000 },
      { rank: 12, lower: 122000, upper: 129000, standard: 122000 },
      { rank: 13, lower: 129000, upper: 137000, standard: 129000 },
      { rank: 14, lower: 137000, upper: 145000, standard: 137000 },
      { rank: 15, lower: 145000, upper: 155000, standard: 145000 },
      { rank: 16, lower: 155000, upper: 165000, standard: 155000 },
      { rank: 17, lower: 165000, upper: 175000, standard: 165000 },
      { rank: 18, lower: 175000, upper: 185000, standard: 175000 },
      { rank: 19, lower: 185000, upper: 195000, standard: 185000 },
      { rank: 20, lower: 195000, upper: 210000, standard: 200000 },
      { rank: 21, lower: 210000, upper: 230000, standard: 220000 },
      { rank: 22, lower: 230000, upper: 250000, standard: 240000 },
      { rank: 23, lower: 250000, upper: 270000, standard: 260000 },
      { rank: 24, lower: 270000, upper: 290000, standard: 280000 },
      { rank: 25, lower: 290000, upper: 310000, standard: 300000 },
      { rank: 26, lower: 310000, upper: 330000, standard: 320000 },
      { rank: 27, lower: 330000, upper: 350000, standard: 340000 },
      { rank: 28, lower: 350000, upper: 370000, standard: 360000 },
      { rank: 29, lower: 370000, upper: 395000, standard: 380000 },
      { rank: 30, lower: 395000, upper: 425000, standard: 410000 },
      { rank: 31, lower: 425000, upper: 455000, standard: 440000 },
      { rank: 32, lower: 455000, upper: 485000, standard: 470000 },
      { rank: 33, lower: 485000, upper: 515000, standard: 500000 },
      { rank: 34, lower: 515000, upper: 545000, standard: 530000 },
      { rank: 35, lower: 545000, upper: 575000, standard: 560000 },
      { rank: 36, lower: 575000, upper: 605000, standard: 590000 },
      { rank: 37, lower: 605000, upper: 635000, standard: 620000 },
      { rank: 38, lower: 635000, upper: 665000, standard: 650000 },
      { rank: 39, lower: 665000, upper: 695000, standard: 680000 },
      { rank: 40, lower: 695000, upper: 730000, standard: 710000 },
      { rank: 41, lower: 730000, upper: 770000, standard: 750000 },
      { rank: 42, lower: 770000, upper: 810000, standard: 790000 },
      { rank: 43, lower: 810000, upper: 855000, standard: 830000 },
      { rank: 44, lower: 855000, upper: 905000, standard: 880000 },
      { rank: 45, lower: 905000, upper: 955000, standard: 930000 },
      { rank: 46, lower: 955000, upper: 1005000, standard: 980000 },
      { rank: 47, lower: 1005000, upper: 1055000, standard: 1030000 },
      { rank: 48, lower: 1055000, upper: 1115000, standard: 1085000 },
      { rank: 49, lower: 1115000, upper: 1175000, standard: 1145000 },
      { rank: 50, lower: 1175000, upper: 9999999, standard: 1300000 },
    ];
  }

  /**
   * 標準報酬等級表の初期データを一括登録
   * @param year 年度
   */
  async seedStandardTable(year: number): Promise<void> {
    const defaultTable = this.getDefaultStandardTable();
    await this.saveStandardTable(year, defaultTable);
  }

  async loadSalaryItems(year: number): Promise<SalaryItem[]> {
    const roomId = this.roomIdService.getCurrentRoomId();
    if (!roomId) {
      console.warn(
        '[SettingsService] roomIdが取得できないため、空配列を返します'
      );
      return [];
    }

    const ref = collection(this.firestore, `settings/${year}/salaryItems`);
    const q = query(ref, where('roomId', '==', roomId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SalaryItem));
  }

  async saveSalaryItems(year: number, items: SalaryItem[]): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const basePath = `settings/${year}/salaryItems`;

    // 現在保存する項目のIDリスト
    const currentItemIds = new Set(items.map((item) => item.id));

    // 既存のすべての項目を取得
    const existingItems = await this.loadSalaryItems(year);

    // 削除された項目（現在のリストにない項目）を削除
    for (const existingItem of existingItems) {
      if (!currentItemIds.has(existingItem.id)) {
        await this.deleteSalaryItem(year, existingItem.id);
      }
    }

    // 現在の項目を保存
    for (const item of items) {
      const ref = doc(this.firestore, `${basePath}/${item.id}`);
      // roomIdを自動付与
      const itemWithRoomId = { ...item, roomId };
      await setDoc(ref, itemWithRoomId, { merge: true });
    }

    // 編集ログを記録
    await this.editLogService.logEdit(
      'update',
      'settings',
      `${year}_salaryItems`,
      `${year}年度 給与項目マスタ`,
      `${year}年度の給与項目マスタを更新しました（${items.length}件）`
    );
  }

  async deleteSalaryItem(year: number, itemId: string): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();

    const ref = doc(this.firestore, `settings/${year}/salaryItems/${itemId}`);

    // 既存データのroomIdを確認（セキュリティチェック）
    const existingDoc = await getDoc(ref);
    if (existingDoc.exists()) {
      const existingData = existingDoc.data();
      if (existingData['roomId'] !== roomId) {
        throw new Error('この給与項目データを削除する権限がありません');
      }

      // 編集ログを記録（削除前に記録）
      await this.editLogService.logEdit(
        'delete',
        'settings',
        itemId,
        existingData['name'] || '不明',
        `${year}年度の給与項目「${
          existingData['name'] || '不明'
        }」を削除しました`
      );
    }

    await deleteDoc(ref);
  }

  async seedRatesTokyo2025(): Promise<void> {
    const data = {
      // 協会けんぽ・東京都 一般保険料率（2025年度）
      // ※ 現行公式値に基づく
      health_employee: 0.04905, // 健康保険（本人）
      health_employer: 0.04905, // 健康保険（事業主）

      care_employee: 0.0087, // 介護保険（本人）※40〜64歳のみ適用
      care_employer: 0.0087, // 介護保険（事業主）

      pension_employee: 0.0915, // 厚生年金（本人）全国共通
      pension_employer: 0.0915, // 厚生年金（事業主）
    };

    const ref = doc(this.firestore, 'rates/2025/prefectures/tokyo');
    await setDoc(ref, data, { merge: true });
  }

  async seedRatesAllPrefectures2025(): Promise<void> {
    for (const key of Object.keys(RATES_2024)) {
      await setDoc(
        doc(this.firestore, `rates/2025/prefectures/${key}`),
        RATES_2024[key]
      );
    }
  }
}

const RATES_2024: Record<string, any> = {
  hokkaido: {
    health_employee: 0.0508,
    health_employer: 0.0508,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  aomori: {
    health_employee: 0.05,
    health_employer: 0.05,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  iwate: {
    health_employee: 0.05,
    health_employer: 0.05,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  miyagi: {
    health_employee: 0.05,
    health_employer: 0.05,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  akita: {
    health_employee: 0.05,
    health_employer: 0.05,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  yamagata: {
    health_employee: 0.05,
    health_employer: 0.05,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  fukushima: {
    health_employee: 0.0492,
    health_employer: 0.0492,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },

  ibaraki: {
    health_employee: 0.0493,
    health_employer: 0.0493,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  tochigi: {
    health_employee: 0.0488,
    health_employer: 0.0488,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  gunma: {
    health_employee: 0.0485,
    health_employer: 0.0485,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  saitama: {
    health_employee: 0.0484,
    health_employer: 0.0484,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  chiba: {
    health_employee: 0.0487,
    health_employer: 0.0487,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  tokyo: {
    health_employee: 0.04905,
    health_employer: 0.04905,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  kanagawa: {
    health_employee: 0.0481,
    health_employer: 0.0481,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },

  niigata: {
    health_employee: 0.0502,
    health_employer: 0.0502,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  toyama: {
    health_employee: 0.0509,
    health_employer: 0.0509,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  ishikawa: {
    health_employee: 0.0503,
    health_employer: 0.0503,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  fukui: {
    health_employee: 0.0497,
    health_employer: 0.0497,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },

  yamanashi: {
    health_employee: 0.0497,
    health_employer: 0.0497,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  nagano: {
    health_employee: 0.049,
    health_employer: 0.049,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },

  gifu: {
    health_employee: 0.0496,
    health_employer: 0.0496,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  shizuoka: {
    health_employee: 0.0489,
    health_employer: 0.0489,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  aichi: {
    health_employee: 0.049,
    health_employer: 0.049,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  mie: {
    health_employee: 0.04915,
    health_employer: 0.04915,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },

  shiga: {
    health_employee: 0.0489,
    health_employer: 0.0489,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  kyoto: {
    health_employee: 0.0492,
    health_employer: 0.0492,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  osaka: {
    health_employee: 0.0489,
    health_employer: 0.0489,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  hyogo: {
    health_employee: 0.0493,
    health_employer: 0.0493,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  nara: {
    health_employee: 0.0488,
    health_employer: 0.0488,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  wakayama: {
    health_employee: 0.0492,
    health_employer: 0.0492,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },

  tottori: {
    health_employee: 0.0508,
    health_employer: 0.0508,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  shimane: {
    health_employee: 0.0508,
    health_employer: 0.0508,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  okayama: {
    health_employee: 0.0497,
    health_employer: 0.0497,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  hiroshima: {
    health_employee: 0.0494,
    health_employer: 0.0494,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  yamaguchi: {
    health_employee: 0.0502,
    health_employer: 0.0502,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },

  tokushima: {
    health_employee: 0.0504,
    health_employer: 0.0504,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  kagawa: {
    health_employee: 0.0503,
    health_employer: 0.0503,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  ehime: {
    health_employee: 0.0503,
    health_employer: 0.0503,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  kochi: {
    health_employee: 0.0502,
    health_employer: 0.0502,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },

  fukuoka: {
    health_employee: 0.0496,
    health_employer: 0.0496,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  saga: {
    health_employee: 0.0497,
    health_employer: 0.0497,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  nagasaki: {
    health_employee: 0.0501,
    health_employer: 0.0501,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  kumamoto: {
    health_employee: 0.05,
    health_employer: 0.05,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  oita: {
    health_employee: 0.0501,
    health_employer: 0.0501,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  miyazaki: {
    health_employee: 0.0502,
    health_employer: 0.0502,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  kagoshima: {
    health_employee: 0.0501,
    health_employer: 0.0501,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
  okinawa: {
    health_employee: 0.049,
    health_employer: 0.049,
    care_employee: 0.009,
    care_employer: 0.009,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  },
};
