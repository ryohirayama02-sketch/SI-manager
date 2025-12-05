export interface Bonus {
  id?: string;
  roomId: string; // ルームID（マルチテナント対応）
  employeeId: string;
  year: number;
  month: number;
  amount: number;
  payDate: string; // YYYY-MM-DD
  createdAt: any;
  isExempt: boolean;
  cappedHealth: number;
  cappedPension: number;
  // 既存フィールド（後方互換性のため残す）
  healthEmployee?: number;
  healthEmployer?: number;
  careEmployee?: number;
  careEmployer?: number;
  pensionEmployee?: number;
  pensionEmployer?: number;
  standardBonusAmount?: number; // 1,000円未満切り捨て後
  requireReport?: boolean; // 賞与支払届が必要か
  reportDeadline?: string; // 提出期限
  cappedBonusHealth?: number; // 健保・介保上限適用後の額
  cappedBonusPension?: number; // 厚年上限適用後の額
  isExempted?: boolean; // 産休・育休免除
  isRetiredNoLastDay?: boolean; // 月末不在
  isOverAge70?: boolean; // 70歳到達
  isOverAge75?: boolean; // 75歳到達
  isSalaryInsteadOfBonus?: boolean; // 給与扱いフラグ
  exemptReason?: string; // 免除理由
  notes?: string; // 備考
}
