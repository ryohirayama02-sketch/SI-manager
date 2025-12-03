import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-employee-basic-info-lifecycle',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-basic-info-lifecycle.component.html',
  styleUrl: './employee-basic-info-lifecycle.component.css'
})
export class EmployeeBasicInfoLifecycleComponent implements OnInit {
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;
  @Output() validateDates = new EventEmitter<void>();

  constructor() {}

  ngOnInit(): void {}

  onDateChange(): void {
    this.validateDates.emit();
  }
}
