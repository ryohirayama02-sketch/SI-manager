import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { InsuranceCalculationService } from '../../services/insurance-calculation.service';
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
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService,
    private insuranceCalculationService: InsuranceCalculationService
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
      this.errorMessages[emp.id] = [];
      this.warningMessages[emp.id] = [];
      
      const bonuses = await this.bonusService.getBonusesForResult(emp.id, this.year);
      this.bonusData[emp.id] = bonuses || [];
      
      // 月次給与データを取得（将来の拡張用）
      const monthlyData = await this.monthlySalaryService.getEmployeeSalary(emp.id, this.year);
      
      // サービスを使用して年間保険料を計算
      const result = this.insuranceCalculationService.getAnnualPremiums(
        emp,
        monthlyData,
        bonuses || []
      );
      
      this.bonusTotals[emp.id] = result;
      
      // 年齢関連の矛盾チェック
      this.validateAgeRelatedErrors(emp, result);
    }
  }

  validateAgeRelatedErrors(emp: Employee, totals: any): void {
    const age = this.insuranceCalculationService.getAge(emp.birthDate);
    
    // 70歳以上なのに厚生年金の保険料が計算されている
    if (age >= 70 && totals.pensionEmployee > 0) {
      this.errorMessages[emp.id].push('70歳以上は厚生年金保険料は発生しません');
    }
    
    // 75歳以上なのに健康保険・介護保険が計算されている
    if (age >= 75 && (totals.healthEmployee > 0 || totals.careEmployee > 0)) {
      this.errorMessages[emp.id].push('75歳以上は健康保険・介護保険は発生しません');
    }
  }

  hasBonuses(employeeId: string): boolean {
    const bonuses = this.bonusData[employeeId];
    return bonuses && bonuses.length > 0;
  }
}

