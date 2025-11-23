import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
import { InsuranceCalculationService } from '../../services/insurance-calculation.service';
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

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private insuranceCalculationService: InsuranceCalculationService
  ) {}

  async ngOnInit(): Promise<void> {
    const employeesData = await this.employeeService.getAllEmployees();
    this.employees = employeesData || [];
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
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

      if (salaryData && salaryData.standardMonthlyRemuneration) {
        const age = this.insuranceCalculationService.getAge(emp.birthDate);
        monthlyPremiums = await this.monthlySalaryService.getMonthlyPremiums(
          emp.id,
          this.year,
          salaryData.standardMonthlyRemuneration,
          age,
          this.rates
        );
        
        // 年齢関連の矛盾チェック
        this.validateAgeRelatedErrors(emp, monthlyPremiums);
      }

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
}

