import { of } from 'rxjs';
import { EmployeeEligibilityService } from './employee-eligibility.service';
import { EmployeeWorkCategoryService } from './employee-work-category.service';
import { Employee } from '../models/employee.model';

describe('EmployeeEligibilityService', () => {
  let service: EmployeeEligibilityService;
  let workCategoryService: jasmine.SpyObj<EmployeeWorkCategoryService>;

  const today = new Date('2025-01-01');

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

  beforeEach(() => {
    const employeeServiceMock = {
      observeEmployees: () => of(),
    } as any;
    workCategoryService = jasmine.createSpyObj<EmployeeWorkCategoryService>(
      'EmployeeWorkCategoryService',
      ['getWorkCategory']
    );
    workCategoryService.getWorkCategory.and.returnValue('full-time');

    service = new EmployeeEligibilityService(
      employeeServiceMock,
      workCategoryService
    );
  });

  describe('退職日の扱い', () => {
    it('基準日より前に退職なら全保険不可', () => {
      const employee: Employee = {
        ...baseEmployee,
        retireDate: '2024-12-31',
      };
      const result = service.checkEligibility(employee, today);
      expect(result.healthInsuranceEligible).toBeFalse();
      expect(result.pensionEligible).toBeFalse();
      expect(result.careInsuranceEligible).toBeFalse();
      expect(result.reasons).toContain('退職済みのため加入不可');
    });

    it('基準日以降の退職日は退職扱いしない', () => {
      const employee: Employee = {
        ...baseEmployee,
        retireDate: '2025-01-01',
      };
      const result = service.checkEligibility(employee, today);
      expect(result.reasons).not.toContain('退職済みのため加入不可');
    });
  });

  describe('年齢制御（2025-01-01 基準）', () => {
    it('39歳: 健保○ 介保× 厚年○', () => {
      const employee: Employee = { ...baseEmployee, birthDate: '1985-01-02' };
      const result = service.checkEligibility(employee, today);
      expect(result.healthInsuranceEligible).toBeTrue();
      expect(result.careInsuranceEligible).toBeFalse();
      expect(result.pensionEligible).toBeTrue();
    });

    it('40歳: 健保○ 介保○ 厚年○', () => {
      const employee: Employee = { ...baseEmployee, birthDate: '1985-01-01' };
      const result = service.checkEligibility(employee, today);
      expect(result.healthInsuranceEligible).toBeTrue();
      expect(result.careInsuranceEligible).toBeTrue();
      expect(result.pensionEligible).toBeTrue();
    });

    it('65歳: 健保○ 介保○ 厚年○', () => {
      const employee: Employee = { ...baseEmployee, birthDate: '1960-01-01' };
      const result = service.checkEligibility(employee, today);
      expect(result.healthInsuranceEligible).toBeTrue();
      expect(result.careInsuranceEligible).toBeTrue();
      expect(result.pensionEligible).toBeTrue();
    });

    it('70歳: 健保○ 介保○ 厚年×', () => {
      const employee: Employee = { ...baseEmployee, birthDate: '1955-01-01' };
      const result = service.checkEligibility(employee, today);
      expect(result.healthInsuranceEligible).toBeTrue();
      expect(result.careInsuranceEligible).toBeTrue();
      expect(result.pensionEligible).toBeFalse();
      expect(result.reasons).toContain('70歳以上のため厚生年金は停止');
    });

    it('75歳: 健保× 介保× 厚年×', () => {
      const employee: Employee = { ...baseEmployee, birthDate: '1950-01-01' };
      const result = service.checkEligibility(employee, today);
      expect(result.healthInsuranceEligible).toBeFalse();
      expect(result.careInsuranceEligible).toBeFalse();
      expect(result.pensionEligible).toBeFalse();
      expect(result.reasons).toContain(
        '75歳以上のため健康保険・介護保険は加入不可'
      );
    });
  });

  describe('勤務区分による加入可否', () => {
    it('full-time は加入対象理由が付与される', () => {
      workCategoryService.getWorkCategory.and.returnValue('full-time');
      const result = service.checkEligibility(baseEmployee, today);
      expect(result.healthInsuranceEligible).toBeTrue();
      expect(result.pensionEligible).toBeTrue();
      expect(result.reasons).toContain('勤務区分がフルタイムのため加入対象');
    });

    it('short-time-worker は加入対象理由が付与される', () => {
      workCategoryService.getWorkCategory.and.returnValue('short-time-worker');
      const result = service.checkEligibility(baseEmployee, today);
      expect(result.healthInsuranceEligible).toBeTrue();
      expect(result.pensionEligible).toBeTrue();
      expect(result.reasons).toContain(
        '勤務区分が短時間労働者（特定適用）に該当するため加入対象'
      );
    });

    it('non-insured は加入不可理由が付与される', () => {
      workCategoryService.getWorkCategory.and.returnValue('non-insured');
      const result = service.checkEligibility(baseEmployee, today);
      expect(result.healthInsuranceEligible).toBeFalse();
      expect(result.pensionEligible).toBeFalse();
      expect(result.careInsuranceEligible).toBeFalse();
      expect(result.reasons).toContain(
        '勤務区分が社会保険非加入のため加入不可'
      );
    });
  });
});
