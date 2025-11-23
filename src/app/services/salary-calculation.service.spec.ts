import { TestBed } from '@angular/core/testing';
import { SalaryCalculationService, SalaryData, TeijiKetteiResult } from './salary-calculation.service';
import { Employee } from '../models/employee.model';

describe('SalaryCalculationService', () => {
  let service: SalaryCalculationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SalaryCalculationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('calculateTeijiKettei', () => {
    it('4〜6月平均が正常に出る', () => {
      const employeeId = 'emp1';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_4`]: { total: 100000, fixed: 80000, variable: 20000 },
        [`${employeeId}_5`]: { total: 110000, fixed: 90000, variable: 20000 },
        [`${employeeId}_6`]: { total: 120000, fixed: 100000, variable: 20000 }
      };
      const gradeTable = [
        { rank: 10, lower: 109000, upper: 115000, standard: 109000 }
      ];

      const result = service.calculateTeijiKettei(employeeId, salaries, gradeTable);

      expect(result.average46).toBe(110000);
      expect(result.grade).toBe(10);
      expect(result.standardMonthlyRemuneration).toBe(109000);
    });

    it('除外月（20%以上減少）が正しく除外される', () => {
      const employeeId = 'emp1';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_3`]: { total: 100000, fixed: 80000, variable: 20000 },
        [`${employeeId}_4`]: { total: 70000, fixed: 50000, variable: 20000 }, // 前月比30%減少
        [`${employeeId}_5`]: { total: 110000, fixed: 90000, variable: 20000 },
        [`${employeeId}_6`]: { total: 120000, fixed: 100000, variable: 20000 }
      };
      const gradeTable = [
        { rank: 10, lower: 109000, upper: 115000, standard: 109000 }
      ];

      const result = service.calculateTeijiKettei(employeeId, salaries, gradeTable);

      expect(result.excludedMonths).toContain(4);
      expect(result.average46).toBe(115000); // 5月と6月の平均
    });
  });

  describe('findGrade', () => {
    it('平均値から正しい等級が選択される', () => {
      const gradeTable = [
        { rank: 1, lower: 58000, upper: 63000, standard: 58000 },
        { rank: 2, lower: 63000, upper: 68000, standard: 63000 },
        { rank: 3, lower: 68000, upper: 73000, standard: 68000 }
      ];

      const result1 = service.findGrade(gradeTable, 60000);
      expect(result1?.grade).toBe(1);
      expect(result1?.remuneration).toBe(58000);

      const result2 = service.findGrade(gradeTable, 65000);
      expect(result2?.grade).toBe(2);
      expect(result2?.remuneration).toBe(63000);

      const result3 = service.findGrade(gradeTable, 70000);
      expect(result3?.grade).toBe(3);
      expect(result3?.remuneration).toBe(68000);
    });

    it('範囲外の場合はnullを返す', () => {
      const gradeTable = [
        { rank: 1, lower: 58000, upper: 63000, standard: 58000 }
      ];

      const result = service.findGrade(gradeTable, 50000);
      expect(result).toBeNull();
    });
  });

  describe('calculateSuijiKettei', () => {
    it('2等級以上の変動で候補が生成される', () => {
      const employeeId = 'emp1';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_7`]: { total: 100000, fixed: 80000, variable: 20000 },
        [`${employeeId}_8`]: { total: 150000, fixed: 130000, variable: 20000 },
        [`${employeeId}_9`]: { total: 160000, fixed: 140000, variable: 20000 }
      };
      const gradeTable = [
        { rank: 10, lower: 109000, upper: 115000, standard: 109000 },
        { rank: 15, lower: 140000, upper: 150000, standard: 140000 }
      ];
      const employees: Employee[] = [
        { id: employeeId, name: 'テスト従業員', birthDate: '1990-01-01', joinDate: '2020-01-01', isShortTime: false }
      ];
      const currentResults: { [employeeId: string]: TeijiKetteiResult } = {
        [employeeId]: {
          average46: 110000,
          excludedMonths: [],
          grade: 10,
          standardMonthlyRemuneration: 109000
        }
      };

      const result = service.calculateSuijiKettei(
        employeeId,
        7,
        salaries,
        gradeTable,
        employees,
        '2025',
        currentResults
      );

      expect(result.candidate).not.toBeNull();
      expect(result.candidate?.gradeDiff).toBeGreaterThanOrEqual(2);
      expect(result.candidate?.currentGrade).toBe(10);
      expect(result.candidate?.newGrade).toBe(15);
    });

    it('1等級以下の変動では候補が生成されない', () => {
      const employeeId = 'emp1';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_7`]: { total: 100000, fixed: 80000, variable: 20000 },
        [`${employeeId}_8`]: { total: 110000, fixed: 90000, variable: 20000 },
        [`${employeeId}_9`]: { total: 115000, fixed: 95000, variable: 20000 }
      };
      const gradeTable = [
        { rank: 10, lower: 109000, upper: 115000, standard: 109000 },
        { rank: 11, lower: 115000, upper: 122000, standard: 115000 }
      ];
      const employees: Employee[] = [
        { id: employeeId, name: 'テスト従業員', birthDate: '1990-01-01', joinDate: '2020-01-01', isShortTime: false }
      ];
      const currentResults: { [employeeId: string]: TeijiKetteiResult } = {
        [employeeId]: {
          average46: 110000,
          excludedMonths: [],
          grade: 10,
          standardMonthlyRemuneration: 109000
        }
      };

      const result = service.calculateSuijiKettei(
        employeeId,
        7,
        salaries,
        gradeTable,
        employees,
        '2025',
        currentResults
      );

      expect(result.candidate).toBeNull();
    });
  });

  describe('getRehabHighlightMonths', () => {
    it('復職月・翌月・翌々月の配列が出る', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
        returnFromLeaveDate: '2025-05-15'
      };

      const result = service.getRehabHighlightMonths(employee, '2025');

      expect(result).toEqual([5, 6, 7]);
    });

    it('復職年が異なる場合は空配列を返す', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
        returnFromLeaveDate: '2024-05-15'
      };

      const result = service.getRehabHighlightMonths(employee, '2025');

      expect(result).toEqual([]);
    });

    it('復職日がない場合は空配列を返す', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false
      };

      const result = service.getRehabHighlightMonths(employee, '2025');

      expect(result).toEqual([]);
    });
  });

  describe('calculateMonthlyPremiums', () => {
    it('40〜64歳の介護保険計算が正しい', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1980-01-01', // 45歳
        joinDate: '2020-01-01',
        isShortTime: false
      };
      const rates = {
        health_employee: 0.05,
        health_employer: 0.05,
        care_employee: 0.01,
        care_employer: 0.01,
        pension_employee: 0.0915,
        pension_employer: 0.0915
      };

      const result = service.calculateMonthlyPremiums(employee, 200000, rates);

      expect(result).not.toBeNull();
      expect(result?.careEmployee).toBeGreaterThan(0);
      expect(result?.careEmployer).toBeGreaterThan(0);
    });

    it('39歳以下の場合は介護保険が0', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01', // 35歳
        joinDate: '2020-01-01',
        isShortTime: false
      };
      const rates = {
        health_employee: 0.05,
        health_employer: 0.05,
        care_employee: 0.01,
        care_employer: 0.01,
        pension_employee: 0.0915,
        pension_employer: 0.0915
      };

      const result = service.calculateMonthlyPremiums(employee, 200000, rates);

      expect(result).not.toBeNull();
      expect(result?.careEmployee).toBe(0);
      expect(result?.careEmployer).toBe(0);
    });

    it('65歳以上の場合は介護保険が0', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1955-01-01', // 70歳
        joinDate: '2020-01-01',
        isShortTime: false
      };
      const rates = {
        health_employee: 0.05,
        health_employer: 0.05,
        care_employee: 0.01,
        care_employer: 0.01,
        pension_employee: 0.0915,
        pension_employer: 0.0915
      };

      const result = service.calculateMonthlyPremiums(employee, 200000, rates);

      expect(result).not.toBeNull();
      expect(result?.careEmployee).toBe(0);
      expect(result?.careEmployer).toBe(0);
    });
  });
});

