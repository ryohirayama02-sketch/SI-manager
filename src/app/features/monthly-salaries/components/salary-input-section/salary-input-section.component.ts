import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models/employee.model';
import { SalaryItem } from '../../../../models/salary-item.model';

@Component({
  selector: 'app-salary-input-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './salary-input-section.component.html',
  styleUrl: './salary-input-section.component.css'
})
export class SalaryInputSectionComponent {
  @Input() employees: Employee[] = [];
  @Input() salaryItems: SalaryItem[] = [];
  @Input() months: number[] = [];
  @Input() salaryItemData: { [key: string]: { [itemId: string]: number } } = {};
  @Input() prefecture: string = 'tokyo';
  @Input() rehabHighlightMonths: { [employeeId: string]: number[] } = {};

  @Output() salaryItemChange = new EventEmitter<{
    employeeId: string;
    month: number;
    itemId: string;
    value: string | number;
  }>();
  @Output() prefectureChange = new EventEmitter<string>();

  getSalaryItemKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  getSalaryItemAmount(
    employeeId: string,
    month: number,
    itemId: string
  ): number {
    const key = this.getSalaryItemKey(employeeId, month);
    return this.salaryItemData[key]?.[itemId] ?? 0;
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

  onSalaryItemInput(
    employeeId: string,
    month: number,
    itemId: string,
    event: Event
  ): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const numValue = this.parseAmount(value);
    this.onSalaryItemChange(employeeId, month, itemId, numValue);
    
    // カンマ付きで表示を更新
    input.value = this.formatAmount(numValue);
  }

  onSalaryItemBlur(
    employeeId: string,
    month: number,
    itemId: string,
    event: Event
  ): void {
    const input = event.target as HTMLInputElement;
    const numValue = this.parseAmount(input.value);
    input.value = this.formatAmount(numValue);
  }

  onSalaryItemChange(
    employeeId: string,
    month: number,
    itemId: string,
    value: string | number
  ): void {
    this.salaryItemChange.emit({ employeeId, month, itemId, value });
  }

  onPrefectureChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.prefectureChange.emit(select.value);
  }

  getRehabHighlightMonths(employee: Employee): number[] {
    return this.rehabHighlightMonths[employee.id] || [];
  }
}

