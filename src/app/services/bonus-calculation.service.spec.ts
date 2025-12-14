import { TestBed } from '@angular/core/testing';
import { BonusCalculationService } from './bonus-calculation.service';
import { BonusService } from './bonus.service';
import {
  EmployeeEligibilityService,
  AgeFlags,
} from './employee-eligibility.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { MaternityLeaveService } from './maternity-leave.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';

// スタブクラス定義
class BonusServiceStub {
  bonusesForResult: Bonus[] = [];
  bonusesLast12Months: Bonus[] = [];

  async listBonuses(
    roomId: string,
    employeeId: string,
    year: number
  ): Promise<Bonus[]> {
    const combined = [...this.bonusesForResult, ...this.bonusesLast12Months];
    return combined.filter((bonus) => bonus.year === year);
  }
}

class EmployeeEligibilityServiceStub {
  ageFlags: AgeFlags = {
    isNoHealth: false,
    isNoPension: false,
    isCare1: false,
    isCare2: true,
  };

  checkEligibility(employee: Employee, salary?: any, date?: Date): any {
    return {
      ageFlags: this.ageFlags,
    };
  }
}

class SalaryCalculationServiceStub {
  addBonusAsSalary = jasmine.createSpy('addBonusAsSalary');
}

class MaternityLeaveServiceStub {
  exemptResult: { exempt: boolean; reason?: string } = { exempt: false };

  isExemptForBonus(
    payDate: string,
    employee: Employee
  ): { exempt: boolean; reason?: string } {
    return this.exemptResult;
  }
}

