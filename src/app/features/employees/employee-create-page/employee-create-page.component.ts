import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EmployeeService } from '../../../services/employee.service';
import { EmployeeLifecycleService } from '../../../services/employee-lifecycle.service';
import { EmployeeEligibilityService } from '../../../services/employee-eligibility.service';
import { SalaryCalculationService } from '../../../services/salary-calculation.service';
import { Employee } from '../../../models/employee.model';

@Component({
  selector: 'app-employee-create-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-create-page.component.html',
  styleUrl: './employee-create-page.component.css'
})
export class EmployeeCreatePageComponent {
  form: FormGroup;
  errorMessages: string[] = [];
  warningMessages: string[] = [];
  
  // 自動判定結果の表示用
  eligibilityStatus: string = '';
  ageInfo: string = '';
  insuranceStatus: {
    health: string;
    care: string;
    pension: string;
  } = { health: '', care: '', pension: '' };

  constructor(
    private fb: FormBuilder,
    private employeeService: EmployeeService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private salaryCalculationService: SalaryCalculationService,
    private router: Router
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      birthDate: ['', Validators.required],
      joinDate: ['', Validators.required],
      retireDate: [''],
      isShortTime: [false],
      prefecture: ['tokyo'],
      weeklyHours: [null],
      monthlyWage: [null],
      expectedEmploymentMonths: [null],
      isStudent: [false],
      leaveOfAbsenceStart: [''],
      leaveOfAbsenceEnd: [''],
      returnFromLeaveDate: [''],
      maternityLeaveStart: [''],
      maternityLeaveEnd: [''],
      childcareLeaveStart: [''],
      childcareLeaveEnd: [''],
      childcareNotificationSubmitted: [false],
      childcareLivingTogether: [false],
    });

    // フォーム値変更時に自動判定を実行
    this.form.valueChanges.subscribe(() => {
      this.updateAutoDetection();
    });
  }

  updateAutoDetection(): void {
    const value = this.form.value;
    
    if (!value.birthDate) {
      this.eligibilityStatus = '';
      this.ageInfo = '';
      this.insuranceStatus = { health: '', care: '', pension: '' };
      return;
    }

    // 年齢計算（SalaryCalculationServiceを使用）
    const age = this.salaryCalculationService.calculateAge(value.birthDate);
    this.ageInfo = `${age}歳`;

    // 年齢到達による保険料停止判定
    if (age >= 75) {
      this.insuranceStatus.health = '停止（75歳以上）';
      this.insuranceStatus.care = '停止（75歳以上）';
      this.insuranceStatus.pension = age >= 70 ? '停止（70歳以上）' : '加入可能';
    } else if (age >= 70) {
      this.insuranceStatus.health = '加入可能';
      this.insuranceStatus.care = age >= 65 ? '第1号被保険者' : (age >= 40 ? 'あり（40〜64歳）' : 'なし');
      this.insuranceStatus.pension = '停止（70歳以上）';
    } else if (age >= 65) {
      this.insuranceStatus.health = '加入可能';
      this.insuranceStatus.care = '第1号被保険者';
      this.insuranceStatus.pension = '加入可能';
    } else if (age >= 40) {
      this.insuranceStatus.health = '加入可能';
      this.insuranceStatus.care = 'あり（40〜64歳）';
      this.insuranceStatus.pension = '加入可能';
    } else {
      this.insuranceStatus.health = '加入可能';
      this.insuranceStatus.care = 'なし';
      this.insuranceStatus.pension = '加入可能';
    }

    // 加入判定（EmployeeEligibilityServiceを使用）
    if (value.joinDate && value.weeklyHours !== null && value.weeklyHours !== undefined) {
      const workInfo = {
        weeklyHours: value.weeklyHours,
        monthlyWage: value.monthlyWage,
        expectedEmploymentMonths: value.expectedEmploymentMonths,
        isStudent: value.isStudent,
      };
      
      const tempEmployee: Partial<Employee> = {
        birthDate: value.birthDate,
        joinDate: value.joinDate,
        retireDate: value.retireDate,
        isShortTime: value.isShortTime,
        weeklyHours: value.weeklyHours,
        monthlyWage: value.monthlyWage,
        expectedEmploymentMonths: value.expectedEmploymentMonths,
        isStudent: value.isStudent,
      };
      
      const eligibility = this.employeeEligibilityService.checkEligibility(
        tempEmployee as Employee,
        workInfo
      );

      if (eligibility.candidateFlag) {
        this.eligibilityStatus = '加入候補者（3ヶ月連続で実働20時間以上）';
      } else if (eligibility.healthInsuranceEligible || eligibility.pensionEligible) {
        if (value.isShortTime || (value.weeklyHours >= 20 && value.weeklyHours < 30)) {
          this.eligibilityStatus = '短時間対象（加入対象）';
        } else {
          this.eligibilityStatus = '加入対象';
        }
      } else {
        this.eligibilityStatus = '非対象';
      }
    } else {
      this.eligibilityStatus = '';
    }
  }

  validate(): void {
    const value = this.form.value;
    const validationResult = this.employeeLifecycleService.validateEmployeeDates({
      birthDate: value.birthDate,
      joinDate: value.joinDate,
      retireDate: value.retireDate,
      maternityLeaveStart: value.maternityLeaveStart,
      maternityLeaveEnd: value.maternityLeaveEnd,
      childcareLeaveStart: value.childcareLeaveStart,
      childcareLeaveEnd: value.childcareLeaveEnd,
      returnFromLeaveDate: value.returnFromLeaveDate,
      childcareNotificationSubmitted: value.childcareNotificationSubmitted,
      childcareLivingTogether: value.childcareLivingTogether,
    });

    this.errorMessages = validationResult.errors;
    this.warningMessages = validationResult.warnings;
  }

  async onSubmit(): Promise<void> {
    this.validate();
    if (this.errorMessages.length > 0) {
      return;
    }
    if (!this.form.valid) return;

    const value = this.form.value;

    const employee: any = {
      name: value.name,
      birthDate: value.birthDate,
      joinDate: value.joinDate,
      isShortTime: value.isShortTime ?? false,
      prefecture: value.prefecture || 'tokyo',
      isStudent: value.isStudent ?? false,
      childcareNotificationSubmitted: value.childcareNotificationSubmitted ?? false,
      childcareLivingTogether: value.childcareLivingTogether ?? false,
    };

    // 値がある場合のみ追加（undefinedを除外）
    if (value.retireDate) {
      employee.retireDate = value.retireDate;
    }
    if (value.weeklyHours) {
      employee.weeklyHours = value.weeklyHours;
    }
    if (value.monthlyWage) {
      employee.monthlyWage = value.monthlyWage;
    }
    if (value.expectedEmploymentMonths) {
      employee.expectedEmploymentMonths = value.expectedEmploymentMonths;
    }
    if (value.leaveOfAbsenceStart) {
      employee.leaveOfAbsenceStart = value.leaveOfAbsenceStart;
    }
    if (value.leaveOfAbsenceEnd) {
      employee.leaveOfAbsenceEnd = value.leaveOfAbsenceEnd;
    }
    if (value.returnFromLeaveDate) {
      employee.returnFromLeaveDate = value.returnFromLeaveDate;
    }
    if (value.maternityLeaveStart) {
      employee.maternityLeaveStart = value.maternityLeaveStart;
    }
    if (value.maternityLeaveEnd) {
      employee.maternityLeaveEnd = value.maternityLeaveEnd;
    }
    if (value.childcareLeaveStart) {
      employee.childcareLeaveStart = value.childcareLeaveStart;
    }
    if (value.childcareLeaveEnd) {
      employee.childcareLeaveEnd = value.childcareLeaveEnd;
    }

    await this.employeeService.addEmployee(employee);

    this.router.navigate(['/employees']);
  }
}

