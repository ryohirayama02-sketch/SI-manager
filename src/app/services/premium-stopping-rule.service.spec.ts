import { PremiumStoppingRuleService } from './premium-stopping-rule.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { Employee } from '../models/employee.model';

describe('PremiumStoppingRuleService', () => {
  let service: PremiumStoppingRuleService;
  let lifecycle: jasmine.SpyObj<EmployeeLifecycleService>;

  const targetDate = new Date('2025-01-01');
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1;

  const baseEmployee: Employee = {
    id: 'emp1',
    name: 'テスト太郎',
    birthDate: '1990-01-01',
    joinDate: '2020-01-01',
    isShortTime: false,
    prefecture: 'tokyo',
    officeNumber: '0001',
    weeklyWorkHoursCategory: '30hours-or-more',
  };

  const basePremium = {
    healthEmployee: 100,
    healthEmployer: 200,
    careEmployee: 300,
    careEmployer: 400,
    pensionEmployee: 500,
    pensionEmployer: 600,
  };

  beforeEach(() => {
    lifecycle = jasmine.createSpyObj<EmployeeLifecycleService>(
      'EmployeeLifecycleService',
      ['isRetiredInMonth', 'isMaternityLeave', 'isChildcareLeave']
    );
    lifecycle.isRetiredInMonth.and.returnValue(false);
    lifecycle.isMaternityLeave.and.returnValue(false);
    lifecycle.isChildcareLeave.and.returnValue(false);
    service = new PremiumStoppingRuleService(lifecycle);
  });

  describe('年齢による停止', () => {
    it('39歳: health○ care× pension○', () => {
      const result = service.applyStoppingRules(baseEmployee, year, month, 39, {
        ...basePremium,
      });
      expect(result.healthEmployee).toBe(100);
      expect(result.careEmployee).toBe(300);
      expect(result.pensionEmployee).toBe(500);
      expect(result.isHealthStopped).toBeFalse();
      expect(result.isPensionStopped).toBeFalse();
    });

    it('40歳: health○ care○ pension○', () => {
      const result = service.applyStoppingRules(baseEmployee, year, month, 40, {
        ...basePremium,
      });
      expect(result.healthEmployee).toBe(100);
      expect(result.careEmployee).toBe(300);
      expect(result.pensionEmployee).toBe(500);
      expect(result.isHealthStopped).toBeFalse();
      expect(result.isPensionStopped).toBeFalse();
    });

    it('69歳: health○ care○ pension○', () => {
      const result = service.applyStoppingRules(baseEmployee, year, month, 69, {
        ...basePremium,
      });
      expect(result.healthEmployee).toBe(100);
      expect(result.careEmployee).toBe(300);
      expect(result.pensionEmployee).toBe(500);
      expect(result.isHealthStopped).toBeFalse();
      expect(result.isPensionStopped).toBeFalse();
    });

    it('70歳: pension停止のみ', () => {
      const result = service.applyStoppingRules(baseEmployee, year, month, 70, {
        ...basePremium,
      });
      expect(result.healthEmployee).toBe(100);
      expect(result.careEmployee).toBe(300);
      expect(result.pensionEmployee).toBe(0);
      expect(result.pensionEmployer).toBe(0);
      expect(result.isPensionStopped).toBeTrue();
      expect(result.isHealthStopped).toBeFalse();
    });

    it('75歳: health/care/pension 全停止', () => {
      const result = service.applyStoppingRules(baseEmployee, year, month, 75, {
        ...basePremium,
      });
      expect(result.healthEmployee).toBe(0);
      expect(result.healthEmployer).toBe(0);
      expect(result.careEmployee).toBe(0);
      expect(result.careEmployer).toBe(0);
      expect(result.pensionEmployee).toBe(0);
      expect(result.pensionEmployer).toBe(0);
      expect(result.isHealthStopped).toBeTrue();
      expect(result.isPensionStopped).toBeTrue();
    });
  });

  describe('産前産後・育児休業の停止', () => {
    it('maternityOrChildcareLeaveで本人負担0（事業主は維持）', () => {
      lifecycle.isMaternityLeave.and.returnValue(true);
      const result = service.applyStoppingRules(baseEmployee, year, month, 30, {
        ...basePremium,
      });
      expect(result.healthEmployee).toBe(0);
      expect(result.careEmployee).toBe(0);
      expect(result.pensionEmployee).toBe(0);
      expect(result.healthEmployer).toBe(200);
      expect(result.careEmployer).toBe(400);
      expect(result.pensionEmployer).toBe(600);
      expect(result.isMaternityLeave).toBeTrue();
      expect(result.isChildcareLeave).toBeFalse();
    });
  });

  describe('退職済みの扱い', () => {
    it('退職月は全停止', () => {
      lifecycle.isRetiredInMonth.and.returnValue(true);
      const result = service.applyStoppingRules(baseEmployee, year, month, 40, {
        ...basePremium,
      });
      expect(result.healthEmployee).toBe(0);
      expect(result.careEmployee).toBe(0);
      expect(result.pensionEmployee).toBe(0);
      expect(result.isRetired).toBeTrue();
    });
  });

  describe('複合優先順位', () => {
    it('75歳 & 育休: 年齢停止が優先（health/care/pension全停止）', () => {
      lifecycle.isChildcareLeave.and.returnValue(true);
      const result = service.applyStoppingRules(baseEmployee, year, month, 75, {
        ...basePremium,
      });
      expect(result.healthEmployee).toBe(0);
      expect(result.healthEmployer).toBe(0);
      expect(result.careEmployee).toBe(0);
      expect(result.careEmployer).toBe(0);
      expect(result.pensionEmployee).toBe(0);
      expect(result.pensionEmployer).toBe(0);
      expect(result.isHealthStopped).toBeTrue();
      expect(result.isChildcareLeave).toBeTrue();
    });

    it('70歳 & 育休: pension停止＋育休免除（health/care employer維持）', () => {
      lifecycle.isChildcareLeave.and.returnValue(true);
      const result = service.applyStoppingRules(baseEmployee, year, month, 70, {
        ...basePremium,
      });
      expect(result.healthEmployee).toBe(0);
      expect(result.careEmployee).toBe(0);
      expect(result.pensionEmployee).toBe(0);
      expect(result.pensionEmployer).toBe(0);
      expect(result.healthEmployer).toBe(200);
      expect(result.careEmployer).toBe(400);
      expect(result.isPensionStopped).toBeTrue();
      expect(result.isChildcareLeave).toBeTrue();
    });
  });
});
