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

    // 従業員データにstandardMonthlyRemunerationがない場合、salaryDataから定時決定を計算して取得
    // empのidが確実に含まれるようにする
    let employeeWithStandard = { ...emp };
    // idが確実に含まれるようにする
    if (!employeeWithStandard.id) {
      employeeWithStandard.id = emp.id;
    }
    
    console.log(
      `[徴収不能チェック] ${emp.name} (${year}年${month}月): employeeWithStandard.id=`,
      employeeWithStandard.id,
      `emp.id=`,
      emp.id
    );
    if (!employeeWithStandard.standardMonthlyRemuneration && salaryData) {
      // 年度の給与データから定時決定を計算
      const empSalaries: { [key: string]: { total: number; fixed: number; variable: number } } = {};
      for (let m = 1; m <= 12; m++) {
        const monthKey = m.toString();
        const monthData = salaryData[monthKey];
        if (monthData) {
          const key = `${emp.id}_${m}`;
          empSalaries[key] = {
            total: monthData.totalSalary ?? monthData.total ?? 0,
            fixed: monthData.fixedSalary ?? monthData.fixed ?? 0,
            variable: monthData.variableSalary ?? monthData.variable ?? 0,
          };
        }
      }
      
      // 定時決定を計算
      const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
        emp.id,
        empSalaries,
        gradeTable,
        year
      );
      
      if (teijiResult && teijiResult.standardMonthlyRemuneration > 0) {
        employeeWithStandard.standardMonthlyRemuneration = teijiResult.standardMonthlyRemuneration;
        console.log(
          `[徴収不能チェック] ${emp.name} (${year}年${month}月): 定時決定から標準報酬月額を取得: ${teijiResult.standardMonthlyRemuneration}円`
        );
      }
    }

    // 給与データがある場合のみ通常の計算を実行
    if (salaryData) {
      const monthKeyString = month.toString();
      const monthSalaryData = salaryData[monthKeyString];
      
      console.log(
        `[徴収不能チェック] ${emp.name} (${year}年${month}月): salaryData存在、monthSalaryData=`,
        monthSalaryData
      );
      
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
      // monthSalaryDataが存在しない場合でも、標準報酬月額が確定していれば保険料を計算する必要がある
      const premiumResult =
        await this.salaryCalculationService.calculateMonthlyPremiums(
          employeeWithStandard, // 標準報酬月額を含む従業員データを使用
          year,
          month,
          fixedSalary,
          variableSalary,
          gradeTable
        );
      
      console.log(
        `[徴収不能チェック] ${emp.name} (${year}年${month}月): calculateMonthlyPremiums結果`,
        {
          health_employee: premiumResult.health_employee,
          care_employee: premiumResult.care_employee,
          pension_employee: premiumResult.pension_employee,
          reasons: premiumResult.reasons
        }
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
      
      console.log(
        `[徴収不能チェック] ${emp.name} (${year}年${month}月):`,
        {
          totalSalary,
          employeeTotalPremium,
          health_employee: premiumResult.health_employee,
          care_employee: premiumResult.care_employee,
          pension_employee: premiumResult.pension_employee,
          isExempt,
          monthSalaryData: monthSalaryData ? {
            totalSalary: monthSalaryData.totalSalary,
            total: monthSalaryData.total,
            fixed: monthSalaryData.fixed,
            variable: monthSalaryData.variable
          } : null,
          fixedSalary,
          variableSalary
        }
      );
      
      // 産休・育休中でない場合のみチェック
      if (!isExempt) {
        const employeeId = employeeWithStandard.id || emp.id;
        console.log(
          `[徴収不能チェック] ${emp.name} (${year}年${month}月): 産休・育休ではないためチェック実行`,
          {
            employeeId,
            employeeWithStandardId: employeeWithStandard.id,
            empId: emp.id
          }
        );
        if (!employeeId) {
          console.error(
            `[徴収不能チェック] ${emp.name} (${year}年${month}月): employeeIdが取得できません`
          );
        } else {
          await this.uncollectedPremiumService.saveUncollectedPremium(
            employeeId,
            year,
            month,
            totalSalary,
            employeeTotalPremium
          );
        }
      } else {
        console.log(
          `[徴収不能チェック] ${emp.name} (${year}年${month}月): 産休・育休中のためスキップ`
        );
      }

      return premiumRow;
    } else {
      // 給与データがなく、産休・育休でもない場合
      // 標準報酬月額が確定していれば保険料を計算する必要があるため、給与0円として計算を実行
      console.log(
        `[徴収不能チェック] ${emp.name} (${year}年${month}月): 給与データなし、給与0円として保険料計算を実行`
      );
      
      // 給与データがない場合でも、従業員データにstandardMonthlyRemunerationがない場合は、
      // 給与データを取得して定時決定を計算
      if (!employeeWithStandard.standardMonthlyRemuneration) {
        const fetchedSalaryData = await this.monthlySalaryService.getEmployeeSalary(emp.id, year);
        if (fetchedSalaryData) {
          const empSalaries: { [key: string]: { total: number; fixed: number; variable: number } } = {};
          for (let m = 1; m <= 12; m++) {
            const monthKey = m.toString();
            const monthData = fetchedSalaryData[monthKey];
            if (monthData) {
              const key = `${emp.id}_${m}`;
              empSalaries[key] = {
                total: monthData.totalSalary ?? monthData.total ?? 0,
                fixed: monthData.fixedSalary ?? monthData.fixed ?? 0,
                variable: monthData.variableSalary ?? monthData.variable ?? 0,
              };
            }
          }
          
          // 定時決定を計算
          const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
            emp.id,
            empSalaries,
            gradeTable,
            year
          );
          
          if (teijiResult && teijiResult.standardMonthlyRemuneration > 0) {
            employeeWithStandard.standardMonthlyRemuneration = teijiResult.standardMonthlyRemuneration;
            console.log(
              `[徴収不能チェック] ${emp.name} (${year}年${month}月): 給与データ取得後、定時決定から標準報酬月額を取得: ${teijiResult.standardMonthlyRemuneration}円`
            );
          }
        }
      }
      
      const premiumResult =
        await this.salaryCalculationService.calculateMonthlyPremiums(
          employeeWithStandard, // 標準報酬月額を含む従業員データを使用
          year,
          month,
          0, // fixedSalary = 0
          0, // variableSalary = 0
          gradeTable
        );

      console.log(
        `[徴収不能チェック] ${emp.name} (${year}年${month}月): 保険料計算結果`,
        {
          health_employee: premiumResult.health_employee,
          care_employee: premiumResult.care_employee,
          pension_employee: premiumResult.pension_employee,
          reasons: premiumResult.reasons
        }
      );

      const premiumRow: MonthlyPremiumRow = {
        month,
        healthEmployee: premiumResult.health_employee,
        healthEmployer: premiumResult.health_employer,
        careEmployee: premiumResult.care_employee,
        careEmployer: premiumResult.care_employer,
        pensionEmployee: premiumResult.pension_employee,
        pensionEmployer: premiumResult.pension_employer,
        exempt: false,
        notes: premiumResult.reasons,
      };

      // 徴収不能額のチェックと保存（給与0円、標準報酬月額が確定していれば保険料が発生する可能性がある）
      const totalSalary = 0;
      const employeeTotalPremium = 
        premiumResult.health_employee + 
        premiumResult.care_employee + 
        premiumResult.pension_employee;
      
      console.log(
        `[徴収不能チェック] ${emp.name} (${year}年${month}月): 給与データなしの場合`,
        {
          totalSalary,
          employeeTotalPremium,
          isExempt
        }
      );
      
      // 産休・育休中でない場合のみチェック
      if (!isExempt) {
        const employeeId = employeeWithStandard.id || emp.id;
        console.log(
          `[徴収不能チェック] ${emp.name} (${year}年${month}月): 産休・育休ではないためチェック実行（給与データなし）`,
          {
            employeeId,
            employeeWithStandardId: employeeWithStandard.id,
            empId: emp.id
          }
        );
        if (!employeeId) {
          console.error(
            `[徴収不能チェック] ${emp.name} (${year}年${month}月): employeeIdが取得できません（給与データなし）`
          );
        } else {
          await this.uncollectedPremiumService.saveUncollectedPremium(
            employeeId,
            year,
            month,
            totalSalary,
            employeeTotalPremium
          );
        }
      } else {
        console.log(
          `[徴収不能チェック] ${emp.name} (${year}年${month}月): 産休・育休中のためスキップ（給与データなし）`
        );
      }

      return premiumRow;
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


