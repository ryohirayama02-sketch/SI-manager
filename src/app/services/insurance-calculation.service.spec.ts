import { TestBed } from '@angular/core/testing';
import { InsuranceCalculationService } from './insurance-calculation.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';

describe('InsuranceCalculationService', () => {
  let service: InsuranceCalculationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InsuranceCalculationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAnnualPremiums', () => {
    it('賞与＋月額を正しく合算', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
      };

      const bonusData: Bonus[] = [
        {
          id: '1',
          roomId: 'test-room',
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
          year: 2025,
          month: 6,
          createdAt: new Date('2025-06-15'),
          isExempt: false,
          cappedHealth: 1000000,
          cappedPension: 1000000,
        } as unknown as Bonus,
        {
          id: '2',
          roomId: 'test-room',
          employeeId: 'emp1',
          payDate: '2025-12-15',
          amount: 1500000,
          healthEmployee: 75000,
          healthEmployer: 75000,
          careEmployee: 15000,
          careEmployer: 15000,
          pensionEmployee: 137250,
          pensionEmployer: 137250,
          isExempted: false,
          isSalaryInsteadOfBonus: false,
          year: 2025,
          month: 12,
          createdAt: new Date('2025-12-15'),
          isExempt: false,
          cappedHealth: 1500000,
          cappedPension: 1500000,
        } as unknown as Bonus,
      ];

      const result = service.getAnnualPremiums(employee, null, bonusData);

      expect(result.healthEmployee).toBe(125000);
      expect(result.healthEmployer).toBe(125000);
      expect(result.careEmployee).toBe(25000);
      expect(result.careEmployer).toBe(25000);
      expect(result.pensionEmployee).toBe(228750);
      expect(result.pensionEmployer).toBe(228750);
    });

    it('免除された賞与は合算に含めない', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
      };

      const bonusData: Bonus[] = [
        {
          id: '1',
          roomId: 'test-room',
          employeeId: 'emp1',
          payDate: '2025-06-15',
          amount: 1000000,
          healthEmployee: 50000,
          healthEmployer: 50000,
          careEmployee: 10000,
          careEmployer: 10000,
          pensionEmployee: 91500,
          pensionEmployer: 91500,
          isExempted: true,
          exemptReason: '産休期間中のため免除',
          isSalaryInsteadOfBonus: false,
          year: 2025,
          month: 6,
          createdAt: new Date('2025-06-15'),
          isExempt: true,
          cappedHealth: 1000000,
          cappedPension: 1000000,
        } as unknown as Bonus,
        {
          id: '2',
          roomId: 'test-room',
          employeeId: 'emp1',
          payDate: '2025-12-15',
          amount: 1500000,
          healthEmployee: 75000,
          healthEmployer: 75000,
          careEmployee: 15000,
          careEmployer: 15000,
          pensionEmployee: 137250,
          pensionEmployer: 137250,
          isExempted: false,
          isSalaryInsteadOfBonus: false,
          year: 2025,
          month: 12,
          createdAt: new Date('2025-12-15'),
          isExempt: false,
          cappedHealth: 1500000,
          cappedPension: 1500000,
        } as unknown as Bonus,
      ];

      const result = service.getAnnualPremiums(employee, null, bonusData);

      expect(result.healthEmployee).toBe(75000);
      expect(result.healthEmployer).toBe(75000);
      expect(result.exemptReasons).toContain('産休期間中のため免除');
    });

    it('給与扱いの賞与は合算に含めない', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
      };

      const bonusData: Bonus[] = [
        {
          id: '1',
          roomId: 'test-room',
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
          isSalaryInsteadOfBonus: true,
          reason_bonus_to_salary_text:
            '過去12ヶ月の賞与支給回数が1回のため給与扱い',
          year: 2025,
          month: 6,
          createdAt: new Date('2025-06-15'),
          isExempt: false,
          cappedHealth: 1000000,
          cappedPension: 1000000,
        } as unknown as Bonus,
      ];

      const result = service.getAnnualPremiums(employee, null, bonusData);

      expect(result.healthEmployee).toBe(0);
      expect(result.healthEmployer).toBe(0);
      expect(result.salaryInsteadReasons.length).toBeGreaterThan(0);
    });
  });

  describe('getMonthlyCompanyBurden', () => {
    it('従業員を跨いだ集計ロジック', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
      };

      const monthlyPremiums = {
        6: {
          healthEmployee: 10000,
          healthEmployer: 10000,
          careEmployee: 2000,
          careEmployer: 2000,
          pensionEmployee: 18300,
          pensionEmployer: 18300,
        },
        7: {
          healthEmployee: 10000,
          healthEmployer: 10000,
          careEmployee: 2000,
          careEmployer: 2000,
          pensionEmployee: 18300,
          pensionEmployer: 18300,
        },
      };

      const bonusPremiums: Bonus[] = [
        {
          id: '1',
          roomId: 'test-room',
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
          year: 2025,
          month: 6,
          createdAt: new Date('2025-06-15'),
          isExempt: false,
          cappedHealth: 1000000,
          cappedPension: 1000000,
        } as unknown as Bonus,
      ];

      const result = service.getMonthlyCompanyBurden(
        employee,
        monthlyPremiums,
        bonusPremiums
      );

      expect(result[6].health).toBe(70000); // 月次(10000+10000) + 賞与(50000+50000)
      expect(result[6].care).toBe(14000); // 月次(2000+2000) + 賞与(10000+10000)
      expect(result[6].pension).toBe(109800); // 月次(18300+18300) + 賞与(91500+91500)
      expect(result[6].total).toBe(193800);

      expect(result[7].health).toBe(20000); // 月次のみ
      expect(result[7].care).toBe(4000); // 月次のみ
      expect(result[7].pension).toBe(36600); // 月次のみ
      expect(result[7].total).toBe(60600);
    });

    it('免除された賞与は集計に含めない', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
      };

      const monthlyPremiums = {};

      const bonusPremiums: Bonus[] = [
        {
          id: '1',
          roomId: 'test-room',
          employeeId: 'emp1',
          payDate: '2025-06-15',
          amount: 1000000,
          healthEmployee: 50000,
          healthEmployer: 50000,
          careEmployee: 10000,
          careEmployer: 10000,
          pensionEmployee: 91500,
          pensionEmployer: 91500,
          isExempted: true,
          isSalaryInsteadOfBonus: false,
          year: 2025,
          month: 6,
          createdAt: new Date('2025-06-15'),
          isExempt: true,
          cappedHealth: 1000000,
          cappedPension: 1000000,
        } as unknown as Bonus,
      ];

      const result = service.getMonthlyCompanyBurden(
        employee,
        monthlyPremiums,
        bonusPremiums
      );

      expect(result[6].health).toBe(0);
      expect(result[6].care).toBe(0);
      expect(result[6].pension).toBe(0);
      expect(result[6].total).toBe(0);
    });
  });

  describe('getAge', () => {
    it('年齢が正しく計算される', () => {
      const today = new Date();
      const birthYear = today.getFullYear() - 30;
      const birthDate = `${birthYear}-01-01`;

      const age = service.getAge(birthDate);
      expect(age).toBe(30);
    });
  });

  describe('isCareInsuranceEligible', () => {
    it('40〜64歳の場合はtrue', () => {
      expect(service.isCareInsuranceEligible(40)).toBe(true);
      expect(service.isCareInsuranceEligible(50)).toBe(true);
      expect(service.isCareInsuranceEligible(64)).toBe(true);
    });

    it('39歳以下または65歳以上の場合はfalse', () => {
      expect(service.isCareInsuranceEligible(39)).toBe(false);
      expect(service.isCareInsuranceEligible(65)).toBe(false);
      expect(service.isCareInsuranceEligible(75)).toBe(false);
    });
  });
});
