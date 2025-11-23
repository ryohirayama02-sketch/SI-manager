export interface Employee {
  id: string;                 // FirestoreのドキュメントID
  name: string;               // 氏名
  birthDate: string;          // 生年月日（YYYY-MM-DD）
  joinDate: string;           // 入社日
  isShortTime: boolean;       // 短時間労働者か
  standardMonthlyRemuneration?: number;  // 標準報酬月額（算定後）
  returnFromLeaveDate?: string;  // 復職日（YYYY-MM-DD）
}

