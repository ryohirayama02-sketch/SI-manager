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
        const totalSalary =
          (monthSalaryData?.totalSalary ?? monthSalaryData?.total ?? 0) ||
          (monthSalaryData?.fixedSalary ?? monthSalaryData?.fixed ?? 0) +
            (monthSalaryData?.variableSalary ?? monthSalaryData?.variable ?? 0);

        const employeeTotalPremium =
          premiumRow.healthEmployee +
          premiumRow.careEmployee +
          premiumRow.pensionEmployee;

        console.log(
          `[徴収不能チェック] ${emp.name} (${year}年${month}月) [payment-summary]:`,
          {
            totalSalary,
            employeeTotalPremium,
            exempt: premiumRow.exempt,
            monthSalaryData: monthSalaryData
              ? {
                  totalSalary: monthSalaryData.totalSalary,
                  total: monthSalaryData.total,
                  fixed: monthSalaryData.fixed,
                  variable: monthSalaryData.variable,
                }
              : null,
          }
        );

        // 産休・育休中でない場合のみチェック（給与が0円でもチェック）
        if (!premiumRow.exempt) {
          console.log(
            `[徴収不能チェック] ${emp.name} (${year}年${month}月) [payment-summary]: 産休・育休ではないためチェック実行`
          );
          await this.uncollectedPremiumService.saveUncollectedPremium(
            emp.id,
            year,
            month,
            totalSalary,
            employeeTotalPremium
          );
        } else {
          console.log(
            `[徴収不能チェック] ${emp.name} (${year}年${month}月) [payment-summary]: 産休・育休中のためスキップ`
          );
        }
      } else {
        console.log(
          `[徴収不能チェック] ${emp.name} (${year}年${month}月) [payment-summary]: 給与データなし`
        );
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

    // 賞与保険料を月次給与の保険料に加算
    this.bonusPremiumCalculationService.addBonusPremiumsToMonthly(
      emp,
      year,
      employeeBonuses,
      monthlyPremiumRows,
      monthlyPremiums,
      ageCache
    );

    return {
      monthlyPremiumRows,
      monthlyPremiums,
    };
  }
}
