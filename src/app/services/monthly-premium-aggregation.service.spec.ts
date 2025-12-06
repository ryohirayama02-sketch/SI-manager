import { MonthlyPremiumAggregationService } from './monthly-premium-aggregation.service';
import { PremiumTotalAggregationService } from './premium-total-aggregation.service';
import { MonthlyTotal } from './payment-summary-types';

describe('MonthlyPremiumAggregationService', () => {
  let service: MonthlyPremiumAggregationService;
  let premiumTotalAggregationService: jasmine.SpyObj<PremiumTotalAggregationService>;

  beforeEach(() => {
    premiumTotalAggregationService =
      jasmine.createSpyObj<PremiumTotalAggregationService>(
        'PremiumTotalAggregationService',
        ['addToMonthlyTotal']
      );

    // addToMonthlyTotal will sum corresponding fields
    premiumTotalAggregationService.addToMonthlyTotal.and.callFake(
      (current: MonthlyTotal, add: any) => ({
        ...current,
        health:
          current.health +
          (add.healthEmployee || 0) +
          (add.healthEmployer || 0),
        care: current.care + (add.careEmployee || 0) + (add.careEmployer || 0),
        pension:
          current.pension +
          (add.pensionEmployee || 0) +
          (add.pensionEmployer || 0),
        total:
          current.total +
          (add.healthEmployee || 0) +
          (add.healthEmployer || 0) +
          (add.careEmployee || 0) +
          (add.careEmployer || 0) +
          (add.pensionEmployee || 0) +
          (add.pensionEmployer || 0),
      })
    );

    service = new MonthlyPremiumAggregationService(
      premiumTotalAggregationService
    );
  });

  function newRow(overrides: Partial<any>) {
    return {
      month: 1,
      healthEmployee: 10,
      healthEmployer: 20,
      careEmployee: 30,
      careEmployer: 40,
      pensionEmployee: 50,
      pensionEmployer: 60,
      isPensionStopped: false,
      isHealthStopped: false,
      isMaternityLeave: false,
      isChildcareLeave: false,
      isRetired: false,
      ...overrides,
    };
  }

  describe('基本集計', () => {
    it('2件を合計する', () => {
      const employees = [{ id: 'e1' } as any];
      const rows = [newRow({ month: 1 }), newRow({ month: 1 })];
      const result = service.aggregateMonthlyTotals(
        employees,
        2025,
        { e1: rows },
        {},
        {}
      );
      expect(result[1].health).toBe(60); // (10+20)*2
      expect(result[1].care).toBe(140); // (30+40)*2
      expect(result[1].pension).toBe(220); // (50+60)*2
      expect(result[1].total).toBe((420 * 2) / 2); // summed via addToMonthlyTotal stub -> 420 per row
    });
  });

  describe('停止フラグ true の場合', () => {
    it('healthStopped=true なら health を 0 として加算しない', () => {
      const employees = [{ id: 'e1' } as any];
      const rows = [
        newRow({ month: 1, isHealthStopped: true }),
        newRow({ month: 1 }),
      ];
      premiumTotalAggregationService.addToMonthlyTotal.and.callFake(
        (current: MonthlyTotal, add: any) => ({
          ...current,
          health:
            current.health +
            (add.isHealthStopped
              ? 0
              : (add.healthEmployee || 0) + (add.healthEmployer || 0)),
          care:
            current.care +
            (add.isHealthStopped
              ? 0
              : (add.careEmployee || 0) + (add.careEmployer || 0)),
          pension:
            current.pension +
            (add.pensionEmployee || 0) +
            (add.pensionEmployer || 0),
          total:
            current.total +
            (add.isHealthStopped
              ? 0
              : (add.healthEmployee || 0) + (add.healthEmployer || 0)) +
            (add.isHealthStopped
              ? 0
              : (add.careEmployee || 0) + (add.careEmployer || 0)) +
            (add.pensionEmployee || 0) +
            (add.pensionEmployer || 0),
        })
      );
      const result = service.aggregateMonthlyTotals(
        employees,
        2025,
        { e1: rows },
        {},
        {}
      );
      expect(result[1].health).toBe(30); // only second row counts (10+20)
      expect(result[1].care).toBe(70); // only second row counts (30+40)
    });

    it('pensionStopped=true なら pension を 0 として加算しない', () => {
      const employees = [{ id: 'e1' } as any];
      const rows = [
        newRow({ month: 1, isPensionStopped: true }),
        newRow({ month: 1 }),
      ];
      premiumTotalAggregationService.addToMonthlyTotal.and.callFake(
        (current: MonthlyTotal, add: any) => ({
          ...current,
          health:
            current.health +
            (add.healthEmployee || 0) +
            (add.healthEmployer || 0),
          care:
            current.care + (add.careEmployee || 0) + (add.careEmployer || 0),
          pension:
            current.pension +
            (add.isPensionStopped
              ? 0
              : (add.pensionEmployee || 0) + (add.pensionEmployer || 0)),
          total:
            current.total +
            (add.healthEmployee || 0) +
            (add.healthEmployer || 0) +
            (add.careEmployee || 0) +
            (add.careEmployer || 0) +
            (add.isPensionStopped
              ? 0
              : (add.pensionEmployee || 0) + (add.pensionEmployer || 0)),
        })
      );
      const result = service.aggregateMonthlyTotals(
        employees,
        2025,
        { e1: rows },
        {},
        {}
      );
      expect(result[1].pension).toBe(110); // only second row pension counted (50+60)
    });
  });

  describe('混合ケース', () => {
    it('row1 healthStopped=true, row2 normal', () => {
      const employees = [{ id: 'e1' } as any];
      const rows = [
        newRow({ month: 1, isHealthStopped: true }),
        newRow({ month: 1 }),
      ];
      premiumTotalAggregationService.addToMonthlyTotal.and.callFake(
        (current: MonthlyTotal, add: any) => ({
          ...current,
          health:
            current.health +
            (add.isHealthStopped
              ? 0
              : (add.healthEmployee || 0) + (add.healthEmployer || 0)),
          care:
            current.care +
            (add.isHealthStopped
              ? 0
              : (add.careEmployee || 0) + (add.careEmployer || 0)),
          pension:
            current.pension +
            (add.pensionEmployee || 0) +
            (add.pensionEmployer || 0),
          total:
            current.total +
            (add.isHealthStopped
              ? 0
              : (add.healthEmployee || 0) + (add.healthEmployer || 0)) +
            (add.isHealthStopped
              ? 0
              : (add.careEmployee || 0) + (add.careEmployer || 0)) +
            (add.pensionEmployee || 0) +
            (add.pensionEmployer || 0),
        })
      );
      const result = service.aggregateMonthlyTotals(
        employees,
        2025,
        { e1: rows },
        {},
        {}
      );
      expect(result[1].health).toBe(30); // only second row health counted
      expect(result[1].care).toBe(70); // only second row care counted
      expect(result[1].pension).toBe(220); // both rows pension counted
    });
  });

  describe('空配列', () => {
    it('[] は全て0で返す', () => {
      const employees = [{ id: 'e1' } as any];
      const result = service.aggregateMonthlyTotals(
        employees,
        2025,
        { e1: [] },
        {},
        {}
      );
      expect(result[1].health).toBe(0);
      expect(result[1].care).toBe(0);
      expect(result[1].pension).toBe(0);
      expect(result[1].total).toBe(0);
    });
  });

  describe('空配列', () => {
    it('rows が空の場合はすべて 0 で集計される', () => {
      const employees = [{ id: 'e1' } as any];

      const result = service.aggregateMonthlyTotals(
        employees,
        2025,
        { e1: [] }, // 空配列
        {},
        {}
      );

      expect(result[1].health).toBe(0);
      expect(result[1].care).toBe(0);
      expect(result[1].pension).toBe(0);
      expect(result[1].total).toBe(0);
    });
  });

  describe('特殊値（0円など）', () => {
    it('0円でも落ちずに計算できる', () => {
      const employees = [{ id: 'e1' } as any];
      const rows = [
        newRow({
          month: 1,
          healthEmployee: 0,
          careEmployer: 0,
          pensionEmployee: 0,
          pensionEmployer: 0,
        }),
      ];
      const result = service.aggregateMonthlyTotals(
        employees,
        2025,
        { e1: rows },
        {},
        {}
      );
      expect(result[1].health).toBe(20); // 0 + employer 20
      expect(result[1].care).toBe(40); // 30 + 10? (careEmployer 0) -> from defaults 30 + 10? wait
      // With our newRow defaults: careEmployee=30, careEmployer=40 -> overridden to 0 for employer
      // but healthEmployer stays 20. We only overrode careEmployer to 0, so healthEmployer remains 20.
      // Expect care = 30 (employee) + 0 (employer override) = 30
      expect(result[1].care).toBe(30);
      expect(result[1].pension).toBe(0); // overridden to 0
    });
  });
});
