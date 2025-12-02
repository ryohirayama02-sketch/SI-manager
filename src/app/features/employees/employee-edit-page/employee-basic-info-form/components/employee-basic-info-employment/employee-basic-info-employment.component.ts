import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-employee-basic-info-employment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-basic-info-employment.component.html',
  styleUrl: './employee-basic-info-employment.component.css'
})
export class EmployeeBasicInfoEmploymentComponent implements OnInit {
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;

  constructor() {}

  ngOnInit(): void {}
}
