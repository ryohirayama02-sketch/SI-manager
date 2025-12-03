import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Employee } from '../../../../models/employee.model';
import { BonusCalculationResult } from '../../../../services/bonus-calculation.service';

@Component({
  selector: 'app-bonus-input-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bonus-input-form.component.html',
  styleUrl: './bonus-input-form.component.css'
})
export class BonusInputFormComponent implements OnInit {
  @Input() employees: Employee[] = [];
  @Input() year: number = new Date().getFullYear();
  @Input() availableYears: number[] = [];
  @Input() selectedEmployeeId: string = '';
  @Input() bonusAmount: number | null = null;
  @Input() bonusAmountDisplay: string = '';
  @Input() paymentMonth: number = 1;
  @Input() calculationResult: BonusCalculationResult | null = null;

  @Output() yearChange = new EventEmitter<number>();
  @Output() monthChange = new EventEmitter<number>();
  @Output() employeeChange = new EventEmitter<string>();
  @Output() bonusAmountChange = new EventEmitter<number>();
  @Output() bonusAmountDisplayChange = new EventEmitter<string>();
  @Output() submit = new EventEmitter<void>();

  ngOnInit(): void {
    // 初期表示時にカンマ付きで表示
    if (!this.bonusAmountDisplay && this.bonusAmount) {
      this.bonusAmountDisplay = this.formatAmount(this.bonusAmount);
    }
  }

  formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || value === 0) {
      return '';
    }
    return value.toLocaleString('ja-JP');
  }

  parseAmount(value: string): number {
    // カンマを削除して数値に変換
    const numStr = value.replace(/,/g, '');
    const num = parseInt(numStr, 10);
    return isNaN(num) ? 0 : num;
  }

  onYearChange(year: number): void {
    this.yearChange.emit(year);
  }

  onMonthChange(month: number): void {
    this.monthChange.emit(month);
  }

  onEmployeeChange(employeeId: string): void {
    this.employeeChange.emit(employeeId);
  }

  onBonusAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const numValue = this.parseAmount(value);
    const formatted = this.formatAmount(numValue);
    this.bonusAmountChange.emit(numValue);
    this.bonusAmountDisplayChange.emit(formatted);
    input.value = formatted;
  }

  onBonusAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const numValue = this.parseAmount(input.value);
    const formatted = this.formatAmount(numValue);
    this.bonusAmountChange.emit(numValue);
    this.bonusAmountDisplayChange.emit(formatted);
    input.value = formatted;
  }

  onSubmit(): void {
    this.submit.emit();
  }
}






