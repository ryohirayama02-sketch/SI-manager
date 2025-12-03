export interface FamilyMember {
  id?: string; // FirestoreのドキュメントID
  employeeId: string; // 従業員ID
  name: string; // 氏名
  birthDate: string; // 生年月日（YYYY-MM-DD）
  relationship: string; // 続柄（配偶者、子、父母など）
  livingTogether: boolean; // 同居区分（true: 同居、false: 別居）
  expectedIncome?: number; // 収入見込（円）
  isThirdCategory: boolean; // 第3号被保険者区分（true: 第3号、false: 第2号）
  supportStartDate?: string; // 扶養開始日（YYYY-MM-DD）
  supportEndDate?: string; // 扶養終了日（YYYY-MM-DD）
  changeDate?: string; // 異動日（YYYY-MM-DD）
  createdAt?: Date; // 作成日時
  updatedAt?: Date; // 更新日時
}

export interface FamilyMemberHistory {
  id?: string;
  familyMemberId: string;
  employeeId: string;
  changeDate: string; // 異動日（YYYY-MM-DD）
  changeType: 'start' | 'end' | 'update'; // 変更種別（開始/終了/更新）
  previousValue?: any; // 変更前の値
  newValue?: any; // 変更後の値
  createdAt: Date; // 作成日時
}







