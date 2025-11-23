export interface SettlementBasis {
  employeeId: string;
  y4: number | null;     // 4月報酬
  y5: number | null;     // 5月報酬
  y6: number | null;     // 6月報酬
  average: number | null;     // 平均報酬
  decidedGrade?: number | null;  // 標準報酬月額の等級
}

