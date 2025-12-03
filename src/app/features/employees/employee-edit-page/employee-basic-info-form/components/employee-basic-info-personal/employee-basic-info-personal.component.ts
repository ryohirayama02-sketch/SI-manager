import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
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
  @Output() validateDates = new EventEmitter<void>();

  constructor() {}

  ngOnInit(): void {}

  onDateChange(): void {
    this.validateDates.emit();
  }

  onBirthDateInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    
    // 年が4桁を超える場合は修正
    if (value) {
      const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1], 10);
        // 年が4桁を超える場合（10000以上）、9999に制限
        if (year > 9999) {
          const correctedValue = `9999-${dateMatch[2]}-${dateMatch[3]}`;
          input.value = correctedValue;
          this.form.patchValue({ birthDate: correctedValue }, { emitEvent: false });
        }
      }
    }
  }
}
