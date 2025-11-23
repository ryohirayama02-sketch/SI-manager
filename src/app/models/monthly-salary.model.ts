export interface MonthlySalary {
  id: string;            // Firestore側のドキュメントID
  employeeId: string;
  year: number;
  month: number;
  amount: number;        // 月収（総支給）
}

