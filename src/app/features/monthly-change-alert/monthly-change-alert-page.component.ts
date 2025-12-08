import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SuijiService } from '../../services/suiji.service';
import { EmployeeService } from '../../services/employee.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { SuijiKouhoResult } from '../../services/salary-calculation.service';
import { Employee } from '../../models/employee.model';
import { RoomIdService } from '../../services/room-id.service';

// 前月比差額を含む拡張型
interface SuijiKouhoResultWithDiff extends SuijiKouhoResult {
  diffPrev?: number | null;
}

@Component({
  selector: 'app-monthly-change-alert-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './monthly-change-alert-page.component.html',
  styleUrl: './monthly-change-alert-page.component.css'
})
export class MonthlyChangeAlertPageComponent implements OnInit, OnDestroy {
  alerts: SuijiKouhoResultWithDiff[] = [];
  employees: Employee[] = [];
  year: number = new Date().getFullYear();
  availableYears: number[] = [];
  // 月次給与データ: { employeeId_month: { total: number; fixed: number; variable: number } }
  salaries: {
    [key: string]: { total: number; fixed: number; variable: number };
  } = {};
  // 給与データ購読用
  salarySubscription: Subscription | null = null;
  // 加入区分購読用
  eligibilitySubscription: Subscription | null = null;

  constructor(
    private suijiService: SuijiService,
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private roomIdService: RoomIdService
  ) {
    // 年度選択用の年度リストを生成（2023〜2026）
    for (let y = 2023; y <= 2026; y++) {
      this.availableYears.push(y);
    }
  }

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    await this.loadSalaries();
    await this.loadAlerts(this.year);
    
    // 給与データの変更を購読
    this.salarySubscription = this.monthlySalaryService
      .observeMonthlySalaries(this.year)
      .subscribe(() => {
        this.loadSalaries().then(() => {
          this.loadAlerts(this.year);
        });
      });

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService.observeEligibility().subscribe(() => {
      this.reloadEligibility();
    });
  }

  ngOnDestroy(): void {
    this.salarySubscription?.unsubscribe();
    this.eligibilitySubscription?.unsubscribe();
  }

  async reloadEligibility(): Promise<void> {
    // 加入区分が変更された場合、アラートを再読み込み
    await this.loadAlerts(this.year);
  }

  async loadSalaries(): Promise<void> {
    this.salaries = {};
    const roomId = this.roomIdService.getCurrentRoomId();
    if (!roomId) {
      console.warn('[monthly-change-alert] roomId is not set. skip loadSalaries.');
      return;
    }
    for (const emp of this.employees) {
      for (let month = 1; month <= 12; month++) {
        const monthData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          emp.id,
          this.year,
          month
        );
        if (monthData) {
          const fixed = monthData.fixedSalary ?? monthData.fixed ?? 0;
          const variable = monthData.variableSalary ?? monthData.variable ?? 0;
          const total = monthData.totalSalary ?? monthData.total ?? fixed + variable;
          const key = this.getSalaryKey(emp.id, month);
          this.salaries[key] = { total, fixed, variable };
        }
      }
    }
  }

  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  async loadAlerts(year: number): Promise<void> {
    const loadedAlerts = await this.suijiService.loadAlerts(year);
    // 各アラートに前月比差額を追加
    this.alerts = loadedAlerts.map(alert => ({
      ...alert,
      diffPrev: this.getPrevMonthDiff(alert.employeeId, alert.changeMonth)
    }));
  }

  getPrevMonthDiff(employeeId: string, month: number): number | null {
    const prevMonth = month - 1;
    if (prevMonth < 1) return null;

    const prevKey = this.getSalaryKey(employeeId, prevMonth);
    const currKey = this.getSalaryKey(employeeId, month);

    const prev = this.salaries[prevKey];
    const curr = this.salaries[currKey];
    if (!prev || !curr) return null;

    const prevTotal = (prev.fixed || 0) + (prev.variable || 0);
    const currTotal = (curr.fixed || 0) + (curr.variable || 0);

    return currTotal - prevTotal;
  }

  getEmployeeName(employeeId: string): string {
    const emp = this.employees.find(e => e.id === employeeId);
    return emp?.name || employeeId;
  }

  getStatusText(result: SuijiKouhoResultWithDiff): string {
    return result.isEligible ? '要提出' : '提出不要';
  }

  getReasonText(result: SuijiKouhoResultWithDiff): string {
    return result.reasons.join(' / ');
  }

  async onYearChange(): Promise<void> {
    // 既存の購読を解除
    this.salarySubscription?.unsubscribe();
    
    await this.loadSalaries();
    await this.loadAlerts(this.year);
    
    // 新しい年度の購読を開始
    this.salarySubscription = this.monthlySalaryService
      .observeMonthlySalaries(this.year)
      .subscribe(() => {
        this.loadSalaries().then(() => {
          this.loadAlerts(this.year);
        });
      });
  }

  isLargeChange(diff: number | null | undefined): boolean {
    if (diff == null) return false;
    return Math.abs(diff) >= 2;
  }
}

