export interface EmployeeChangeHistory {
  id?: string; // FirestoreのドキュメントID
  employeeId: string; // 従業員ID
  changeType: '氏名変更' | '住所変更' | '生年月日訂正' | '性別変更' | '所属事業所変更' | '適用区分変更';
  changeDate: string; // 変更があった日（YYYY-MM-DD）
  oldValue: string; // 変更前の値
  newValue: string; // 変更後の値
  notificationNames: string[]; // 届出名前のリスト
  createdAt: Date; // 履歴作成日時
}





