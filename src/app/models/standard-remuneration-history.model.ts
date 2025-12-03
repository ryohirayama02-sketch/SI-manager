export interface StandardRemunerationHistory {
  id?: string; // FirestoreのドキュメントID
  employeeId: string; // 従業員ID
  applyStartYear: number; // 適用開始年
  applyStartMonth: number; // 適用開始月（1-12）
  grade: number; // 標準報酬等級
  standardMonthlyRemuneration: number; // 標準報酬月額
  determinationReason: 'acquisition' | 'teiji' | 'suiji'; // 決定理由（資格取得/定時決定/随時改定）
  memo?: string; // メモ
  createdAt?: Date; // 作成日時
  updatedAt?: Date; // 更新日時
}

export interface InsuranceStatusHistory {
  id?: string; // FirestoreのドキュメントID
  employeeId: string; // 従業員ID
  year: number; // 年
  month: number; // 月（1-12）
  healthInsuranceStatus: 'joined' | 'lost' | 'exempt_maternity' | 'exempt_childcare'; // 健康保険状態（加入/喪失/免除-産休/免除-育休）
  careInsuranceStatus: 'joined' | 'lost' | 'exempt_maternity' | 'exempt_childcare' | 'type1'; // 介護保険状態（加入/喪失/免除-産休/免除-育休/第1号）
  pensionInsuranceStatus: 'joined' | 'lost' | 'exempt_maternity' | 'exempt_childcare'; // 厚生年金状態（加入/喪失/免除-産休/免除-育休）
  ageMilestone?: 40 | 65 | 70 | 75; // 年齢到達（該当する場合）
  createdAt?: Date; // 作成日時
  updatedAt?: Date; // 更新日時
}






