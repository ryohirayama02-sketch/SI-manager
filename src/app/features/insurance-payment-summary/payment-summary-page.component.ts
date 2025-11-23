import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
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

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService
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
    for (let month = 1; month <= 12; month++) {
      this.monthlyTotals[month] = {
        health: 0,
        care: 0,
        pension: 0,
        total: 0
      };
    }

    if (!this.employees || this.employees.length === 0) {
      return;
    }

    // 全従業員をループ
    for (const emp of this.employees) {
      // A. 月次給与の保険料を集計
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(emp.id, this.year);
      if (salaryData && salaryData.standardMonthlyRemuneration) {
        const age = this.calculateAge(emp.birthDate);
        const monthlyPremiums = await this.monthlySalaryService.getMonthlyPremiums(
          emp.id,
          this.year,
          salaryData.standardMonthlyRemuneration,
          age,
          this.rates
        );

        // 各月の保険料を加算
        for (let month = 1; month <= 12; month++) {
          const premiums = monthlyPremiums[month];
          if (premiums) {
            this.monthlyTotals[month].health += premiums.healthEmployee + premiums.healthEmployer;
            this.monthlyTotals[month].care += premiums.careEmployee + premiums.careEmployer;
            this.monthlyTotals[month].pension += premiums.pensionEmployee + premiums.pensionEmployer;
          }
        }
      }

      // B. 賞与の保険料を集計
      const bonuses = await this.bonusService.getBonusesForResult(emp.id, this.year);
      for (const bonus of bonuses) {
        // 免除が true の場合は 0 円
        if (bonus.isExempted) {
          continue;
        }

        // 給与扱いの場合も 0 円
        if (bonus.isSalaryInsteadOfBonus) {
          continue;
        }

        // 支給月を取得
        const payDate = new Date(bonus.payDate);
        const payMonth = payDate.getMonth() + 1;

        // 賞与保険料を加算
        const healthTotal = (bonus.healthEmployee || 0) + (bonus.healthEmployer || 0);
        const careTotal = (bonus.careEmployee || 0) + (bonus.careEmployer || 0);
        const pensionTotal = (bonus.pensionEmployee || 0) + (bonus.pensionEmployer || 0);

        this.monthlyTotals[payMonth].health += healthTotal;
        this.monthlyTotals[payMonth].care += careTotal;
        this.monthlyTotals[payMonth].pension += pensionTotal;
      }
    }

    // 各月の合計を計算
    for (let month = 1; month <= 12; month++) {
      this.monthlyTotals[month].total = 
        this.monthlyTotals[month].health + 
        this.monthlyTotals[month].care + 
        this.monthlyTotals[month].pension;
    }
  }

  calculateAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  getTotalForYear(): number {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      total += this.monthlyTotals[month].total;
    }
    return total;
  }

  getTotalHealth(): number {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      total += this.monthlyTotals[month].health;
    }
    return total;
  }

  getTotalCare(): number {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      total += this.monthlyTotals[month].care;
    }
    return total;
  }

  getTotalPension(): number {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      total += this.monthlyTotals[month].pension;
    }
    return total;
  }
}

