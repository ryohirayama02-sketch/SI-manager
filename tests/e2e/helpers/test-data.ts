import { Employee } from '../../../src/app/models/employee.model';
import { Bonus } from '../../../src/app/models/bonus.model';

export const mockEmployees: Employee[] = [
  {
    id: 'emp1',
    name: 'テスト従業員1',
    birthDate: '1990-01-01',
    joinDate: '2020-01-01',
    isShortTime: false,
  },
  {
    id: 'emp2',
    name: 'テスト従業員2',
    birthDate: '1985-05-15',
    joinDate: '2021-03-01',
    isShortTime: true,
    maternityLeaveStart: '2025-06-01',
    maternityLeaveEnd: '2025-08-31',
    childcareLeaveStart: '2025-09-01',
    childcareLeaveEnd: '2026-03-31',
    childcareNotificationSubmitted: true,
    childcareLivingTogether: true,
  },
];

export const mockBonuses: Bonus[] = [
  {
    id: 'bonus1',
    employeeId: 'emp1',
    payDate: '2025-06-15',
    amount: 1000000,
    healthEmployee: 50000,
    healthEmployer: 50000,
    careEmployee: 10000,
    careEmployer: 10000,
    pensionEmployee: 91500,
    pensionEmployer: 91500,
    isExempted: false,
    isSalaryInsteadOfBonus: false,
  },
];

export const mockRates = {
  health_employee: 0.05,
  health_employer: 0.05,
  care_employee: 0.01,
  care_employer: 0.01,
  pension_employee: 0.0915,
  pension_employer: 0.0915,
};

export const mockGradeTable = [
  { id: '1', rank: 1, lower: 58000, upper: 63000, standard: 58000 },
  { id: '2', rank: 2, lower: 63000, upper: 68000, standard: 63000 },
  { id: '3', rank: 3, lower: 68000, upper: 73000, standard: 68000 },
  { id: '10', rank: 10, lower: 109000, upper: 115000, standard: 109000 },
];

