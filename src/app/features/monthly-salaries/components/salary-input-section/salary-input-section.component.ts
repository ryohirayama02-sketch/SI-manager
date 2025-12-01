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
  @Input() workingDaysData: { [key: string]: number } = {};
  @Input() rehabHighlightMonths: { [employeeId: string]: number[] } = {};
  @Input() exemptMonths: { [employeeId: string]: number[] } = {};
  @Input() exemptReasons: { [key: string]: string } = {};

  @Output() salaryItemChange = new EventEmitter<{
    employeeId: string;
    month: number;
    itemId: string;
    value: string | number;
  }>();

  @Output() workingDaysChange = new EventEmitter<{
    employeeId: string;
    month: number;
    value: number;
  }>();

  getSalaryItemKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  getSalaryItemAmount(
    employeeId: string,
    month: number,
    itemId: string
  ): number {
    // 免除月の場合は0を返す
    if (this.isExemptMonth(employeeId, month)) {
      return 0;
    }
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

  getRehabHighlightMonths(employee: Employee): number[] {
    return this.rehabHighlightMonths[employee.id] || [];
  }

  isExemptMonth(empId: string, month: number): boolean {
    return this.exemptMonths[empId]?.includes(month) ?? false;
  }

  getExemptLabel(empId: string, month: number): string {
    const key = `${empId}_${month}`;
    const reason = this.exemptReasons[key] || '';
    // 理由から「産休中」「育休中」を判定
    if (reason.includes('産前産後休業')) {
      return '産休中';
    } else if (reason.includes('育児休業')) {
      return '育休中';
    }
    return '免除中'; // フォールバック
  }

  getWorkingDaysKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  getWorkingDays(employeeId: string, month: number): number {
    const key = this.getWorkingDaysKey(employeeId, month);
    const value = this.workingDaysData[key];
    // undefinedの場合は0を返す（0も有効な値）
    if (value === undefined) {
      return 0;
    }
    // 0以上31以下の範囲に制限
    return Math.max(0, Math.min(31, value));
  }

  onWorkingDaysInput(employeeId: string, month: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = parseInt(input.value, 10);
    // 空文字列やNaNの場合は0として扱う
    if (isNaN(value)) {
      value = 0;
    }
    // 0以上31以下の範囲に制限
    const clampedValue = Math.max(0, Math.min(31, value));
    // 入力値が範囲外の場合は表示を更新
    if (value !== clampedValue) {
      input.value = clampedValue.toString();
    }
    this.onWorkingDaysChange(employeeId, month, clampedValue);
  }

  onWorkingDaysBlur(employeeId: string, month: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = parseInt(input.value, 10);
    // 空文字列やNaNの場合は0として扱う
    if (isNaN(value)) {
      value = 0;
    }
    // 0以上31以下の範囲に制限
    const clampedValue = Math.max(0, Math.min(31, value));
    input.value = clampedValue.toString();
    this.onWorkingDaysChange(employeeId, month, clampedValue);
  }

  onWorkingDaysChange(employeeId: string, month: number, value: number): void {
    this.workingDaysChange.emit({ employeeId, month, value });
  }
}

