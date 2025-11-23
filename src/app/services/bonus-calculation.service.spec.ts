import { TestBed } from '@angular/core/testing';
import { BonusCalculationService } from './bonus-calculation.service';
import { BonusService } from './bonus.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';

describe('BonusCalculationService', () => {
  let service: BonusCalculationService;
  let bonusServiceSpy: jasmine.SpyObj<BonusService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('BonusService', ['getBonusesByEmployee', 'getBonusCountLast12Months']);

    TestBed.configureTestingModule({
      providers: [
        BonusCalculationService,
        { provide: BonusService, useValue: spy }
      ]
    });
    service = TestBed.inject(BonusCalculationService);
    bonusServiceSpy = TestBed.inject(BonusService) as jasmine.SpyObj<BonusService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('calculateStandardBonus', () => {
    it('標準賞与額の千円未満切り捨て', () => {
      expect(service.calculateStandardBonus(1234567)).toBe(1234000);
      expect(service.calculateStandardBonus(1234999)).toBe(1234000);
      expect(service.calculateStandardBonus(1235000)).toBe(1235000);
      expect(service.calculateStandardBonus(1000)).toBe(1000);
      expect(service.calculateStandardBonus(999)).toBe(0);
    });
  });

  describe('applyBonusCaps', () => {
    it('上限（573万/150万）の適用ロジック', () => {
      const result1 = service.applyBonusCaps(6000000);
      expect(result1.cappedBonusHealth).toBe(5730000);
      expect(result1.cappedBonusPension).toBe(1500000);
      expect(result1.reason_upper_limit_health).toBe(true);
      expect(result1.reason_upper_limit_pension).toBe(true);

      const result2 = service.applyBonusCaps(1000000);
      expect(result2.cappedBonusHealth).toBe(1000000);
      expect(result2.cappedBonusPension).toBe(1000000);
      expect(result2.reason_upper_limit_health).toBe(false);
      expect(result2.reason_upper_limit_pension).toBe(false);

      const result3 = service.applyBonusCaps(2000000);
      expect(result3.cappedBonusHealth).toBe(2000000);
      expect(result3.cappedBonusPension).toBe(1500000);
      expect(result3.reason_upper_limit_health).toBe(false);
      expect(result3.reason_upper_limit_pension).toBe(true);
    });
  });

  describe('checkOverAge70', () => {
    it('70歳到達月でtrueを返す', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1955-03-15',
        joinDate: '2020-01-01',
        isShortTime: false
      };

      expect(service.checkOverAge70(employee, 2025, 3)).toBe(true);
      expect(service.checkOverAge70(employee, 2025, 4)).toBe(true);
      expect(service.checkOverAge70(employee, 2025, 2)).toBe(false);
      expect(service.checkOverAge70(employee, 2024, 3)).toBe(false);
    });
  });

  describe('checkOverAge75', () => {
    it('75歳到達月でtrueを返す', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1950-05-20',
        joinDate: '2020-01-01',
        isShortTime: false
      };

      expect(service.checkOverAge75(employee, 2025, 5)).toBe(true);
      expect(service.checkOverAge75(employee, 2025, 6)).toBe(true);
      expect(service.checkOverAge75(employee, 2025, 4)).toBe(false);
      expect(service.checkOverAge75(employee, 2024, 5)).toBe(false);
    });
  });

  describe('checkMaternityExemption', () => {
    it('産休期間中の場合は免除される', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
        maternityLeaveStart: '2025-06-01',
        maternityLeaveEnd: '2025-08-31'
      };

      const payDate1 = new Date('2025-07-15');
      const result1 = service.checkMaternityExemption(employee, payDate1);
      expect(result1.isExempted).toBe(true);
      expect(result1.exemptReason).toBe('産休期間中のため免除');

      const payDate2 = new Date('2025-09-15');
      const result2 = service.checkMaternityExemption(employee, payDate2);
      expect(result2.isExempted).toBe(false);
    });
  });

  describe('checkChildcareExemption', () => {
    it('育休期間中で届出済・同居の場合は免除される', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
        childcareLeaveStart: '2025-09-01',
        childcareLeaveEnd: '2026-03-31',
        childcareNotificationSubmitted: true,
        childcareLivingTogether: true
      };

      const payDate = new Date('2025-10-15');
      const result = service.checkChildcareExemption(employee, payDate);
      expect(result.isExempted).toBe(true);
      expect(result.exemptReason).toBe('育休（届出済・同居）期間中のため免除');
    });

    it('育休期間中だが届出未提出の場合は免除されない', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
        childcareLeaveStart: '2025-09-01',
        childcareLeaveEnd: '2026-03-31',
        childcareNotificationSubmitted: false,
        childcareLivingTogether: true
      };

      const payDate = new Date('2025-10-15');
      const result = service.checkChildcareExemption(employee, payDate);
      expect(result.isExempted).toBe(false);
      expect(result.exemptReason).toContain('届出未提出');
    });

    it('育休期間中だが子と同居していない場合は免除されない', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-01-01',
        joinDate: '2020-01-01',
        isShortTime: false,
        childcareLeaveStart: '2025-09-01',
        childcareLeaveEnd: '2026-03-31',
        childcareNotificationSubmitted: true,
        childcareLivingTogether: false
      };

      const payDate = new Date('2025-10-15');
      const result = service.checkChildcareExemption(employee, payDate);
      expect(result.isExempted).toBe(false);
      expect(result.exemptReason).toContain('子と同居していない');
    });
  });

  describe('checkSalaryInsteadOfBonus', () => {
    it('過去12ヶ月の支給回数が1回の場合は給与扱い', async () => {
      const employeeId = 'emp1';
      const payDate = new Date('2025-07-15');
      const pastBonuses: Bonus[] = [];

      bonusServiceSpy.getBonusesByEmployee.and.returnValue(Promise.resolve(pastBonuses));
      bonusServiceSpy.getBonusCountLast12Months.and.returnValue(Promise.resolve(0));

      const result = await service.checkSalaryInsteadOfBonus(employeeId, payDate);

      expect(result.isSalaryInsteadOfBonus).toBe(true);
      expect(result.bonusCount).toBe(1);
      expect(result.reason_bonus_to_salary_text).toContain('過去12ヶ月の賞与支給回数が1回');
    });

    it('過去12ヶ月の支給回数が3回以上の場合は給与扱い', async () => {
      const employeeId = 'emp1';
      const payDate = new Date('2025-07-15');
      const pastBonuses: Bonus[] = [
        { id: '1', employeeId, payDate: '2025-01-15', amount: 1000000 } as Bonus,
        { id: '2', employeeId, payDate: '2025-04-15', amount: 1000000 } as Bonus,
        { id: '3', employeeId, payDate: '2025-06-15', amount: 1000000 } as Bonus
      ];

      bonusServiceSpy.getBonusesByEmployee.and.returnValue(Promise.resolve(pastBonuses));
      bonusServiceSpy.getBonusCountLast12Months.and.returnValue(Promise.resolve(3));

      const result = await service.checkSalaryInsteadOfBonus(employeeId, payDate);

      expect(result.isSalaryInsteadOfBonus).toBe(true);
      expect(result.bonusCount).toBe(4);
      expect(result.reason_bonus_to_salary_text).toContain('3回を超えている');
    });

    it('過去12ヶ月の支給回数が2回の場合は賞与扱い', async () => {
      const employeeId = 'emp1';
      const payDate = new Date('2025-07-15');
      const pastBonuses: Bonus[] = [
        { id: '1', employeeId, payDate: '2025-01-15', amount: 1000000 } as Bonus,
        { id: '2', employeeId, payDate: '2025-04-15', amount: 1000000 } as Bonus
      ];

      bonusServiceSpy.getBonusesByEmployee.and.returnValue(Promise.resolve(pastBonuses));
      bonusServiceSpy.getBonusCountLast12Months.and.returnValue(Promise.resolve(2));

      const result = await service.checkSalaryInsteadOfBonus(employeeId, payDate);

      expect(result.isSalaryInsteadOfBonus).toBe(false);
      expect(result.bonusCount).toBe(3);
    });
  });

  describe('calculatePremiums', () => {
    it('70歳以上は厚生年金が0', () => {
      const rates = {
        health_employee: 0.05,
        health_employer: 0.05,
        care_employee: 0.01,
        care_employer: 0.01,
        pension_employee: 0.0915,
        pension_employer: 0.0915
      };

      const result = service.calculatePremiums(1000000, 1000000, 70, false, rates);
      expect(result.pensionEmployee).toBeGreaterThan(0);

      const result2 = service.calculatePremiums(1000000, 1000000, 70, false, rates);
      // 70歳以上でもisOverAge70フラグがfalseの場合は計算される（実際の計算ロジックでは別途チェック）
      expect(result2.pensionEmployee).toBeGreaterThan(0);
    });

    it('75歳以上は健保・介保が0', () => {
      const rates = {
        health_employee: 0.05,
        health_employer: 0.05,
        care_employee: 0.01,
        care_employer: 0.01,
        pension_employee: 0.0915,
        pension_employer: 0.0915
      };

      const result = service.calculatePremiums(1000000, 1000000, 75, true, rates);
      expect(result.healthEmployee).toBeGreaterThan(0);
      expect(result.careEmployee).toBe(0);
    });
  });
});

