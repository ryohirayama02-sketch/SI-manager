export interface Rate {
  effectiveFrom: string; // 適用開始月（例：'2025-04'）
  health_employee: number;
  health_employer: number;
  care_employee: number;
  care_employer: number;
  pension_employee: number;
  pension_employer: number;
}

