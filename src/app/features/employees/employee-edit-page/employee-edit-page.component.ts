import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeeService } from '../../../services/employee.service';

@Component({
  selector: 'app-employee-edit-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-edit-page.component.html',
  styleUrl: './employee-edit-page.component.css'
})
export class EmployeeEditPageComponent implements OnInit {
  employeeId: string | null = null;
  form: any;
  errorMessages: string[] = [];
  warningMessages: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private employeeService: EmployeeService
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      birthDate: ['', Validators.required],
      hireDate: ['', Validators.required],
      shortTimeWorker: [false],
      maternityLeaveStart: [''],
      maternityLeaveEnd: [''],
      childcareLeaveStart: [''],
      childcareLeaveEnd: [''],
      childcareNotificationSubmitted: [false],
      childcareLivingTogether: [false],
    });
  }

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('id');
    if (!this.employeeId) return;

    const data = await this.employeeService.getEmployeeById(this.employeeId);
    if (data) {
      this.form.patchValue({
        name: data.name || '',
        birthDate: data.birthDate || '',
        hireDate: data.hireDate || '',
        shortTimeWorker: data.shortTimeWorker || false,
        maternityLeaveStart: data.maternityLeaveStart || '',
        maternityLeaveEnd: data.maternityLeaveEnd || '',
        childcareLeaveStart: data.childcareLeaveStart || '',
        childcareLeaveEnd: data.childcareLeaveEnd || '',
        childcareNotificationSubmitted: data.childcareNotificationSubmitted || false,
        childcareLivingTogether: data.childcareLivingTogether || false
      });
    }
  }

  validateDates(): void {
    this.errorMessages = [];
    this.warningMessages = [];

    const birthDate = this.form.get('birthDate')?.value;
    const hireDate = this.form.get('hireDate')?.value;
    const maternityLeaveStart = this.form.get('maternityLeaveStart')?.value;
    const maternityLeaveEnd = this.form.get('maternityLeaveEnd')?.value;
    const childcareLeaveStart = this.form.get('childcareLeaveStart')?.value;
    const childcareLeaveEnd = this.form.get('childcareLeaveEnd')?.value;
    const childcareNotificationSubmitted = this.form.get('childcareNotificationSubmitted')?.value;
    const childcareLivingTogether = this.form.get('childcareLivingTogether')?.value;

    // 入社日が生年月日より後かチェック
    if (birthDate && hireDate) {
      const birth = new Date(birthDate);
      const hire = new Date(hireDate);
      if (hire < birth) {
        this.errorMessages.push('入社日は生年月日より後である必要があります');
      }
    }

    // 産休・育休の日付整合性チェック
    if (maternityLeaveStart && maternityLeaveEnd && childcareLeaveStart && childcareLeaveEnd) {
      const matStart = new Date(maternityLeaveStart);
      const matEnd = new Date(maternityLeaveEnd);
      const childStart = new Date(childcareLeaveStart);
      const childEnd = new Date(childcareLeaveEnd);

      if (matStart <= childEnd && matEnd >= childStart) {
        const daysBetween = (childStart.getTime() - matEnd.getTime()) / (1000 * 60 * 60 * 24);
        if (daysBetween > 30) {
          this.errorMessages.push('産休・育休の設定が矛盾しています');
        }
      }
    }

    // 産休開始日 < 終了日
    if (maternityLeaveStart && maternityLeaveEnd) {
      const start = new Date(maternityLeaveStart);
      const end = new Date(maternityLeaveEnd);
      if (end < start) {
        this.errorMessages.push('産休終了日は開始日より後である必要があります');
      }
    }

    // 育休開始日 < 終了日
    if (childcareLeaveStart && childcareLeaveEnd) {
      const start = new Date(childcareLeaveStart);
      const end = new Date(childcareLeaveEnd);
      if (end < start) {
        this.errorMessages.push('育休終了日は開始日より後である必要があります');
      }
    }

    // 育休期間中なのに届出未提出または子と同居していない場合の警告
    if (childcareLeaveStart && childcareLeaveEnd) {
      const isNotificationSubmitted = childcareNotificationSubmitted === true;
      const isLivingTogether = childcareLivingTogether === true;
      if (!isNotificationSubmitted || !isLivingTogether) {
        this.warningMessages.push('育休期間が設定されていますが、届出未提出または子と同居していない場合、保険料免除の対象外となります');
      }
    }
  }

  async updateEmployee(): Promise<void> {
    this.validateDates();
    if (this.errorMessages.length > 0) {
      return;
    }
    if (!this.employeeId || !this.form.valid) return;
    await this.employeeService.updateEmployee(this.employeeId, this.form.value);
    this.router.navigate([`/employees/${this.employeeId}`]);
  }
}

