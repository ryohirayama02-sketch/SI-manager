import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';

@Component({
  selector: 'app-insurance-result-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './insurance-result-page.component.html',
  styleUrl: './insurance-result-page.component.css'
})
export class InsuranceResultPageComponent implements OnInit {
  employees: Employee[] = [];
  year: number = new Date().getFullYear();
  bonusData: { [employeeId: string]: Bonus[] } = {};
  bonusTotals: { [employeeId: string]: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    exemptReasons: string[];
    salaryInsteadReasons: string[];
  } } = {};

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService
  ) {}

  async ngOnInit(): Promise<void> {
    const employeesData = await this.employeeService.getAllEmployees();
    this.employees = employeesData || [];
    if (this.employees.length > 0) {
      await this.loadBonusData();
    }
  }

  async loadBonusData(): Promise<void> {
    if (!this.employees || this.employees.length === 0) {
      return;
    }
    for (const emp of this.employees) {
      const bonuses = await this.bonusService.getBonusesForResult(emp.id, this.year);
      this.bonusData[emp.id] = bonuses || [];
      this.calculateBonusTotals(emp.id, bonuses || []);
    }
  }

  calculateBonusTotals(employeeId: string, bonuses: Bonus[]): void {
    let healthEmployee = 0;
    let healthEmployer = 0;
    let careEmployee = 0;
    let careEmployer = 0;
    let pensionEmployee = 0;
    let pensionEmployer = 0;
    const exemptReasons: string[] = [];
    const salaryInsteadReasons: string[] = [];

    for (const bonus of bonuses) {
      // 免除が true の場合は 0 円
      if (bonus.isExempted) {
        if (bonus.exemptReason) {
          exemptReasons.push(bonus.exemptReason);
        }
        continue;
      }

      // 給与扱いの場合も 0 円
      if (bonus.isSalaryInsteadOfBonus) {
        salaryInsteadReasons.push('過去12ヶ月の賞与支給回数が1回のため給与扱い、または4回目以降のため給与扱い');
        continue;
      }

      // 保険料を集計
      healthEmployee += bonus.healthEmployee || 0;
      healthEmployer += bonus.healthEmployer || 0;
      careEmployee += bonus.careEmployee || 0;
      careEmployer += bonus.careEmployer || 0;
      pensionEmployee += bonus.pensionEmployee || 0;
      pensionEmployer += bonus.pensionEmployer || 0;
    }

    this.bonusTotals[employeeId] = {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      exemptReasons: [...new Set(exemptReasons)],
      salaryInsteadReasons: [...new Set(salaryInsteadReasons)]
    };
  }

  hasBonuses(employeeId: string): boolean {
    const bonuses = this.bonusData[employeeId];
    return bonuses && bonuses.length > 0;
  }
}

