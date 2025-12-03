/**
 * 徴収不能額（会社立替額）のモデル
 */
export interface UncollectedPremium {
  id?: string; // FirestoreのドキュメントID
  employeeId: string;
  year: number;
  month: number;
  amount: number; // 徴収不能額
  createdAt: any; // Firestore Timestamp
  reason: string; // 理由
  resolved: boolean; // 対応済みフラグ
}

