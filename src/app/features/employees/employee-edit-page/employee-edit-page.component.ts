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

  async updateEmployee(): Promise<void> {
    if (!this.employeeId || !this.form.valid) return;
    await this.employeeService.updateEmployee(this.employeeId, this.form.value);
    this.router.navigate([`/employees/${this.employeeId}`]);
  }
}

