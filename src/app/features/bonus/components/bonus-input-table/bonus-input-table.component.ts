import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models/employee.model';

@Component({
  selector: 'app-bonus-input-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bonus-input-table.component.html',
  styleUrl: './bonus-input-table.component.css'
})
export class BonusInputTableComponent {
  @Input() employees: Employee[] = [];
  @Input() months: number[] = [];
  @Input() bonusData: { [key: string]: number } = {}; // { employeeId_month: amount }

  @Output() bonusChange = new EventEmitter<{
    employeeId: string;
    month: number;
    value: number;
  }>();

  getBonusKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  getBonusAmount(employeeId: string, month: number): number {
    const key = this.getBonusKey(employeeId, month);
    return this.bonusData[key] ?? 0;
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

  onBonusInput(employeeId: string, month: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const numValue = this.parseAmount(value);
    this.onBonusChange(employeeId, month, numValue);
    
    // カンマ付きで表示を更新
    input.value = this.formatAmount(numValue);
  }

  onBonusBlur(employeeId: string, month: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const numValue = this.parseAmount(input.value);
    input.value = this.formatAmount(numValue);
  }

  onBonusChange(employeeId: string, month: number, value: number): void {
    this.bonusChange.emit({ employeeId, month, value });
  }
}

