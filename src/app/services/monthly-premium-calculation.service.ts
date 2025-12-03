import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import { SalaryCalculationService, ShikakuShutokuResult } from './salary-calculation.service';
import { NotificationDecisionService } from './notification-decision.service';
import { MonthHelperService } from './month-helper.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { SettingsService } from './settings.service';
import { UncollectedPremiumService } from './uncollected-premium.service';
import { Employee } from '../models/employee.model';
import { MonthlyPremiumRow } from './payment-summary-calculation.service';

/**
 * MonthlyPremiumCalculationService
 * 
 * 月次保険料計算を担当するサービス
 * 従業員ごとの月次給与から保険料を計算し、資格取得時決定の情報を追加
 */
@Injectable({ providedIn: 'root' })
export class MonthlyPremiumCalculationService {
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private salaryCalculationService: SalaryCalculationService,
    private notificationDecisionService: NotificationDecisionService,
    private monthHelper: MonthHelperService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private settingsService: SettingsService,
    private uncollectedPremiumService: UncollectedPremiumService
  ) {}

  /**
   * 従業員の月次保険料を計算
   */
  async calculateEmployeeMonthlyPremiums(
    emp: Employee,
    year: number,
    month: number,
    salaryData: any,
    gradeTable: any[],
    rates: any,
    prefecture?: string
  ): Promise<MonthlyPremiumRow> {
    // 産休・育休判定（月単位：1日でも含まれれば免除）
    const maternityLeave = this.employeeLifecycleService.isMaternityLeave(emp, year, month);
    const childcareLeave = this.employeeLifecycleService.isChildcareLeave(emp, year, month);
    const isExempt = maternityLeave || childcareLeave;
    
    // 産休・育休中は無条件で0円（給与データの有無に関わらず）
    if (isExempt) {
      return {
        month,
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        exempt: true,
        notes: [maternityLeave ? '産前産後休業中' : '育児休業中'],
      };
    }

    // 給与データがある場合のみ通常の計算を実行
    if (salaryData) {
      const monthKeyString = month.toString();
      const monthSalaryData = salaryData[monthKeyString];
      const fixedSalary =
        monthSalaryData?.fixedSalary ?? monthSalaryData?.fixed ?? 0;
      const variableSalary =
        monthSalaryData?.variableSalary ?? monthSalaryData?.variable ?? 0;

      // 年度料率の改定月ロジック：月ごとに料率を取得
      let monthRates = rates;
      if (prefecture) {
        const monthRatesResult = await this.settingsService.getRates(
          year.toString(),
          prefecture,
          month.toString()
        );
        if (monthRatesResult) {
          monthRates = monthRatesResult;
        }
      }

      // calculateMonthlyPremiums を呼び出し
      const premiumResult =
        await this.salaryCalculationService.calculateMonthlyPremiums(
          emp,
          year,
          month,
          fixedSalary,
          variableSalary,
          gradeTable
        );

      // MonthlyPremiumRow に変換
      const exempt = premiumResult.reasons.some(
        (r) => r.includes('産前産後休業') || r.includes('育児休業')
      );

      const premiumRow: MonthlyPremiumRow = {
        month,
        healthEmployee: premiumResult.health_employee,
        healthEmployer: premiumResult.health_employer,
        careEmployee: premiumResult.care_employee,
        careEmployer: premiumResult.care_employer,
        pensionEmployee: premiumResult.pension_employee,
        pensionEmployer: premiumResult.pension_employer,
        exempt,
        notes: premiumResult.reasons,
      };

      // 徴収不能額のチェックと保存
      // 総支給額と本人負担保険料を比較（欠勤控除を引いた総支給額を使用）
      // monthSalaryDataのtotalまたはtotalSalaryは既に欠勤控除を引いた値（calculateSalaryTotalsで計算済み）
      const totalSalary = monthSalaryData?.totalSalary ?? monthSalaryData?.total ?? (fixedSalary + variableSalary);
      const employeeTotalPremium = 
        premiumResult.health_employee + 
        premiumResult.care_employee + 
        premiumResult.pension_employee;
      
      // 産休・育休中でない場合のみチェック
      if (!isExempt) {
        await this.uncollectedPremiumService.saveUncollectedPremium(
          emp.id,
          year,
          month,
          totalSalary,
          employeeTotalPremium
        );
      }

      return premiumRow;
    } else {
      // 給与データがなく、産休・育休でもない場合は0円として処理
      return {
        month,
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        exempt: false,
        notes: [],
      };
    }
  }

  /**
   * 資格取得時決定の情報を追加
   */
  async addAcquisitionInfo(
    emp: Employee,
    year: number,
    salaryData: any,
    gradeTable: any[],
    monthlyPremiumRows: MonthlyPremiumRow[]
  ): Promise<void> {
    if (!emp.joinDate || !salaryData) {
      return;
    }

    const joinDate = new Date(emp.joinDate);
    const joinYear = this.monthHelper.getPayYear(joinDate);
    const joinMonth = this.monthHelper.getPayMonth(joinDate);

    if (joinYear !== year) {
      return;
    }

    // 給与データをsalaries形式に変換
    const salaries: {
      [key: string]: { total: number; fixed: number; variable: number };
    } = {};
    for (let month = 1; month <= 12; month++) {
      const monthKey = this.salaryCalculationService.getSalaryKey(
        emp.id,
        month
      );
      const monthSalaryData = salaryData[monthKey];
      if (monthSalaryData) {
        salaries[monthKey] = {
          total:
            monthSalaryData.totalSalary ?? monthSalaryData.total ?? 0,
          fixed:
            monthSalaryData.fixedSalary ?? monthSalaryData.fixed ?? 0,
          variable:
            monthSalaryData.variableSalary ??
            monthSalaryData.variable ??
            0,
        };
      }
    }

    // 資格取得時決定の情報を取得
    let acquisitionGrade = emp.acquisitionGrade;
    let acquisitionStandard = emp.acquisitionStandard;
    let acquisitionMonth = emp.acquisitionMonth;
    let shikakuResult: ShikakuShutokuResult | null = null;

    // 既存情報がない場合のみ計算
    if (!acquisitionGrade || !acquisitionStandard || !acquisitionMonth) {
      shikakuResult =
        await this.salaryCalculationService.calculateShikakuShutoku(
          emp,
          year,
          salaries,
          gradeTable
        );

      if (shikakuResult && shikakuResult.grade > 0) {
        acquisitionGrade = shikakuResult.grade;
        acquisitionStandard = shikakuResult.standardMonthlyRemuneration;
        acquisitionMonth = shikakuResult.usedMonth;
      }
    } else {
      // 既存情報がある場合はそのまま使用
      shikakuResult = {
        baseSalary: acquisitionStandard,
        grade: acquisitionGrade,
        standardMonthlyRemuneration: acquisitionStandard,
        usedMonth: acquisitionMonth,
        reasons: [],
      };
    }

    // UI表示用に設定
    if (acquisitionGrade && acquisitionStandard && acquisitionMonth) {
      const acquisitionRow = monthlyPremiumRows.find(
        (r) => r.month === acquisitionMonth
      );
      if (acquisitionRow) {
        acquisitionRow.isAcquisitionMonth = true;
        acquisitionRow.acquisitionGrade = acquisitionGrade;
        acquisitionRow.acquisitionStandard = acquisitionStandard;
        acquisitionRow.acquisitionReason = `標準報酬月額：${acquisitionStandard.toLocaleString()}円（1,000円単位に四捨五入済み）\n標準報酬等級：${acquisitionGrade}等級\n資格取得月のため、随時改定対象外`;

        // 資格取得届の要否判定
        const shikakuDecision =
          this.notificationDecisionService.getShikakuShutokuDecision(
            emp,
            shikakuResult
          );
        if (shikakuDecision) {
          acquisitionRow.shikakuReportRequired = shikakuDecision.required;
          acquisitionRow.shikakuReportDeadline = shikakuDecision.deadline;
          acquisitionRow.shikakuReportReason = shikakuDecision.reason;
        }
      }
    }
  }
}