describe('BonusCalculationService', () => {
  let service: BonusCalculationService;
  let bonusServiceStub: BonusServiceStub;
  let employeeEligibilityServiceStub: EmployeeEligibilityServiceStub;
  let salaryCalculationServiceStub: SalaryCalculationServiceStub;
  let maternityLeaveServiceStub: MaternityLeaveServiceStub;

  const rates = {
    health_employee: 0.04905,
    health_employer: 0.04905,
    care_employee: 0.0087,
    care_employer: 0.0087,
    pension_employee: 0.0915,
    pension_employer: 0.0915,
  };

  beforeEach(() => {
    bonusServiceStub = new BonusServiceStub();
    employeeEligibilityServiceStub = new EmployeeEligibilityServiceStub();
    salaryCalculationServiceStub = new SalaryCalculationServiceStub();
    maternityLeaveServiceStub = new MaternityLeaveServiceStub();

    TestBed.configureTestingModule({
      providers: [
        BonusCalculationService,
        { provide: BonusService, useValue: bonusServiceStub },
        {
          provide: EmployeeEligibilityService,
          useValue: employeeEligibilityServiceStub,
        },
        {
          provide: SalaryCalculationService,
          useValue: salaryCalculationServiceStub,
        },
        { provide: MaternityLeaveService, useValue: maternityLeaveServiceStub },
      ],
    });
    service = TestBed.inject(BonusCalculationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('1. 標準賞与額の丸め & 上限ロジック', () => {
    describe('1-1. calculateStandardBonus', () => {
      it('1000円未満切り捨てになっていること', () => {
        expect(service.calculateStandardBonus(100)).toBe(0);
        expect(service.calculateStandardBonus(999)).toBe(0);
        expect(service.calculateStandardBonus(1000)).toBe(1000);
        expect(service.calculateStandardBonus(123456)).toBe(123000);
        expect(service.calculateStandardBonus(123499)).toBe(123000);
        expect(service.calculateStandardBonus(123500)).toBe(123000);
      });
    });

    describe('1-2. applyBonusCaps', () => {
      it('厚年: 1回150万円上限', async () => {
        bonusServiceStub.bonusesForResult = [];
        const result = await service.applyBonusCaps(2000000, 'emp1', 2025);

        expect(result.cappedBonusPension).toBe(1500000);
        expect(result.reason_upper_limit_pension).toBe(true);
      });

      it('健保・介保: 年度累計573万円上限（既に5,680,000円支給済）', async () => {
        bonusServiceStub.bonusesForResult = [
          {
            amount: 5680000,
            employeeId: 'emp1',
            year: 2025,
            month: 1,
            payDate: '2025-01-15',
          } as unknown as Bonus,
        ];
        const result = await service.applyBonusCaps(100000, 'emp1', 2025);

        expect(result.cappedBonusHealth).toBe(50000);
        expect(result.reason_upper_limit_health).toBe(true);
      });

      it('上限に達していない場合はそのまま', async () => {
        bonusServiceStub.bonusesForResult = [];
        const result = await service.applyBonusCaps(1000000, 'emp1', 2025);

        expect(result.cappedBonusHealth).toBe(1000000);
        expect(result.cappedBonusPension).toBe(1000000);
        expect(result.reason_upper_limit_health).toBe(false);
        expect(result.reason_upper_limit_pension).toBe(false);
      });
    });
  });

  describe('2. 退職月 & 月末在籍ロジック', () => {
    describe('2-1. checkRetirement', () => {
      it('同月退職で、退職日 < 月末 → true（月末在籍なし）', () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1990-05-15',
          joinDate: '2024-01-01',
          retireDate: '2025-04-15',
          isShortTime: false,
        };
        const payDate = new Date('2025-04-20');
        const result = service.checkRetirement(employee, payDate, 2025, 4);

        expect(result).toBe(true);
      });

      it('同月退職で、退職日 = 月末 → false（月末在籍あり）', () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1990-05-15',
          joinDate: '2024-01-01',
          retireDate: '2025-04-30',
          isShortTime: false,
        };
        const payDate = new Date('2025-04-30');
        const result = service.checkRetirement(employee, payDate, 2025, 4);

        expect(result).toBe(false);
      });

      it('支給月と退職月が異なる場合 → false', () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1990-05-15',
          joinDate: '2024-01-01',
          retireDate: '2025-03-31',
          isShortTime: false,
        };
        const payDate = new Date('2025-04-20');
        const result = service.checkRetirement(employee, payDate, 2025, 4);

        expect(result).toBe(false);
      });
    });

    describe('2-2. calculateBonus 経由（退職月で月末在籍なし）', () => {
      it('退職月で月末在籍がない場合、全保険料が0円になる', async () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1990-05-15',
          joinDate: '2024-01-01',
          retireDate: '2025-04-15',
          isShortTime: false,
        };
        bonusServiceStub.bonusesLast12Months = [];
        bonusServiceStub.bonusesForResult = [];
        employeeEligibilityServiceStub.ageFlags = {
          isNoHealth: false,
          isNoPension: false,
          isCare1: false,
          isCare2: true,
        };
        maternityLeaveServiceStub.exemptResult = { exempt: false };

        const result = await service.calculateBonus(
          employee,
          'emp1',
          1000000,
          '2025-04-20',
          rates
        );
        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.healthEmployee).toBe(0);
        expect(result.careEmployee).toBe(0);
        expect(result.pensionEmployee).toBe(0);
        expect(result.reasons).toContain(
          jasmine.stringContaining('退職月の月末在籍が無いため賞与支払届は不要')
        );
        expect(result.requireReport).toBe(false);
      });
    });
  });

  describe('3. 産休・育休による免除', () => {
    describe('3-1. 産休中の賞与免除', () => {
      it('産休期間中は全保険料が0円になる', async () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1990-05-15',
          joinDate: '2024-01-01',
          isShortTime: false,
        };
        bonusServiceStub.bonusesLast12Months = [];
        bonusServiceStub.bonusesForResult = [];
        maternityLeaveServiceStub.exemptResult = {
          exempt: true,
          reason: '産前産後休業中の賞与免除',
        };
        employeeEligibilityServiceStub.ageFlags = {
          isNoHealth: false,
          isNoPension: false,
          isCare1: false,
          isCare2: true,
        };

        const result = await service.calculateBonus(
          employee,
          'emp1',
          1000000,
          '2025-07-15',
          rates
        );
        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.isExempted).toBe(true);
        expect(result.healthEmployee).toBe(0);
        expect(result.careEmployee).toBe(0);
        expect(result.pensionEmployee).toBe(0);
        expect(result.reasons).toContain(
          jasmine.stringContaining(
            '産前産後休業中のため、賞与保険料は免除されます'
          )
        );
      });
    });

    describe('3-2. 育休中（3条件満たす）で免除', () => {
      it('育休期間中で3条件を満たす場合、全保険料が0円になる', async () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1990-05-15',
          joinDate: '2024-01-01',
          childcareNotificationSubmitted: true,
          childcareLivingTogether: true,
          isShortTime: false,
        };
        bonusServiceStub.bonusesLast12Months = [];
        bonusServiceStub.bonusesForResult = [];
        maternityLeaveServiceStub.exemptResult = {
          exempt: true,
          reason: '育児休業中の賞与免除',
        };
        employeeEligibilityServiceStub.ageFlags = {
          isNoHealth: false,
          isNoPension: false,
          isCare1: false,
          isCare2: true,
        };

        const result = await service.calculateBonus(
          employee,
          'emp1',
          1000000,
          '2025-10-15',
          rates
        );
        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.isExempted).toBe(true);
        expect(result.healthEmployee).toBe(0);
        expect(result.careEmployee).toBe(0);
        expect(result.pensionEmployee).toBe(0);
        expect(result.reasons).toContain(
          jasmine.stringContaining('育児休業中のため、賞与保険料は免除されます')
        );
      });
    });

    describe('3-3. 育休中だが条件不足で免除されない', () => {
      it('育休期間中でも届出未提出の場合は免除されない', async () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1990-05-15',
          joinDate: '2024-01-01',
          childcareNotificationSubmitted: false,
          childcareLivingTogether: true,
          isShortTime: false,
        };
        bonusServiceStub.bonusesLast12Months = [];
        bonusServiceStub.bonusesForResult = [];
        maternityLeaveServiceStub.exemptResult = {
          exempt: true,
          reason: '育児休業中（健康保険・厚生年金本人分免除）',
        };
        employeeEligibilityServiceStub.ageFlags = {
          isNoHealth: false,
          isNoPension: false,
          isCare1: false,
          isCare2: true,
        };

        const result = await service.calculateBonus(
          employee,
          'emp1',
          1000000,
          '2025-10-15',
          rates
        );
        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.isExempted).toBe(false);
        expect(result.exemptReason).toContain('届出未提出');
        const expectedHealthBase = 1000000;
        expect(result.healthEmployee).toBeGreaterThan(0);
        expect(result.pensionEmployee).toBeGreaterThan(0);
      });
    });
  });

  describe('4. 年齢到達による停止（AgeFlags 経由）', () => {
    describe('4-1. 70歳以上 → 厚生年金0円', () => {
      it('70歳以上では厚生年金保険料が0円になる', async () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1955-05-01',
          joinDate: '2024-01-01',
          isShortTime: false,
        };
        bonusServiceStub.bonusesLast12Months = [];
        bonusServiceStub.bonusesForResult = [];
        employeeEligibilityServiceStub.ageFlags = {
          isNoHealth: false,
          isNoPension: true,
          isCare1: false,
          isCare2: true,
        };
        maternityLeaveServiceStub.exemptResult = { exempt: false };

        const result = await service.calculateBonus(
          employee,
          'emp1',
          1000000,
          '2025-05-15',
          rates
        );
        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.pensionEmployee).toBe(0);
        expect(result.pensionEmployer).toBe(0);
        expect(result.healthEmployee).toBeGreaterThan(0);
        expect(result.careEmployee).toBeGreaterThan(0);
      });
    });

    describe('4-2. 75歳以上 → 健保・介保0円', () => {
      it('75歳以上では健保・介保・厚年すべて0円になる', async () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1950-05-01',
          joinDate: '2024-01-01',
          isShortTime: false,
        };
        bonusServiceStub.bonusesLast12Months = [];
        bonusServiceStub.bonusesForResult = [];
        employeeEligibilityServiceStub.ageFlags = {
          isNoHealth: true,
          isNoPension: true,
          isCare1: false,
          isCare2: false,
        };
        maternityLeaveServiceStub.exemptResult = { exempt: false };

        const result = await service.calculateBonus(
          employee,
          'emp1',
          1000000,
          '2025-05-15',
          rates
        );
        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.healthEmployee).toBe(0);
        expect(result.careEmployee).toBe(0);
        expect(result.pensionEmployee).toBe(0);
        expect(result.reasons).toContain(
          jasmine.stringContaining(
            '75歳到達月のため健保・介保の賞与保険料は停止されます'
          )
        );
      });
    });
  });

  describe('5. 賞与 → 給与扱い（3回ルール）', () => {
    describe('5-1. 過去12ヶ月で3回以内 → 賞与扱い', () => {
      it('3回以内の場合は賞与扱い', async () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1990-05-15',
          joinDate: '2024-01-01',
          isShortTime: false,
        };
        bonusServiceStub.bonusesLast12Months = [
          {
            amount: 1000000,
            employeeId: 'emp1',
            year: 2025,
            month: 1,
            payDate: '2025-01-15',
          } as unknown as Bonus,
          {
            amount: 1000000,
            employeeId: 'emp1',
            year: 2025,
            month: 4,
            payDate: '2025-04-15',
          } as unknown as Bonus,
          {
            amount: 1000000,
            employeeId: 'emp1',
            year: 2025,
            month: 6,
            payDate: '2025-06-15',
          } as unknown as Bonus,
        ];
        bonusServiceStub.bonusesForResult = [];
        employeeEligibilityServiceStub.ageFlags = {
          isNoHealth: false,
          isNoPension: false,
          isCare1: false,
          isCare2: true,
        };
        maternityLeaveServiceStub.exemptResult = { exempt: false };

        const result = await service.calculateBonus(
          employee,
          'emp1',
          1000000,
          '2025-07-15',
          rates
        );
        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.isSalaryInsteadOfBonus).toBe(false);
        expect(result.salaryInsteadReasons).toContain(
          jasmine.stringContaining(
            '過去12ヶ月の賞与支給回数が3回（3回以内）のため賞与扱い'
          )
        );
        expect(
          salaryCalculationServiceStub.addBonusAsSalary
        ).not.toHaveBeenCalled();
      });
    });

    describe('5-2. 過去12ヶ月で4回以上 → 給与扱い', () => {
      it('4回以上の場合は給与扱い', async () => {
        const employee: Employee = {
          id: 'emp1',
          name: 'テスト従業員',
          birthDate: '1990-05-15',
          joinDate: '2024-01-01',
          isShortTime: false,
        };
        bonusServiceStub.bonusesLast12Months = [
          {
            amount: 1000000,
            employeeId: 'emp1',
            year: 2025,
            month: 1,
            payDate: '2025-01-15',
          } as unknown as Bonus,
          {
            amount: 1000000,
            employeeId: 'emp1',
            year: 2025,
            month: 4,
            payDate: '2025-04-15',
          } as unknown as Bonus,
          {
            amount: 1000000,
            employeeId: 'emp1',
            year: 2025,
            month: 6,
            payDate: '2025-06-15',
          } as unknown as Bonus,
          {
            amount: 1000000,
            employeeId: 'emp1',
            year: 2025,
            month: 7,
            payDate: '2025-07-15',
          } as unknown as Bonus,
        ];
        bonusServiceStub.bonusesForResult = [];
        employeeEligibilityServiceStub.ageFlags = {
          isNoHealth: false,
          isNoPension: false,
          isCare1: false,
          isCare2: true,
        };
        maternityLeaveServiceStub.exemptResult = { exempt: false };
        salaryCalculationServiceStub.addBonusAsSalary.calls.reset();

        const result = await service.calculateBonus(
          employee,
          'emp1',
          1000000,
          '2025-08-15',
          rates
        );
        expect(result).not.toBeNull();
        if (!result) return;

        expect(result.isSalaryInsteadOfBonus).toBe(true);
        expect(result.salaryInsteadReasons).toContain(
          jasmine.stringContaining('4回以上')
        );
        expect(result.healthEmployee).toBe(0);
        expect(result.pensionEmployee).toBe(0);
        expect(
          salaryCalculationServiceStub.addBonusAsSalary
        ).toHaveBeenCalledWith('emp1', 2025, 8, 1000000);
        expect(result.requireReport).toBe(false);
      });
    });
  });

  describe('6. calculatePremiums 単体の挙動', () => {
    it('ageFlags.isNoHealth=false, isNoPension=false, isCare2=true のケース', () => {
      const ageFlags: AgeFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: false,
        isCare2: true,
      };
      const result = service.calculatePremiums(
        1000000,
        1000000,
        40,
        ageFlags,
        rates
      );

      expect(result.healthEmployee).toBe(
        Math.floor(1000000 * rates.health_employee)
      );
      expect(result.careEmployee).toBe(
        Math.floor(1000000 * rates.care_employee)
      );
      expect(result.pensionEmployee).toBe(
        Math.floor(1000000 * rates.pension_employee)
      );
    });

    it('isNoHealth=true → health/care が 0 になる', () => {
      const ageFlags: AgeFlags = {
        isNoHealth: true,
        isNoPension: false,
        isCare1: false,
        isCare2: false,
      };
      const result = service.calculatePremiums(
        1000000,
        1000000,
        75,
        ageFlags,
        rates
      );

      expect(result.healthEmployee).toBe(0);
      expect(result.careEmployee).toBe(0);
      expect(result.pensionEmployee).toBeGreaterThan(0);
    });

    it('isNoPension=true → pension が 0 になる', () => {
      const ageFlags: AgeFlags = {
        isNoHealth: false,
        isNoPension: true,
        isCare1: false,
        isCare2: true,
      };
      const result = service.calculatePremiums(
        1000000,
        1000000,
        70,
        ageFlags,
        rates
      );

      expect(result.pensionEmployee).toBe(0);
      expect(result.healthEmployee).toBeGreaterThan(0);
    });

    it('65歳以上（isCare2=false）→ 健康保険料に介護保険分の料率が含まれない', () => {
      const ageFlags: AgeFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: true, // 65歳以上
        isCare2: false, // 40〜64歳ではない
      };
      const result = service.calculatePremiums(
        1000000,
        1000000,
        65,
        ageFlags,
        rates
      );

      // 健康保険料は健康保険料率のみ（介護保険料率を含まない）
      const expectedHealthEmployee = Math.floor(
        (1000000 * rates.health_employee) / 2
      );
      expect(result.healthEmployee).toBe(expectedHealthEmployee);

      // 介護保険は健康保険に含まれないため、個別の値は0
      expect(result.careEmployee).toBe(0);
    });

    it('69歳（isCare2=false）→ 健康保険料に介護保険分の料率が含まれない', () => {
      const ageFlags: AgeFlags = {
        isNoHealth: false,
        isNoPension: false,
        isCare1: true, // 65歳以上
        isCare2: false, // 40〜64歳ではない（69歳なのでfalse）
      };
      const result = service.calculatePremiums(
        1000000,
        1000000,
        69,
        ageFlags,
        rates
      );

      // 健康保険料は健康保険料率のみ（介護保険料率を含まない）
      // 標準賞与額 × 健康保険料率 / 2（折半）
      const expectedHealthEmployee = Math.floor(
        (1000000 * rates.health_employee) / 2
      );
      expect(result.healthEmployee).toBe(expectedHealthEmployee);

      // 介護保険料率を含まないことを確認
      // もし介護保険料率が含まれていれば、以下の値より大きくなるはず
      const incorrectHealthEmployee = Math.floor(
        (1000000 * (rates.health_employee + rates.care_employee)) / 2
      );
      expect(result.healthEmployee).not.toBe(incorrectHealthEmployee);
      expect(result.healthEmployee).toBeLessThan(incorrectHealthEmployee);

      // 介護保険は健康保険に含まれないため、個別の値は0
      expect(result.careEmployee).toBe(0);
    });
  });

  describe('7. buildReasons / determineReportRequirement / checkReportRequired', () => {
    describe('7-1. buildReasons', () => {
      it('各フラグを true にしたとき、それぞれの文言が reasons に含まれること', () => {
        const reasons = service.buildReasons(
          true,
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          1000000,
          1000000,
          1000000
        );
        expect(reasons).toContain(
          jasmine.stringContaining(
            '産前産後休業中のため、賞与保険料は免除されます'
          )
        );

        const reasons2 = service.buildReasons(
          false,
          true,
          false,
          false,
          false,
          false,
          false,
          false,
          1000000,
          1000000,
          1000000
        );
        expect(reasons2).toContain(
          jasmine.stringContaining('育児休業中のため、賞与保険料は免除されます')
        );

        const reasons3 = service.buildReasons(
          false,
          false,
          true,
          false,
          false,
          false,
          false,
          false,
          1000000,
          1000000,
          1000000
        );
        expect(reasons3).toContain(
          jasmine.stringContaining('退職日の関係で月末在籍がないため')
        );

        const reasons4 = service.buildReasons(
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          false,
          1000000,
          1000000,
          1000000
        );
        expect(reasons4).toContain(
          jasmine.stringContaining(
            '70歳到達月のため厚生年金の賞与保険料は停止されます'
          )
        );

        const reasons5 = service.buildReasons(
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          1000000,
          1000000,
          1000000
        );
        expect(reasons5).toContain(
          jasmine.stringContaining(
            '75歳到達月のため健保・介保の賞与保険料は停止されます'
          )
        );

        const reasons6 = service.buildReasons(
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          1000000,
          1000000,
          1000000
        );
        expect(reasons6).toContain(
          jasmine.stringContaining(
            '過去1年間の賞与支給回数が3回を超えているため'
          )
        );

        const reasons7 = service.buildReasons(
          false,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          2000000,
          1500000,
          1500000
        );
        expect(reasons7).toContain(
          jasmine.stringContaining(
            '健保・介保の年度上限（573万円）を適用しました'
          )
        );

        const reasons8 = service.buildReasons(
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          true,
          2000000,
          2000000,
          1500000
        );
        expect(reasons8).toContain(
          jasmine.stringContaining(
            '厚生年金の1回あたり上限（150万円）を適用しました'
          )
        );
      });
    });

    describe('7-2. determineReportRequirement', () => {
      it('退職月月末在籍なし → requireReport=false', () => {
        const payDate = new Date('2025-04-20');
        const result = service.determineReportRequirement(
          true,
          false,
          false,
          false,
          false,
          false,
          payDate
        );

        expect(result.requireReport).toBe(false);
        expect(result.reportReason).toContain(
          '退職月の月末在籍が無いため賞与支払届は不要'
        );
      });

      it('産休/育休免除 → requireReport=false', () => {
        const payDate = new Date('2025-07-15');
        const result = service.determineReportRequirement(
          false,
          true,
          true,
          false,
          false,
          false,
          payDate
        );

        expect(result.requireReport).toBe(false);
        expect(result.reportReason).toContain(
          '産前産後休業中の賞与は免除対象のため賞与支払届は不要です'
        );
      });

      it('75歳以上 → requireReport=false', () => {
        const payDate = new Date('2025-05-15');
        const result = service.determineReportRequirement(
          false,
          false,
          false,
          false,
          true,
          false,
          payDate
        );

        expect(result.requireReport).toBe(false);
        expect(result.reportReason).toContain(
          '75歳到達月で健康保険・介護保険の資格喪失のため賞与支払届は不要です'
        );
      });

      it('給与扱い → requireReport=false', () => {
        const payDate = new Date('2025-08-15');
        const result = service.determineReportRequirement(
          false,
          false,
          false,
          false,
          false,
          true,
          payDate
        );

        expect(result.requireReport).toBe(false);
        expect(result.reportReason).toContain(
          '年度内4回目以降の賞与は給与扱いとなるため賞与支払届は不要です'
        );
      });

      it('通常ケース → requireReport=true かつ reportDeadline が payDate+5日', () => {
        const payDate = new Date('2025-06-15');
        const result = service.determineReportRequirement(
          false,
          false,
          false,
          false,
          false,
          false,
          payDate
        );

        expect(result.requireReport).toBe(true);
        expect(result.reportReason).toContain(
          '支給された賞与は社会保険の対象となるため、賞与支払届が必要です'
        );
        const expectedDeadline = new Date(payDate);
        expectedDeadline.setDate(expectedDeadline.getDate() + 5);
        expect(result.reportDeadline).toBe(
          expectedDeadline.toISOString().split('T')[0]
        );
      });
    });

    describe('7-3. checkReportRequired', () => {
      it('standardBonus < 1000 → false', () => {
        expect(service.checkReportRequired(999, false)).toBe(false);
      });

      it('isRetiredNoLastDay=true → false', () => {
        expect(service.checkReportRequired(1000000, true)).toBe(false);
      });

      it('それ以外 → true', () => {
        expect(service.checkReportRequired(1000000, false)).toBe(true);
      });
    });
  });

  describe('8. エラーチェック（checkErrors）', () => {
    it('支給日が入社前の場合', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-05-15',
        joinDate: '2025-01-01',
        isShortTime: false,
      };
      const payDate = new Date('2024-12-15');
      const result = service.checkErrors(
        employee,
        payDate,
        35,
        false,
        false,
        false,
        false,
        0,
        0,
        0,
        1,
        1
      );

      expect(result.errorMessages).toContain(
        '支給日が在籍期間外です（入社前）'
      );
    });

    it('支給日が退職後の場合', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        retireDate: '2025-03-31',
        isShortTime: false,
      };
      const payDate = new Date('2025-04-15');
      const result = service.checkErrors(
        employee,
        payDate,
        35,
        false,
        false,
        false,
        false,
        0,
        0,
        0,
        1,
        1
      );

      expect(result.errorMessages).toContain(
        '支給日が在籍期間外です（退職後）'
      );
    });

    it('70歳以上なのに isOverAge70=false かつ pensionEmployee > 0 のケース', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1955-05-01',
        joinDate: '2024-01-01',
        isShortTime: false,
      };
      const payDate = new Date('2025-05-15');
      const result = service.checkErrors(
        employee,
        payDate,
        70,
        false,
        false,
        false,
        false,
        10000,
        0,
        0,
        1,
        1
      );

      expect(result.errorMessages).toContain(
        '70歳以上は厚生年金保険料は発生しません'
      );
    });

    it('75歳以上なのに isOverAge75=false かつ health/care > 0 のケース', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1950-05-01',
        joinDate: '2024-01-01',
        isShortTime: false,
      };
      const payDate = new Date('2025-05-15');
      const result = service.checkErrors(
        employee,
        payDate,
        75,
        false,
        false,
        false,
        false,
        0,
        10000,
        10000,
        1,
        1
      );

      expect(result.errorMessages).toContain(
        '75歳以上は健康保険・介護保険は発生しません'
      );
    });

    it('賞与回数ロジックの矛盾', () => {
      const employee: Employee = {
        id: 'emp1',
        name: 'テスト従業員',
        birthDate: '1990-05-15',
        joinDate: '2024-01-01',
        isShortTime: false,
      };
      const payDate = new Date('2025-07-15');
      const result = service.checkErrors(
        employee,
        payDate,
        35,
        false,
        false,
        false,
        false,
        0,
        0,
        0,
        5,
        3
      );

      expect(result.errorMessages).toContain(
        '賞与の支給回数ロジックに矛盾があります'
      );
    });
  });
});
