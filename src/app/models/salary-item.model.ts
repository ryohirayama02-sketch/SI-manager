export interface SalaryItem {
  id: string;
  roomId: string; // ルームID（マルチテナント対応）
  name: string;
  type: 'fixed' | 'variable' | 'deduction';
}
