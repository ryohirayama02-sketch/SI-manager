import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../services/employee.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
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
  salaries: { [key: string]: number } = {};
  prefecture = 'tokyo';
  year = '2025';
  rates: any = null;

  constructor(
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    
    // 都道府県別料率を読み込む
    this.rates = await this.settingsService.getRates(this.year, this.prefecture);
    
    await this.loadExistingSalaries();
  }

  async reloadRates(): Promise<void> {
    this.rates = await this.settingsService.getRates(this.year, this.prefecture);
  }

  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  async onSalaryChange(employeeId: string, month: number, value: string | number): Promise<void> {
    const numValue = typeof value === 'string' ? Number(value) : value;
    const key = this.getSalaryKey(employeeId, month);
    this.salaries[key] = numValue;
    console.log('入力変更', employeeId, month, numValue);
    this.calculateInsurancePremiumsForEmployee(employeeId, month); // 仮でOK
  }

  calculateInsurancePremiumsForEmployee(employeeId: string, month: number): void {
    // 仮実装：後で実装
    console.log('保険料計算', employeeId, month);
  }

  getSalaryDataKey(employeeId: string, month: number): string {
    return `${employeeId}-${month}`;
  }

  getSalaryValue(employeeId: string, month: number): number | null {
    const key = this.getSalaryDataKey(employeeId, month);
    return this.salaryData[key] || null;
  }

  setSalaryValue(employeeId: string, month: number, value: number | null): void {
    const key = this.getSalaryDataKey(employeeId, month);
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
        const key = this.getSalaryDataKey(emp.id, month);
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
    if (!this.rates) return null;

    const r = this.rates;

    const health_employee = r.health_employee;
    const health_employer = r.health_employer;

    const care_employee = age >= 40 && age <= 64 ? r.care_employee : 0;
    const care_employer = age >= 40 && age <= 64 ? r.care_employer : 0;

    // 厚生年金は全国共通（都道府県に依存しない）
    const pension_employee = r.pension_employee;
    const pension_employer = r.pension_employer;

    return {
      health_employee: Math.floor(standard * health_employee),
      health_employer: Math.floor(standard * health_employer),
      care_employee: Math.floor(standard * care_employee),
      care_employer: Math.floor(standard * care_employer),
      pension_employee: Math.floor(standard * pension_employee),
      pension_employer: Math.floor(standard * pension_employer),
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

  async loadExistingSalaries(): Promise<void> {
    for (const emp of this.employees) {
      const data = await this.monthlySalaryService.getEmployeeSalary(emp.id, 2025);
      if (!data || !data.salaries) continue;

      for (const month of this.months) {
        const value = data.salaries[month] ?? null;
        const key = this.getSalaryDataKey(emp.id, month);
        this.salaryData[key] = value;
        // 新しいテーブル用にも読み込む
        const newKey = this.getSalaryKey(emp.id, month);
        if (value !== null) {
          this.salaries[newKey] = value;
        }
      }
    }
  }

  getCalculatedInfo(emp: any) {
    // 新しいテーブル用：salaries オブジェクトから値を取得
    const salaries: { [month: number]: number | null } = {};
    for (const month of this.months) {
      const key = this.getSalaryKey(emp.id, month);
      salaries[month] = this.salaries[key] || null;
    }

    const avg = this.getAverageForAprToJun(salaries);
    const stdResult = avg !== null ? this.getStandardMonthlyRemuneration(avg) : null;
    const standard = stdResult ? stdResult.standard : null;
    const rank = stdResult ? stdResult.rank : null;

    const age = this.calculateAge(emp.birthDate);
    const premiums =
      standard !== null ? this.calculateInsurancePremiums(standard, age) : null;

    return {
      avg,
      standard,
      rank,
      premiums
    };
  }
}

