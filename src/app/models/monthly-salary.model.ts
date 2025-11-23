export interface MonthlySalary {
  id: string;            // Firestore側のドキュメントID
  employeeId: string;
  year: number;
  month: number;
  total: number;         // 総支給
  fixed: number;         // 固定的賃金
  variable: number;      // 非固定的賃金
}

