import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { EmployeeService } from '../../../services/employee.service';

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

  constructor(
    private fb: FormBuilder,
    private employeeService: EmployeeService,
    private router: Router
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      birthDate: ['', Validators.required],
      joinDate: ['', Validators.required],
      isShortTime: [false]
    });
  }

  validate(): void {
    this.errorMessages = [];
    this.warningMessages = [];

    const value = this.form.value;

    // 入社日が生年月日より後かチェック
    if (value.birthDate && value.joinDate) {
      const birth = new Date(value.birthDate);
      const join = new Date(value.joinDate);
      if (join < birth) {
        this.errorMessages.push('入社日は生年月日より後である必要があります');
      }
    }
  }

  async onSubmit(): Promise<void> {
    this.validate();
    if (this.errorMessages.length > 0) {
      return;
    }
    if (!this.form.valid) return;

    const value = this.form.value;

    const employee = {
      name: value.name,
      birthDate: value.birthDate,
      hireDate: value.joinDate,
      shortTimeWorker: value.isShortTime ?? false
    };

    await this.employeeService.addEmployee(employee);

    this.router.navigate(['/employees']);
  }
}

