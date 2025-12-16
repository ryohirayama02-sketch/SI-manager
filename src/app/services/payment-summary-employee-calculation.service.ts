import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import { MonthlyPremiumCalculationService } from './monthly-premium-calculation.service';
import { BonusPremiumCalculationService } from './bonus-premium-calculation.service';
import { PremiumValidationService } from './premium-validation.service';
import { UncollectedPremiumService } from './uncollected-premium.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { MonthlyPremiumRow } from './payment-summary-types';
import { RoomIdService } from './room-id.service';

/**
 * PaymentSummaryEmployeeCalculationService
 *
 * 保険料サマリー計算の従業員ごとの計算を担当するサービス
 * 月次保険料計算、資格取得時決定情報追加、年齢関連バリデーション、賞与保険料加算を提供
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryEmployeeCalculationService {
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private monthlyPremiumCalculationService: MonthlyPremiumCalculationService,
    private bonusPremiumCalculationService: BonusPremiumCalculationService,
    private premiumValidationService: PremiumValidationService,
    private uncollectedPremiumService: UncollectedPremiumService,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 従業員の月次保険料を計算
   */
  async calculateEmployeePremiums(
    emp: Employee,
    year: number,
    gradeTable: any[],
    rates: any,
    salaryDataByEmployeeId: { [employeeId: string]: any } | undefined,
    employeeBonuses: Bonus[],
    ageCache: { [month: number]: number },
    errorMessages: { [employeeId: string]: string[] },
    prefecture?: string
  ): Promise<{
    monthlyPremiumRows: MonthlyPremiumRow[];
    monthlyPremiums: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      };
    };
  }> {
    // 給与データを取得
    let salaryData = salaryDataByEmployeeId?.[emp.id];
    if (!salaryData) {
      const roomId = (emp as any).roomId || this.roomIdService.requireRoomId();
      const monthMap: any = {};
      for (let month = 1; month <= 12; month++) {
        const monthData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          emp.id,
          year,
          month
        );
        if (monthData) {
          monthMap[month.toString()] = monthData;
        }
      }
      salaryData = monthMap;
    }

    // 月次保険料一覧を計算
    const monthlyPremiumRows: MonthlyPremiumRow[] = [];
    const monthlyPremiums: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      };
    } = {};

    // 1〜12月分の月次保険料を計算
    for (let month = 1; month <= 12; month++) {
      const premiumRow =
        await this.monthlyPremiumCalculationService.calculateEmployeeMonthlyPremiums(
          emp,
          year,
          month,
          salaryData,
          gradeTable,
          rates,
          prefecture
        );
      monthlyPremiumRows.push(premiumRow);
      monthlyPremiums[month] = {
        healthEmployee: premiumRow.healthEmployee,
        healthEmployer: premiumRow.healthEmployer,
        careEmployee: premiumRow.careEmployee,
        careEmployer: premiumRow.careEmployer,
        pensionEmployee: premiumRow.pensionEmployee,
        pensionEmployer: premiumRow.pensionEmployer,
      };

      // 徴収不能額のチェック（monthly-premium-calculation.service内で実行されるが、
      // 念のためここでも確認。ただし、給与データがない場合はスキップ）
      // 注意: 給与が0円でも、標準報酬月額が確定していれば保険料が発生するため、チェックが必要
      if (salaryData) {
        const monthKeyString = month.toString();
        const monthSalaryData = salaryData[monthKeyString];
        // totalSalaryまたはtotalが存在する場合はそれを使用（既に欠勤控除を引いた値）
        // 存在しない場合は、fixedSalary + variableSalaryから計算（欠勤控除は既に引かれている可能性がある）
        const monthlyTotalSalary =
          (monthSalaryData?.totalSalary ?? monthSalaryData?.total ?? 0) ||
          (monthSalaryData?.fixedSalary ?? monthSalaryData?.fixed ?? 0) +
            (monthSalaryData?.variableSalary ?? monthSalaryData?.variable ?? 0);

        // 月次給与の本人負担保険料
        let employeeTotalPremium =
          premiumRow.healthEmployee +
          premiumRow.careEmployee +
          premiumRow.pensionEmployee;

        // その月の賞与の本人負担保険料を加算（同じ月に複数の賞与がある場合は合算）
        const monthBonuses = employeeBonuses.filter((bonus) => {
          if (!bonus.payDate) return false;
          const payDateObj = new Date(bonus.payDate);
          const payYear = payDateObj.getFullYear();
          const payMonth = payDateObj.getMonth() + 1;
          return (
            payYear === year &&
            payMonth === month &&
            !bonus.isExempted &&
            !bonus.isSalaryInsteadOfBonus
          );
        });

        // 月次給与の総支給額に賞与の金額も加算
        let totalSalary = monthlyTotalSalary;
        if (monthBonuses.length > 0) {
          // 同じ月のすべての賞与の金額を合算
          const totalBonusAmount = monthBonuses.reduce(
            (sum, b) => sum + (b.amount || 0),
            0
          );
          totalSalary += totalBonusAmount;

          // 同じ月のすべての賞与の保険料を合算
          const totalBonusPremium = monthBonuses.reduce((sum, bonus) => {
            return (
              sum +
              (bonus.healthEmployee || 0) +
              (bonus.careEmployee || 0) +
              (bonus.pensionEmployee || 0)
            );
          }, 0);
          employeeTotalPremium += totalBonusPremium;
        }

        // 産休・育休中でない場合のみチェック（給与が0円でもチェック）
        if (!premiumRow.exempt) {
          await this.uncollectedPremiumService.saveUncollectedPremium(
            emp.id,
            year,
            month,
            totalSalary,
            employeeTotalPremium
          );
        }
      }
    }

    // 資格取得時決定の情報を追加
    if (salaryData) {
      await this.monthlyPremiumCalculationService.addAcquisitionInfo(
        emp,
        year,
        salaryData,
        gradeTable,
        monthlyPremiumRows
      );
    }

    // 年齢関連の矛盾チェック
    if (salaryData) {
      this.premiumValidationService.validateAgeRelatedErrors(
        emp,
        monthlyPremiums,
        errorMessages,
        year,
        ageCache
      );
    }

    return {
      monthlyPremiumRows,
      monthlyPremiums,
    };
  }
}
