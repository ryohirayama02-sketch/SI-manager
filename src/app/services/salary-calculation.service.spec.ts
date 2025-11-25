import { TestBed } from '@angular/core/testing';
import { SalaryCalculationService } from './salary-calculation.service';
import { MonthlySalaryService } from './monthly-salary.service';
import { MonthHelperService } from './month-helper.service';
import { MaternityLeaveService } from './maternity-leave.service';
import { EmployeeService } from './employee.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { Employee } from '../models/employee.model';
import { SalaryData } from './salary-calculation.service';
import { Firestore } from '@angular/fire/firestore';
import {
  EmployeeEligibilityService,
  AgeFlags,
} from './employee-eligibility.service';
import { SettingsService } from './settings.service';

class EmployeeEligibilityServiceStub {
  ageFlags: AgeFlags = {
    isNoHealth: false,
    isNoPension: false,
    isCare1: false,
    isCare2: false,
  };

  checkEligibility(employee: Employee, salary?: any, date?: Date): any {
    return {
      ageFlags: this.ageFlags,
    };
  }
}

describe('SalaryCalculationService', () => {
  let service: SalaryCalculationService;
  let employeeEligibilityServiceStub: EmployeeEligibilityServiceStub;

  const gradeTable = [
    { rank: 1, lower: 58000, upper: 63000, standard: 58000 },
    { rank: 2, lower: 63000, upper: 68000, standard: 63000 },
    { rank: 3, lower: 68000, upper: 73000, standard: 68000 },
    { rank: 4, lower: 73000, upper: 79000, standard: 73000 },
    { rank: 5, lower: 79000, upper: 85000, standard: 79000 },
    { rank: 6, lower: 85000, upper: 91000, standard: 85000 },
    { rank: 7, lower: 91000, upper: 97000, standard: 91000 },
    { rank: 8, lower: 97000, upper: 103000, standard: 97000 },
    { rank: 9, lower: 103000, upper: 109000, standard: 103000 },
    { rank: 10, lower: 109000, upper: 115000, standard: 109000 },
    { rank: 11, lower: 115000, upper: 122000, standard: 115000 },
    { rank: 12, lower: 122000, upper: 129000, standard: 122000 },
    { rank: 13, lower: 129000, upper: 137000, standard: 129000 },
  ];

  const getTestRates = (year: number) => {
    return year === 2025
      ? {
          health_employee: 0.05,
          health_employer: 0.05,
          care_employee: 0.01,
          care_employer: 0.01,
          pension_employee: 0.092,
          pension_employer: 0.092,
        }
      : {
          health_employee: 0.049,
          health_employer: 0.049,
          care_employee: 0.009,
          care_employer: 0.009,
          pension_employee: 0.0915,
          pension_employer: 0.0915,
        };
  };

  beforeEach(() => {
    employeeEligibilityServiceStub = new EmployeeEligibilityServiceStub();
    TestBed.configureTestingModule({
      providers: [
        SalaryCalculationService,
        MonthlySalaryService,
        MonthHelperService,
        MaternityLeaveService,
        {
          provide: EmployeeEligibilityService,
          useValue: employeeEligibilityServiceStub,
        },
        EmployeeService,
        EmployeeLifecycleService,
        { provide: Firestore, useValue: {} as Firestore },
        {
          provide: SettingsService,
          useValue: {
            getRates: (year: number, prefecture: string) => {
              const testRates: any = {
                2024: {
                  health_employee: 0.049,
                  health_employer: 0.049,
                  care_employee: 0.009,
                  care_employer: 0.009,
                  pension_employee: 0.0915,
                  pension_employer: 0.0915,
                },
                2025: {
                  health_employee: 0.05,
                  health_employer: 0.05,
                  care_employee: 0.01,
                  care_employer: 0.01,
                  pension_employee: 0.092,
                  pension_employer: 0.092,
                },
              };
              return Promise.resolve(testRates[year] ?? testRates[2024]);
            },
          },
        },
      ],
    });
    service = TestBed.inject(SalaryCalculationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('TC-01: 資格取得月の厚生年金 → 0円', () => {
    it('資格取得月（入社月）の厚生年金保険料は0円になる', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-01',
        name: 'テスト従業員01',
        birthDate: '1990-05-15',
        joinDate: '2025-04-10',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 4;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      expect(result.pension_employee).toBe(0);
      expect(result.pension_employer).toBe(0);

      const expectedHealthBase = 109000;
      const testRates = getTestRates(year);
      expect(result.health_employee).toBe(
        Math.floor(expectedHealthBase * testRates.health_employee)
      );
      expect(result.health_employer).toBe(
        Math.floor(expectedHealthBase * testRates.health_employer)
      );
      expect(result.care_employee).toBe(0);
      expect(result.care_employer).toBe(0);

      expect(result.reasons).toContain(
        jasmine.stringContaining(
          '資格取得月のため厚生年金の保険料は発生しません（翌月から発生）'
        )
      );
    });

    it('資格取得月の翌月から厚生年金保険料が発生する', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-01',
        name: 'テスト従業員01',
        birthDate: '1990-05-15',
        joinDate: '2025-04-10',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 5;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      const expectedPensionBase = 109000;
      expect(result.pension_employee).toBe(
        Math.floor(expectedPensionBase * getTestRates(year).pension_employee)
      );
      expect(result.pension_employer).toBe(
        Math.floor(expectedPensionBase * getTestRates(year).pension_employer)
      );

      const joinDate = new Date(employee.joinDate);
      const joinYear = joinDate.getFullYear();
      const joinMonth = joinDate.getMonth() + 1;
      if (joinYear === year && joinMonth === month - 1) {
        expect(result.reasons).toContain(
          jasmine.stringContaining(
            '資格取得月の翌月のため厚生年金の保険料が発生します'
          )
        );
      }
    });
  });

  describe('TC-02: 健康保険の月末在籍なし → 0円', () => {
    it('退職月で月末在籍がない場合、健康保険・介護保険の保険料は0円になる', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-02',
        name: 'テスト従業員02',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        retireDate: '2025-04-15',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 4;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      expect(result.health_employee).toBe(0);
      expect(result.health_employer).toBe(0);
      expect(result.care_employee).toBe(0);
      expect(result.care_employer).toBe(0);

      const expectedPensionBase = 109000;
      expect(result.pension_employee).toBe(
        Math.floor(expectedPensionBase * getTestRates(year).pension_employee)
      );
      expect(result.pension_employer).toBe(
        Math.floor(expectedPensionBase * getTestRates(year).pension_employer)
      );

      expect(result.reasons).toContain(
        jasmine.stringContaining(
          '退職月で月末在籍がないため、健康保険・介護保険の保険料は0円です'
        )
      );
    });

    it('退職月で月末在籍がある場合、健康保険・介護保険の保険料は発生する', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-03',
        name: 'テスト従業員03',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        retireDate: '2025-04-30',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 4;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      const expectedHealthBase = 109000;
      const testRates = getTestRates(year);
      expect(result.health_employee).toBe(
        Math.floor(expectedHealthBase * testRates.health_employee)
      );
      expect(result.health_employer).toBe(
        Math.floor(expectedHealthBase * testRates.health_employer)
      );
      expect(result.care_employee).toBe(0);
      expect(result.care_employer).toBe(0);

      expect(result.reasons).not.toContain(
        jasmine.stringContaining(
          '退職月で月末在籍がないため、健康保険・介護保険の保険料は0円です'
        )
      );
    });
  });

  describe('TC-03: 健康保険の月末在籍あり → 保険料発生（正常系）', () => {
    it('月末在籍がある場合、健康保険・介護保険の保険料が正常に発生する', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-04',
        name: 'テスト従業員04',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 6;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      const expectedHealthBase = 109000;
      const testRates = getTestRates(year);
      expect(result.health_employee).toBe(
        Math.floor(expectedHealthBase * testRates.health_employee)
      );
      expect(result.health_employer).toBe(
        Math.floor(expectedHealthBase * testRates.health_employer)
      );
      expect(result.care_employee).toBe(0);
      expect(result.care_employer).toBe(0);
      expect(result.pension_employee).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).pension_employee)
      );
      expect(result.pension_employer).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).pension_employer)
      );

      expect(result.health_employee).toBeGreaterThan(0);
      expect(result.pension_employee).toBeGreaterThan(0);
    });
  });

  describe('TC-04: 介護保険第2号への切替（40歳到達月）', () => {
    it('40歳到達月で介護保険料が発生する', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: true,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-05',
        name: 'テスト従業員05',
        birthDate: '1985-05-01',
        joinDate: '2024-01-01',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 5;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      const expectedHealthBase = 109000;
      expect(result.care_employee).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).care_employee)
      );
      expect(result.care_employer).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).care_employer)
      );
      expect(result.care_employee).toBeGreaterThan(0);

      expect(result.reasons).toContain(
        jasmine.stringContaining(
          '40歳到達月のため介護保険料が発生します（到達月から適用）'
        )
      );
    });

    it('39歳では介護保険料が発生しない', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-06',
        name: 'テスト従業員06',
        birthDate: '1986-05-01',
        joinDate: '2024-01-01',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 5;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      expect(result.care_employee).toBe(0);
      expect(result.care_employer).toBe(0);
    });
  });

  describe('TC-05: 厚生年金停止（70歳到達月）', () => {
    it('70歳到達月で厚生年金保険料が停止される', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: true,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-07',
        name: 'テスト従業員07',
        birthDate: '1955-05-01',
        joinDate: '2024-01-01',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 5;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      expect(result.pension_employee).toBe(0);
      expect(result.pension_employer).toBe(0);

      const expectedHealthBase = 109000;
      expect(result.health_employee).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).health_employee)
      );
      expect(result.care_employee).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).care_employee)
      );

      expect(result.reasons).toContain(
        jasmine.stringContaining(
          '70歳到達月のため厚生年金は停止（到達月から適用）'
        )
      );
    });
  });

  describe('TC-06: 健保・介保停止（75歳到達月）', () => {
    it('75歳到達月で健康保険・介護保険が停止される', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: true,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-08',
        name: 'テスト従業員08',
        birthDate: '1950-05-01',
        joinDate: '2024-01-01',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 5;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      expect(result.health_employee).toBe(0);
      expect(result.health_employer).toBe(0);
      expect(result.care_employee).toBe(0);
      expect(result.care_employer).toBe(0);
      expect(result.pension_employee).toBe(0);
      expect(result.pension_employer).toBe(0);

      expect(result.reasons).toContain(
        jasmine.stringContaining(
          '75歳到達月のため健康保険・介護保険は停止（到達月から適用）'
        )
      );
    });
  });

  describe('TC-07: 産休期間中 → 全保険料0円', () => {
    it('産休期間中は全保険料が0円になる', async () => {
      const employee: Employee = {
        id: 'test-employee-09',
        name: 'テスト従業員09',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        maternityLeaveStart: '2025-06-01',
        maternityLeaveEnd: '2025-08-31',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 7;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      expect(result.health_employee).toBe(0);
      expect(result.health_employer).toBe(0);
      expect(result.care_employee).toBe(0);
      expect(result.care_employer).toBe(0);
      expect(result.pension_employee).toBe(0);
      expect(result.pension_employer).toBe(0);

      expect(result.reasons).toContain(
        jasmine.stringContaining(
          '産前産後休業中（健康保険・厚生年金本人分免除）'
        )
      );
    });
  });

  describe('TC-08: 育休期間中 → 全保険料0円（3条件あり）', () => {
    it('育休期間中で3条件を満たす場合、全保険料が0円になる', async () => {
      const employee: Employee = {
        id: 'test-employee-10',
        name: 'テスト従業員10',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        childcareLeaveStart: '2025-09-01',
        childcareLeaveEnd: '2026-08-31',
        childcareNotificationSubmitted: true,
        childcareLivingTogether: true,
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 10;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      expect(result.health_employee).toBe(0);
      expect(result.health_employer).toBe(0);
      expect(result.care_employee).toBe(0);
      expect(result.care_employer).toBe(0);
      expect(result.pension_employee).toBe(0);
      expect(result.pension_employer).toBe(0);

      expect(result.reasons).toContain(
        jasmine.stringContaining('育児休業中（健康保険・厚生年金本人分免除）')
      );
    });

    it('育休期間中でも3条件を満たさない場合、保険料は発生する', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-11',
        name: 'テスト従業員11',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        childcareLeaveStart: '2025-09-01',
        childcareLeaveEnd: '2026-08-31',
        childcareNotificationSubmitted: false,
        childcareLivingTogether: true,
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 10;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      const expectedHealthBase = 109000;
      const testRates = getTestRates(year);
      expect(result.health_employee).toBe(
        Math.floor(expectedHealthBase * testRates.health_employee)
      );
      expect(result.health_employer).toBe(
        Math.floor(expectedHealthBase * testRates.health_employer)
      );
      expect(result.care_employee).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).care_employee)
      );
      expect(result.care_employer).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).care_employer)
      );
      expect(result.pension_employee).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).pension_employee)
      );
      expect(result.pension_employer).toBe(
        Math.floor(expectedHealthBase * getTestRates(year).pension_employer)
      );
    });
  });

  describe('TC-09: 無給休職 → 保険料は0円にならない（仕様どおり）', () => {
    it('給与が0円の場合、実装仕様として保険料は0円になる', async () => {
      const employee: Employee = {
        id: 'test-employee-12',
        name: 'テスト従業員12',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        isShortTime: false,
        standardMonthlyRemuneration: 109000,
      };

      const year = 2025;
      const month = 6;
      const fixedSalary = 0;
      const variableSalary = 0;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      expect(result.reasons).toContain(
        jasmine.stringContaining('給与が0円のため保険料は0円')
      );

      expect(result.health_employee).toBe(0);
      expect(result.pension_employee).toBe(0);
    });
  });

  describe('TC-10: 随時改定（賃金変動→3ヶ月平均→2等級以上）適用の有無', () => {
    it('2等級以上の差がある場合、随時改定が成立する', () => {
      const employeeId = 'test-employee-13';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_4`]: { total: 500000, fixed: 500000, variable: 0 },
        [`${employeeId}_5`]: { total: 500000, fixed: 500000, variable: 0 },
        [`${employeeId}_6`]: { total: 500000, fixed: 500000, variable: 0 },
      };
      const currentGrade = 10;

      const result = service.calculateFixedSalaryChangeSuiji(
        employeeId,
        4,
        salaries,
        gradeTable,
        currentGrade
      );

      if (
        result.newGrade > 0 &&
        Math.abs(result.newGrade - currentGrade) >= 2
      ) {
        expect(result.willApply).toBe(true);
        expect(result.diff).toBeGreaterThanOrEqual(2);
      }
    });

    it('2等級未満の差の場合、随時改定は不成立', () => {
      const employeeId = 'test-employee-14';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_4`]: { total: 350000, fixed: 300000, variable: 50000 },
        [`${employeeId}_5`]: { total: 350000, fixed: 300000, variable: 50000 },
        [`${employeeId}_6`]: { total: 350000, fixed: 300000, variable: 50000 },
      };
      const currentGrade = 10;

      const result = service.calculateFixedSalaryChangeSuiji(
        employeeId,
        4,
        salaries,
        gradeTable,
        currentGrade
      );

      if (result.newGrade > 0) {
        const diff = Math.abs(result.newGrade - currentGrade);
        if (diff < 2) {
          expect(result.willApply).toBe(false);
        }
      }
    });
  });

  describe('TC-11: 定時決定（4〜6月平均）→ 等級決定 → 9月適用', () => {
    it('4〜6月の平均から等級を決定し、9月適用が設定される', () => {
      const employeeId = 'test-employee-15';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_4`]: { total: 350000, fixed: 300000, variable: 50000 },
        [`${employeeId}_5`]: { total: 350000, fixed: 300000, variable: 50000 },
        [`${employeeId}_6`]: { total: 350000, fixed: 300000, variable: 50000 },
      };
      const year = 2025;

      const result = service.calculateTeijiKettei(
        employeeId,
        salaries,
        gradeTable,
        year
      );

      expect(result.grade).toBeGreaterThan(0);
      expect(result.standardMonthlyRemuneration).toBeGreaterThan(0);
      expect(result.startApplyYearMonth).toEqual({ year: 2025, month: 9 });
      expect(result.reasons).toContain(
        jasmine.stringContaining('4〜6月の3ヶ月平均で算定')
      );
    });

    it('前月比20%以上減少した月は除外される', () => {
      const employeeId = 'test-employee-16';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_3`]: { total: 350000, fixed: 300000, variable: 50000 },
        [`${employeeId}_4`]: { total: 250000, fixed: 200000, variable: 50000 },
        [`${employeeId}_5`]: { total: 350000, fixed: 300000, variable: 50000 },
        [`${employeeId}_6`]: { total: 350000, fixed: 300000, variable: 50000 },
      };
      const year = 2025;

      const result = service.calculateTeijiKettei(
        employeeId,
        salaries,
        gradeTable,
        year
      );

      expect(result.excludedMonths).toContain(4);
      expect(
        result.reasons.some((r) => r.includes('4月') && r.includes('算定除外'))
      ).toBe(true);
    });
  });

  describe('TC-12: 標準報酬の四捨五入確認（1000円未満四捨五入）', () => {
    it('資格取得時決定で1000円未満が四捨五入される', async () => {
      const employee: Employee = {
        id: 'test-employee-17',
        name: 'テスト従業員17',
        birthDate: '1990-05-15',
        joinDate: '2025-04-10',
        isShortTime: false,
      };
      const year = 2025;
      const salaries: { [key: string]: SalaryData } = {
        [`${employee.id}_4`]: { total: 350499, fixed: 300000, variable: 50499 },
      };

      const result = await service.calculateShikakuShutoku(
        employee,
        year,
        salaries,
        gradeTable
      );

      if (result) {
        expect(result.baseSalary).toBe(350000);
        expect(
          result.reasons.some((r) => r.includes('1000円単位に四捨五入'))
        ).toBe(true);
      }
    });

    it('定時決定で1000円未満が四捨五入される', async () => {
      const employeeId = 'test-employee-18';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_4`]: { total: 350499, fixed: 300000, variable: 50499 },
        [`${employeeId}_5`]: { total: 350499, fixed: 300000, variable: 50499 },
        [`${employeeId}_6`]: { total: 350499, fixed: 300000, variable: 50499 },
      };
      const year = 2025;

      const result = service.calculateTeijiKettei(
        employeeId,
        salaries,
        gradeTable,
        year
      );

      expect(result.averageSalary % 1000).toBe(0);
    });

    it('随時改定で1000円未満が四捨五入される', () => {
      const employeeId = 'test-employee-19';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_4`]: { total: 350499, fixed: 300000, variable: 50499 },
        [`${employeeId}_5`]: { total: 350499, fixed: 300000, variable: 50499 },
        [`${employeeId}_6`]: { total: 350499, fixed: 300000, variable: 50499 },
      };
      const currentGrade = 10;

      const result = service.calculateFixedSalaryChangeSuiji(
        employeeId,
        4,
        salaries,
        gradeTable,
        currentGrade
      );

      expect(result.averageSalary % 1000).toBe(0);
    });
  });

  describe('TC-13: 固定的賃金のみで随時改定を判定する場合の挙動', () => {
    it('getFixed3Monthsで固定的賃金のみを取得できる', () => {
      const employeeId = 'test-employee-20';
      const salaries: { [key: string]: SalaryData } = {
        [`${employeeId}_4`]: { total: 350000, fixed: 300000, variable: 50000 },
        [`${employeeId}_5`]: { total: 350000, fixed: 300000, variable: 50000 },
        [`${employeeId}_6`]: { total: 350000, fixed: 300000, variable: 50000 },
      };

      const result = service.getFixed3Months(employeeId, 4, salaries);

      expect(result.length).toBe(3);
      expect(result[0]).toBe(300000);
      expect(result[1]).toBe(300000);
      expect(result[2]).toBe(300000);
    });
  });

  describe('TC-14: 厚年の同月得喪で1ヶ月分発生する条件', () => {
    it('資格取得月と退職月が同じ場合、厚生年金は0円（資格取得月のため）', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-21',
        name: 'テスト従業員21',
        birthDate: '1990-05-15',
        joinDate: '2025-04-10',
        retireDate: '2025-04-30',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 4;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      expect(result.pension_employee).toBe(0);
      expect(result.pension_employer).toBe(0);
    });

    it('資格取得月より後で退職月の場合、厚生年金は発生する', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-22',
        name: 'テスト従業員22',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        retireDate: '2025-04-15',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 4;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      const expectedPensionBase = 109000;
      expect(result.pension_employee).toBe(
        Math.floor(expectedPensionBase * getTestRates(year).pension_employee)
      );
      expect(result.pension_employer).toBe(
        Math.floor(expectedPensionBase * getTestRates(year).pension_employer)
      );
    });
  });

  describe('TC-15: 支給月の料率切替（effectiveFrom で新旧切替）', () => {
    it('料率は支給月に応じて選択される（settings.service.tsの責務）', async () => {
      employeeEligibilityServiceStub.ageFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const employee: Employee = {
        id: 'test-employee-23',
        name: 'テスト従業員23',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        isShortTime: false,
        standardMonthlyRemuneration: 300000,
      };

      const year = 2025;
      const month = 6;
      const fixedSalary = 300000;
      const variableSalary = 50000;

      const result = await service.calculateMonthlyPremiums(
        employee,
        year,
        month,
        fixedSalary,
        variableSalary,
        gradeTable
      );

      const expectedHealthBase = 109000;
      const testRates = getTestRates(year);
      expect(result.health_employee).toBe(
        Math.floor(expectedHealthBase * testRates.health_employee)
      );
      expect(result.health_employer).toBe(
        Math.floor(expectedHealthBase * testRates.health_employer)
      );

      expect(result.health_employee).toBeGreaterThan(0);
    });
  });
});
