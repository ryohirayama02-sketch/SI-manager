import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-employee-basic-info-personal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-basic-info-personal.component.html',
  styleUrl: './employee-basic-info-personal.component.css'
})
export class EmployeeBasicInfoPersonalComponent implements OnInit {
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;

  constructor() {}

  ngOnInit(): void {}
}
