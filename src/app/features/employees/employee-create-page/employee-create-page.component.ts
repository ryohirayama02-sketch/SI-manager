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

  async onSubmit(): Promise<void> {
    if (this.form.valid) {
      const formValue = this.form.value;
      const employeeData = {
        id: '', // 仮のID（後でFirestoreが生成）
        name: formValue.name,
        birthDate: formValue.birthDate,
        joinDate: formValue.joinDate,
        isShortTime: formValue.isShortTime
      };
      
      await this.employeeService.createEmployee(employeeData);
      this.router.navigate(['/employees']);
    }
  }
}

