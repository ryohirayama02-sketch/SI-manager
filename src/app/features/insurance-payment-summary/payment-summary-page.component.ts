import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
import { InsuranceCalculationService } from '../../services/insurance-calculation.service';
import { SalaryCalculationService, MonthlyPremiums } from '../../services/salary-calculation.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';

@Component({
  selector: 'app-payment-summary-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-summary-page.component.html',
  styleUrl: './payment-summary-page.component.css'
})
export class PaymentSummaryPageComponent implements OnInit {
  employees: Employee[] = [];
  year: number = new Date().getFullYear();
  prefecture: string = 'tokyo';
  rates: any = null;
  gradeTable: any[] = [];
  
  // 月ごとの集計結果
  monthlyTotals: { [month: number]: {
    health: number;
    care: number;
    pension: number;
    total: number;
  } } = {};

  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};

  // 月次保険料一覧（従業員ごと）
  // MonthlyPremiumRow は calculateMonthlyPremiums の戻り値（MonthlyPremiums & { reasons: string[] }）をベースに変換
  monthlyPremiumsByEmployee: { [employeeId: string]: {
    month: number;
    healthEmployee: number;  // health_employee から変換
    healthEmployer: number;  // health_employer から変換
    careEmployee: number;    // care_employee から変換
    careEmployer: number;    // care_employer から変換
    pensionEmployee: number; // pension_employee から変換
    pensionEmployer: number; // pension_employer から変換
    exempt: boolean;         // reasons から判定
    notes: string[];         // reasons から取得
  }[] } = {};

  // 会社全体の月次保険料合計
  companyMonthlyTotals: {
    month: number;
    healthTotal: number;
    careTotal: number;
    pensionTotal: number;
    total: number;
  }[] = [];

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private insuranceCalculationService: InsuranceCalculationService,
    private salaryCalculationService: SalaryCalculationService
  ) {}

  async ngOnInit(): Promise<void> {
    const employeesData = await this.employeeService.getAllEmployees();
    this.employees = employeesData || [];
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    this.gradeTable = await this.settingsService.getStandardTable(this.year.toString());
    if (this.employees.length > 0) {
      await this.calculateMonthlyTotals();
    }
  }

  async calculateMonthlyTotals(): Promise<void> {
    // 月ごとの集計を初期化
    const allMonthlyTotals: { [month: number]: {
      health: number;
      care: number;
      pension: number;
      total: number;
    } } = {};

    for (let month = 1; month <= 12; month++) {
      allMonthlyTotals[month] = {
        health: 0,
        care: 0,
        pension: 0,
        total: 0
      };
    }

    if (!this.employees || this.employees.length === 0) {
      this.monthlyTotals = allMonthlyTotals;
      return;
    }

    // 全従業員をループ
    for (const emp of this.employees) {
      this.errorMessages[emp.id] = [];
      this.warningMessages[emp.id] = [];
      
      // A. 月次給与の保険料を取得
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(emp.id, this.year);
      let monthlyPremiums: { [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      } } = {};

      // 月次保険料一覧を計算（初期化を確実に行う）
      const monthlyPremiumRows: {
        month: number;
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
        exempt: boolean;
        notes: string[];
      }[] = [];
      
      if (salaryData) {
        // 1〜12月分の月次保険料を計算
        for (let month = 1; month <= 12; month++) {
          const monthKey = this.salaryCalculationService.getSalaryKey(emp.id, month);
          const monthSalaryData = salaryData[monthKey];
          const fixedSalary = monthSalaryData?.fixedSalary ?? monthSalaryData?.fixed ?? 0;
          const variableSalary = monthSalaryData?.variableSalary ?? monthSalaryData?.variable ?? 0;
          
          // calculateMonthlyPremiums を呼び出し（戻り値: MonthlyPremiums & { reasons: string[] }）
          const premiumResult = this.salaryCalculationService.calculateMonthlyPremiums(
            emp,
            this.year,
            month,
            fixedSalary,
            variableSalary,
            this.gradeTable,
            this.rates
          );
          
          // MonthlyPremiumRow に変換（サービス側の戻り値型に完全一致）
          const exempt = premiumResult.reasons.some(r => 
            r.includes('産前産後休業') || r.includes('育児休業')
          );
          
          monthlyPremiumRows.push({
            month,
            healthEmployee: premiumResult.health_employee,
            healthEmployer: premiumResult.health_employer,
            careEmployee: premiumResult.care_employee,
            careEmployer: premiumResult.care_employer,
            pensionEmployee: premiumResult.pension_employee,
            pensionEmployer: premiumResult.pension_employer,
            exempt,
            notes: premiumResult.reasons
          });
          
          // 既存の monthlyPremiums 形式にも変換（後方互換性）
          monthlyPremiums[month] = {
            healthEmployee: premiumResult.health_employee,
            healthEmployer: premiumResult.health_employer,
            careEmployee: premiumResult.care_employee,
            careEmployer: premiumResult.care_employer,
            pensionEmployee: premiumResult.pension_employee,
            pensionEmployer: premiumResult.pension_employer
          };
        }
        
        // 年齢関連の矛盾チェック
        this.validateAgeRelatedErrors(emp, monthlyPremiums);
      }
      
      // 月次保険料一覧を保存（salaryDataがない場合でも空配列を設定）
      this.monthlyPremiumsByEmployee[emp.id] = monthlyPremiumRows;

      // B. 賞与の保険料を取得
      const bonuses = await this.bonusService.getBonusesForResult(emp.id, this.year);

      // サービスを使用して月次会社負担を計算
      const employeeMonthlyTotals = this.insuranceCalculationService.getMonthlyCompanyBurden(
        emp,
        monthlyPremiums,
        bonuses
      );

      // 全従業員分を合計
      for (let month = 1; month <= 12; month++) {
        allMonthlyTotals[month].health += employeeMonthlyTotals[month]?.health || 0;
        allMonthlyTotals[month].care += employeeMonthlyTotals[month]?.care || 0;
        allMonthlyTotals[month].pension += employeeMonthlyTotals[month]?.pension || 0;
        allMonthlyTotals[month].total += employeeMonthlyTotals[month]?.total || 0;
      }
    }

    this.monthlyTotals = allMonthlyTotals;
    
    // 会社全体の月次保険料合計を計算
    this.calculateCompanyMonthlyTotals();
  }

  /**
   * monthlyPremiumsByEmployee を元に会社全体の月次合計を計算
   * 事業主が支払うべき総額（本人負担 + 会社負担）を月ごとに集計する
   */
  calculateCompanyMonthlyTotals(): void {
    const totals: { [month: number]: {
      healthTotal: number;
      careTotal: number;
      pensionTotal: number;
      total: number;
    } } = {};

    // 1〜12月を初期化
    for (let month = 1; month <= 12; month++) {
      totals[month] = {
        healthTotal: 0,
        careTotal: 0,
        pensionTotal: 0,
        total: 0
      };
    }

    // 全従業員分を合算
    for (const emp of this.employees) {
      const employeeRows = this.monthlyPremiumsByEmployee[emp.id];
      if (!employeeRows || employeeRows.length === 0) {
        continue;
      }

      for (const row of employeeRows) {
        const month = row.month;
        // exempt の月はそのまま 0 として扱う（既に 0 になっている）
        // 事業主が支払うべき総額 = 本人負担 + 会社負担
        const healthSum = row.healthEmployee + row.healthEmployer;
        const careSum = row.careEmployee + row.careEmployer;
        const pensionSum = row.pensionEmployee + row.pensionEmployer;
        
        totals[month].healthTotal += healthSum;
        totals[month].careTotal += careSum;
        totals[month].pensionTotal += pensionSum;
      }
    }

    // 配列形式に変換（total は healthTotal + careTotal + pensionTotal として計算）
    this.companyMonthlyTotals = [];
    for (let month = 1; month <= 12; month++) {
      const healthTotal = totals[month].healthTotal;
      const careTotal = totals[month].careTotal;
      const pensionTotal = totals[month].pensionTotal;
      const total = healthTotal + careTotal + pensionTotal;
      
      this.companyMonthlyTotals.push({
        month,
        healthTotal,
        careTotal,
        pensionTotal,
        total
      });
    }
  }

  validateAgeRelatedErrors(emp: Employee, monthlyPremiums: { [month: number]: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
  } }): void {
    const age = this.insuranceCalculationService.getAge(emp.birthDate);
    
    // 70歳以上なのに厚生年金の保険料が計算されている
    for (let month = 1; month <= 12; month++) {
      const premiums = monthlyPremiums[month];
      if (premiums && age >= 70 && premiums.pensionEmployee > 0) {
        this.errorMessages[emp.id].push(`${month}月：70歳以上は厚生年金保険料は発生しません`);
      }
      
      // 75歳以上なのに健康保険・介護保険が計算されている
      if (premiums && age >= 75 && (premiums.healthEmployee > 0 || premiums.careEmployee > 0)) {
        this.errorMessages[emp.id].push(`${month}月：75歳以上は健康保険・介護保険は発生しません`);
      }
    }
  }

  getTotalForYear(): number {
    return this.insuranceCalculationService.getTotalForYear(this.monthlyTotals);
  }

  getTotalHealth(): number {
    return this.insuranceCalculationService.getTotalHealth(this.monthlyTotals);
  }

  getTotalCare(): number {
    return this.insuranceCalculationService.getTotalCare(this.monthlyTotals);
  }

  getTotalPension(): number {
    return this.insuranceCalculationService.getTotalPension(this.monthlyTotals);
  }

  hasNotesForEmployee(employeeId: string): boolean {
    const rows = this.monthlyPremiumsByEmployee[employeeId];
    if (!rows || rows.length === 0) {
      return false;
    }
    return rows.some(r => r.notes && r.notes.length > 0);
  }

  /**
   * 会社全体の健康保険年間合計（本人負担 + 会社負担）
   */
  getCompanyTotalHealth(): number {
    let sum = 0;
    for (const total of this.companyMonthlyTotals) {
      sum += total.healthTotal;
    }
    return sum;
  }

  /**
   * 会社全体の介護保険年間合計（本人負担 + 会社負担）
   */
  getCompanyTotalCare(): number {
    let sum = 0;
    for (const total of this.companyMonthlyTotals) {
      sum += total.careTotal;
    }
    return sum;
  }

  /**
   * 会社全体の厚生年金年間合計（本人負担 + 会社負担）
   */
  getCompanyTotalPension(): number {
    let sum = 0;
    for (const total of this.companyMonthlyTotals) {
      sum += total.pensionTotal;
    }
    return sum;
  }

  /**
   * 会社全体の年間総額（健康保険 + 介護保険 + 厚生年金）
   */
  getCompanyTotal(): number {
    let sum = 0;
    for (const total of this.companyMonthlyTotals) {
      sum += total.total;
    }
    return sum;
  }

  /**
   * 会社全体の健康保険年間合計（本人負担 + 会社負担）
   */
  getAnnualTotalHealth(): number {
    return this.getCompanyTotalHealth();
  }

  /**
   * 会社全体の介護保険年間合計（本人負担 + 会社負担）
   */
  getAnnualTotalCare(): number {
    return this.getCompanyTotalCare();
  }

  /**
   * 会社全体の厚生年金年間合計（本人負担 + 会社負担）
   */
  getAnnualTotalPension(): number {
    return this.getCompanyTotalPension();
  }

  /**
   * 会社全体の年間総額（健康保険 + 介護保険 + 厚生年金）
   */
  getAnnualTotal(): number {
    return this.getCompanyTotal();
  }
}

