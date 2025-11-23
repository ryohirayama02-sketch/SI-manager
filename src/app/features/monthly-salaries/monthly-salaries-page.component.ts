import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../services/employee.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { Employee } from '../../models/employee.model';

@Component({
  selector: 'app-monthly-salaries-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './monthly-salaries-page.component.html',
  styleUrl: './monthly-salaries-page.component.css'
})
export class MonthlySalariesPageComponent implements OnInit {
  employees: Employee[] = [];
  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // 各従業員×各月の給与データを保持（employeeId-month をキーにする）
  salaryData: { [key: string]: number | null } = {};

  constructor(
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
  }

  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}-${month}`;
  }

  getSalaryValue(employeeId: string, month: number): number | null {
    const key = this.getSalaryKey(employeeId, month);
    return this.salaryData[key] || null;
  }

  setSalaryValue(employeeId: string, month: number, value: number | null): void {
    const key = this.getSalaryKey(employeeId, month);
    this.salaryData[key] = value;
  }

  onSalaryInput(employeeId: string, month: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const numValue = value ? Number(value) : null;
    this.setSalaryValue(employeeId, month, numValue);
  }

  getEmployeeMonthlySalaries() {
    return this.employees.map(emp => {
      const salaries: { [month: number]: number | null } = {};

      for (const month of this.months) {
        const key = `${emp.id}-${month}`;
        salaries[month] = this.salaryData[key] ?? null;
      }

      return {
        ...emp,
        salaries,
      };
    });
  }

  getAverageForAprToJun(
    salaries: { [month: number]: number | null }
  ): number | null {
    const values = [
      salaries[4],
      salaries[5],
      salaries[6]
    ].filter(v => v !== null) as number[];

    if (values.length !== 3) return null;

    const total = values.reduce((sum, v) => sum + v, 0);
    return Math.round(total / 3);
  }

  // 協会けんぽ（一般）標準報酬月額テーブル（簡略化版）
  private readonly STANDARD_TABLE = [
    { rank: 1,  lower: 58000,  upper: 63000,  standard: 58000 },
    { rank: 2,  lower: 63000,  upper: 68000,  standard: 63000 },
    { rank: 3,  lower: 68000,  upper: 73000,  standard: 68000 },
    { rank: 4,  lower: 73000,  upper: 79000,  standard: 73000 },
    { rank: 5,  lower: 79000,  upper: 85000,  standard: 79000 },
    { rank: 6,  lower: 85000,  upper: 91000,  standard: 85000 },
    { rank: 7,  lower: 91000,  upper: 97000,  standard: 91000 },
    { rank: 8,  lower: 97000,  upper: 103000, standard: 97000 },
    { rank: 9,  lower: 103000, upper: 109000, standard: 103000 },
    { rank: 10, lower: 109000, upper: 115000, standard: 109000 },
    { rank: 11, lower: 115000, upper: 122000, standard: 115000 },
    { rank: 12, lower: 122000, upper: 129000, standard: 122000 },
    { rank: 13, lower: 129000, upper: 137000, standard: 129000 },
    // 必要に応じて後続等級も追加可能
  ];

  getStandardMonthlyRemuneration(avg: number | null) {
    if (avg === null) return null;

    const row = this.STANDARD_TABLE.find(
      r => avg >= r.lower && avg < r.upper
    );

    return row ? { rank: row.rank, standard: row.standard } : null;
  }

  calculateInsurancePremiums(
    standard: number,
    age: number
  ) {
    // 料率（協会けんぽ・東京都一般）
    const HEALTH_RATE = 0.04905;
    const CARE_RATE = 0.00785;   // 介護保険（40〜64歳のみ）
    const PENSION_RATE = 0.0915;

    const isCare = age >= 40 && age <= 64;

    const health_employee = Math.floor(standard * HEALTH_RATE);
    const health_employer = Math.floor(standard * HEALTH_RATE);

    const care_employee = isCare ? Math.floor(standard * CARE_RATE) : 0;
    const care_employer = isCare ? Math.floor(standard * CARE_RATE) : 0;

    const pension_employee = Math.floor(standard * PENSION_RATE);
    const pension_employer = Math.floor(standard * PENSION_RATE);

    return {
      health_employee,
      health_employer,
      care_employee,
      care_employer,
      pension_employee,
      pension_employer
    };
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

  async saveAllSalaries(): Promise<void> {
    const structured = this.getEmployeeMonthlySalaries();

    for (const emp of structured) {
      const avg = this.getAverageForAprToJun(emp.salaries);
      const standardResult = avg !== null ? this.getStandardMonthlyRemuneration(avg) : null;
      const standard = standardResult ? standardResult.standard : null;

      const age = this.calculateAge(emp.birthDate);
      const premiums =
        standard !== null ? this.calculateInsurancePremiums(standard, age) : null;

      const payload = {
        salaries: emp.salaries,
        averageAprToJun: avg,
        standardMonthlyRemuneration: standard,
        premiums
      };

      await this.monthlySalaryService.saveEmployeeSalary(emp.id, 2025, payload);
    }
  }
}

