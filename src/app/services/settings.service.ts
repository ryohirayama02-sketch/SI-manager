import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, collection, getDocs } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  constructor(private firestore: Firestore) {}

  async getRates(year: string, prefecture: string): Promise<any | null> {
    const ref = doc(this.firestore, `rates/${year}/prefectures/${prefecture}`);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  async saveRates(year: string, prefecture: string, data: any): Promise<void> {
    const ref = doc(this.firestore, `rates/${year}/prefectures/${prefecture}`);
    await setDoc(ref, data, { merge: true });
  }

  async getStandardTable(year: string): Promise<any[]> {
    const ref = collection(this.firestore, `standardTable/${year}/rows`);
    const snap = await getDocs(ref);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async saveStandardTable(year: string, rows: any[]): Promise<void> {
    const basePath = `standardTable/${year}/rows`;
    for (const row of rows) {
      const ref = doc(this.firestore, `${basePath}/${row.id}`);
      await setDoc(ref, row, { merge: true });
    }
  }

  async seedRatesTokyo2025(): Promise<void> {
    const data = {
      // 協会けんぽ・東京都 一般保険料率（2025年度）
      // ※ 現行公式値に基づく
      health_employee: 0.04905,    // 健康保険（本人）
      health_employer: 0.04905,    // 健康保険（事業主）

      care_employee: 0.0087,       // 介護保険（本人）※40〜64歳のみ適用
      care_employer: 0.0087,       // 介護保険（事業主）

      pension_employee: 0.0915,    // 厚生年金（本人）全国共通
      pension_employer: 0.0915     // 厚生年金（事業主）
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
  hokkaido:{health_employee:0.0508,health_employer:0.0508,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  aomori:{health_employee:0.0500,health_employer:0.0500,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  iwate:{health_employee:0.0500,health_employer:0.0500,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  miyagi:{health_employee:0.0500,health_employer:0.0500,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  akita:{health_employee:0.0500,health_employer:0.0500,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  yamagata:{health_employee:0.0500,health_employer:0.0500,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  fukushima:{health_employee:0.0492,health_employer:0.0492,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},

  ibaraki:{health_employee:0.0493,health_employer:0.0493,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  tochigi:{health_employee:0.0488,health_employer:0.0488,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  gunma:{health_employee:0.0485,health_employer:0.0485,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  saitama:{health_employee:0.0484,health_employer:0.0484,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  chiba:{health_employee:0.0487,health_employer:0.0487,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  tokyo:{health_employee:0.04905,health_employer:0.04905,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  kanagawa:{health_employee:0.0481,health_employer:0.0481,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},

  niigata:{health_employee:0.0502,health_employer:0.0502,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  toyama:{health_employee:0.0509,health_employer:0.0509,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  ishikawa:{health_employee:0.0503,health_employer:0.0503,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  fukui:{health_employee:0.0497,health_employer:0.0497,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},

  yamanashi:{health_employee:0.0497,health_employer:0.0497,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  nagano:{health_employee:0.0490,health_employer:0.0490,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},

  gifu:{health_employee:0.0496,health_employer:0.0496,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  shizuoka:{health_employee:0.0489,health_employer:0.0489,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  aichi:{health_employee:0.0490,health_employer:0.0490,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  mie:{health_employee:0.04915,health_employer:0.04915,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},

  shiga:{health_employee:0.0489,health_employer:0.0489,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  kyoto:{health_employee:0.0492,health_employer:0.0492,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  osaka:{health_employee:0.0489,health_employer:0.0489,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  hyogo:{health_employee:0.0493,health_employer:0.0493,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  nara:{health_employee:0.0488,health_employer:0.0488,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  wakayama:{health_employee:0.0492,health_employer:0.0492,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},

  tottori:{health_employee:0.0508,health_employer:0.0508,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  shimane:{health_employee:0.0508,health_employer:0.0508,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  okayama:{health_employee:0.0497,health_employer:0.0497,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  hiroshima:{health_employee:0.0494,health_employer:0.0494,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  yamaguchi:{health_employee:0.0502,health_employer:0.0502,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},

  tokushima:{health_employee:0.0504,health_employer:0.0504,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  kagawa:{health_employee:0.0503,health_employer:0.0503,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  ehime:{health_employee:0.0503,health_employer:0.0503,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  kochi:{health_employee:0.0502,health_employer:0.0502,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},

  fukuoka:{health_employee:0.0496,health_employer:0.0496,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  saga:{health_employee:0.0497,health_employer:0.0497,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  nagasaki:{health_employee:0.0501,health_employer:0.0501,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  kumamoto:{health_employee:0.0500,health_employer:0.0500,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  oita:{health_employee:0.0501,health_employer:0.0501,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  miyazaki:{health_employee:0.0502,health_employer:0.0502,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  kagoshima:{health_employee:0.0501,health_employer:0.0501,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915},
  okinawa:{health_employee:0.0490,health_employer:0.0490,care_employee:0.009,care_employer:0.009,pension_employee:0.0915,pension_employer:0.0915}
};

