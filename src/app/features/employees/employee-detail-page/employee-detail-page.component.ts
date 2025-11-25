import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { EmployeeService } from '../../../services/employee.service';
import { EmployeeEligibilityService } from '../../../services/employee-eligibility.service';
import { SalaryCalculationService } from '../../../services/salary-calculation.service';

@Component({
  selector: 'app-employee-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './employee-detail-page.component.html',
  styleUrl: './employee-detail-page.component.css'
})
export class EmployeeDetailPageComponent implements OnInit {
  employee: any | null = null;
  id: string | null = null;

  eligibility: any = null;

  constructor(
    private route: ActivatedRoute,
    private employeeService: EmployeeService,
    private router: Router,
    private employeeEligibilityService: EmployeeEligibilityService,
    private salaryCalculationService: SalaryCalculationService
  ) {}

  async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('id');
    if (!this.id) return;

    this.employee = await this.employeeService.getEmployeeById(this.id);
    
    // 加入判定を取得
    if (this.employee) {
      const workInfo = {
        weeklyHours: this.employee.weeklyHours,
        monthlyWage: this.employee.monthlyWage,
        expectedEmploymentMonths: this.employee.expectedEmploymentMonths,
        isStudent: this.employee.isStudent,
        consecutiveMonthsOver20Hours: this.employee.consecutiveMonthsOver20Hours,
      };
      this.eligibility = this.employeeEligibilityService.checkEligibility(
        this.employee,
        workInfo
      );
    }
  }

  getAge(birthDate: string): number | null {
    if (!birthDate) return null;
    const today = new Date();
    const bd = new Date(birthDate);
    let age = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    return age;
  }

  isCareInsuranceTarget(): boolean {
    const age = this.getAge(this.employee?.birthDate);
    return age !== null && age >= 40 && age <= 64;
  }

  getHealthInsuranceStatus(): string {
    if (!this.eligibility) return '未判定';
    if (this.eligibility.ageFlags?.isNoHealth) {
      return '停止（75歳以上）';
    }
    if (this.eligibility.healthInsuranceEligible) {
      return '加入';
    }
    return '未加入';
  }

  getCareInsuranceStatus(): string {
    if (!this.employee) return '未判定';
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const careType = this.salaryCalculationService.getCareInsuranceType(
      this.employee.birthDate,
      currentYear,
      currentMonth
    );
    
    if (careType === 'none') {
      if (this.eligibility?.ageFlags?.isNoHealth) {
        return '停止（75歳以上）';
      }
      return 'なし';
    } else if (careType === 'type1') {
      return '第1号被保険者';
    } else if (careType === 'type2') {
      return 'あり（40〜64歳）';
    }
    return 'なし';
  }

  getPensionStatus(): string {
    if (!this.eligibility) return '未判定';
    if (this.eligibility.ageFlags?.isNoPension) {
      return '停止（70歳以上）';
    }
    if (this.eligibility.pensionEligible) {
      return '加入';
    }
    return '未加入';
  }

  async deleteEmployee(): Promise<void> {
    if (!this.id) return;

    const ok = confirm('本当に削除しますか？');
    if (!ok) return;

    await this.employeeService.deleteEmployee(this.id);
    this.router.navigate(['/employees']);
  }
}


