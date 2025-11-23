export interface Employee {
  id: string; // FirestoreのドキュメントID
  name: string; // 氏名
  birthDate: string; // 生年月日（YYYY-MM-DD）
  joinDate: string; // 入社日
  isShortTime: boolean; // 短時間労働者か
  standardMonthlyRemuneration?: number; // 標準報酬月額（算定後）
  returnFromLeaveDate?: string; // 復職日（YYYY-MM-DD）
  retireDate?: string; // 退職日（YYYY-MM-DD）
  maternityLeaveStart?: string; // 産休開始日（YYYY-MM-DD）
  maternityLeaveEnd?: string; // 産休終了日（YYYY-MM-DD）
  childcareLeaveStart?: string; // 育休開始日（YYYY-MM-DD）
  childcareLeaveEnd?: string; // 育休終了日（YYYY-MM-DD）
  childcareNotificationSubmitted?: boolean; // 育児休業取得届の提出済フラグ
  childcareLivingTogether?: boolean; // 子と同居しているか（養育しているか）
}
