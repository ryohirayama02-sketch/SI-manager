export interface MonthlySalary {
  id: string;            // Firestore側のドキュメントID
  employeeId: string;
  year: number;
  month: number;
  total: number;         // 総支給（後方互換性のため残す）
  fixed: number;         // 固定的賃金（後方互換性のため残す）
  variable: number;      // 非固定的賃金（後方互換性のため残す）
  // 明確化のための属性
  fixedSalary: number;      // 固定的賃金
  variableSalary: number;   // 非固定的賃金（残業・歩合など）
  totalSalary: number;      // fixed + variable（自動算出）
}

