import { EmployeeWorkCategoryService } from './employee-work-category.service';
import { Employee } from '../models/employee.model';

describe('EmployeeWorkCategoryService', () => {
  let service: EmployeeWorkCategoryService;

  const baseEmployee: Employee = {
    id: 'emp1',
    name: 'テスト太郎',
    birthDate: '1990-01-01',
    isShortTime: false,
    prefecture: 'tokyo',
    officeNumber: '0000',
    weeklyWorkHoursCategory: '',
  };

  beforeEach(() => {
    service = new EmployeeWorkCategoryService();
  });

  describe('full-time判定', () => {
    it("returns 'full-time' when weeklyWorkHoursCategory is 30hours-or-more", () => {
      const employee: Employee = {
        ...baseEmployee,
        weeklyWorkHoursCategory: '30hours-or-more',
      };
      expect(service.getWorkCategory(employee)).toBe('full-time');
    });
  });

  describe('non-insured判定', () => {
    it("returns 'non-insured' when weeklyWorkHoursCategory is less-than-20hours", () => {
      const employee: Employee = {
        ...baseEmployee,
        weeklyWorkHoursCategory: 'less-than-20hours',
      };
      expect(service.getWorkCategory(employee)).toBe('non-insured');
    });

    it("returns 'non-insured' when weeklyWorkHoursCategory is empty", () => {
      const employee: Employee = {
        ...baseEmployee,
        weeklyWorkHoursCategory: '',
      };
      expect(service.getWorkCategory(employee)).toBe('non-insured');
    });

    it("returns 'non-insured' when weeklyWorkHoursCategory is null", () => {
      const employee: Employee = {
        ...baseEmployee,
        weeklyWorkHoursCategory: null as unknown as string,
      };
      expect(service.getWorkCategory(employee)).toBe('non-insured');
    });

    it("returns 'non-insured' when weeklyWorkHoursCategory is undefined", () => {
      const employee: Employee = {
        ...baseEmployee,
        weeklyWorkHoursCategory: undefined,
      };
      expect(service.getWorkCategory(employee)).toBe('non-insured');
    });
  });

  describe('short-time-worker判定', () => {
    it("returns 'short-time-worker' when all conditions are met", () => {
      const employee: Employee = {
        ...baseEmployee,
        weeklyWorkHoursCategory: '20-30hours',
        monthlyWage: 88000,
        expectedEmploymentMonths: 'over-2months',
        isStudent: false,
      };
      expect(service.getWorkCategory(employee)).toBe('short-time-worker');
    });

    it("returns 'non-insured' when monthlyWage is below 88000", () => {
      const employee: Employee = {
        ...baseEmployee,
        weeklyWorkHoursCategory: '20-30hours',
        monthlyWage: 87999,
        expectedEmploymentMonths: 'over-2months',
        isStudent: false,
      };
      expect(service.getWorkCategory(employee)).toBe('non-insured');
    });

    it("returns 'non-insured' when expectedEmploymentMonths is within-2months", () => {
      const employee: Employee = {
        ...baseEmployee,
        weeklyWorkHoursCategory: '20-30hours',
        monthlyWage: 88000,
        expectedEmploymentMonths: 'within-2months',
        isStudent: false,
      };
      expect(service.getWorkCategory(employee)).toBe('non-insured');
    });

    it("returns 'non-insured' when isStudent is true", () => {
      const employee: Employee = {
        ...baseEmployee,
        weeklyWorkHoursCategory: '20-30hours',
        monthlyWage: 88000,
        expectedEmploymentMonths: 'over-2months',
        isStudent: true,
      };
      expect(service.getWorkCategory(employee)).toBe('non-insured');
    });
  });
});
