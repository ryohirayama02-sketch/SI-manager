import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SuijiService } from '../../services/suiji.service';
import { EmployeeService } from '../../services/employee.service';
import { SuijiKouhoResult } from '../../services/salary-calculation.service';
import { Employee } from '../../models/employee.model';

@Component({
  selector: 'app-monthly-change-alert-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './monthly-change-alert-page.component.html',
  styleUrl: './monthly-change-alert-page.component.css'
})
export class MonthlyChangeAlertPageComponent implements OnInit {
  alerts: SuijiKouhoResult[] = [];
  employees: Employee[] = [];
  year = 2025;

  constructor(
    private suijiService: SuijiService,
    private employeeService: EmployeeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    await this.loadAlerts(this.year);
  }

  async loadAlerts(year: number): Promise<void> {
    this.alerts = await this.suijiService.loadAlerts(year);
  }

  getEmployeeName(employeeId: string): string {
    const emp = this.employees.find(e => e.id === employeeId);
    return emp?.name || employeeId;
  }

  getStatusText(result: SuijiKouhoResult): string {
    return result.isEligible ? '要提出' : '提出不要';
  }

  getReasonText(result: SuijiKouhoResult): string {
    return result.reasons.join(' / ');
  }
}

