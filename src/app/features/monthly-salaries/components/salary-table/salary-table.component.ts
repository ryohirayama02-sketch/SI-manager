import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models/employee.model';
import { SalaryItem } from '../../../../models/salary-item.model';

@Component({
  selector: 'app-salary-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './salary-table.component.html',
  styleUrl: './salary-table.component.css',
})
export class SalaryTableComponent {
  @Input() employees: Employee[] = [];
  @Input() salaryItems: SalaryItem[] = [];
  @Input() months: number[] = [];
  @Input() salaryItemData: { [key: string]: { [itemId: string]: number } } = {};
  @Input() workingDaysData: { [key: string]: number } = {};
  @Input() rehabHighlightMonths: { [employeeId: string]: number[] } = {};
  @Input() exemptMonths: { [employeeId: string]: number[] } = {};
  @Input() exemptReasons: { [key: string]: string } = {};
  @Input() year: number = new Date().getFullYear();

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

  onSalaryItemCompositionStart(event: Event): void {
    // IME開始時（全角モード）は何もしない
  }

  onSalaryItemCompositionEnd(
    employeeId: string,
    month: number,
    itemId: string,
    event: Event
  ): void {
    // IME終了時（全角→半角に切り替わったとき）にフォーカスを再設定
    const input = event.target as HTMLInputElement;
    // フォーカスを維持するために、一度フォーカスを外してから再度設定
    setTimeout(() => {
      input.focus();
    }, 0);
  }

  onSalaryItemKeyDown(event: KeyboardEvent): void {
    // 全角モードで入力しようとした場合、入力を無視
    // IMEがアクティブな場合は、compositionstartが発火するので、ここでは処理しない
    // ただし、全角文字が直接入力された場合は防ぐ
    const input = event.target as HTMLInputElement;
    if (event.isComposing) {
      // IME入力中は何もしない
      return;
    }
    // 全角数字や全角文字が入力された場合は無視
    const key = event.key;
    if (key && /[０-９]/.test(key)) {
      event.preventDefault();
      return;
    }
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

  onWorkingDaysCompositionEnd(
    employeeId: string,
    month: number,
    event: Event
  ): void {
    // IME終了時（全角→半角に切り替わったとき）にフォーカスを再設定
    const input = event.target as HTMLInputElement;
    setTimeout(() => {
      input.focus();
    }, 0);
  }

  onWorkingDaysKeyDown(event: KeyboardEvent): void {
    // 全角モードで入力しようとした場合、入力を無視
    if (event.isComposing) {
      return;
    }
    // 全角数字が入力された場合は無視
    const key = event.key;
    if (key && /[０-９]/.test(key)) {
      event.preventDefault();
      return;
    }
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
