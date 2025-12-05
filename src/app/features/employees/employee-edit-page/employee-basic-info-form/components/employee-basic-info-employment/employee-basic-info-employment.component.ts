import { Component, OnInit, AfterViewInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-employee-basic-info-employment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-basic-info-employment.component.html',
  styleUrl: './employee-basic-info-employment.component.css',
})
export class EmployeeBasicInfoEmploymentComponent
  implements OnInit, AfterViewInit
{
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;

  constructor() {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    // 初期値がある場合、カンマ区切りで表示
    const monthlyWage = this.form.get('monthlyWage')?.value;
    if (monthlyWage !== null && monthlyWage !== undefined) {
      this.formatMonthlyWageDisplay();
    }
  }

  /**
   * 月額賃金の入力処理（カンマ区切り表示）
   */
  onMonthlyWageInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/,/g, ''); // カンマを削除

    // 数値のみ許可
    if (value === '' || /^\d+$/.test(value)) {
      // フォームコントロールに数値を保存
      const numValue = value === '' ? null : parseInt(value, 10);
      this.form.patchValue({ monthlyWage: numValue }, { emitEvent: false });

      // 表示用にカンマ区切りでフォーマット
      if (value !== '') {
        input.value = this.formatNumberWithCommas(value);
      } else {
        input.value = '';
      }
    } else {
      // 数値以外が入力された場合は前の値に戻す
      const currentValue = this.form.get('monthlyWage')?.value;
      if (currentValue !== null && currentValue !== undefined) {
        input.value = this.formatNumberWithCommas(currentValue.toString());
      } else {
        input.value = '';
      }
    }
  }

  /**
   * 月額賃金のフォーカスアウト処理
   */
  onMonthlyWageBlur(): void {
    this.formatMonthlyWageDisplay();
  }

  /**
   * 月額賃金の表示をカンマ区切りでフォーマット
   */
  private formatMonthlyWageDisplay(): void {
    const monthlyWageControl = this.form.get('monthlyWage');
    if (monthlyWageControl) {
      const value = monthlyWageControl.value;
      if (value !== null && value !== undefined && value !== '') {
        const input = document.getElementById(
          'monthlyWage'
        ) as HTMLInputElement;
        if (input) {
          input.value = this.formatNumberWithCommas(value.toString());
        }
      }
    }
  }

  /**
   * 数値をカンマ区切り文字列に変換
   */
  private formatNumberWithCommas(value: string): string {
    const numValue = value.replace(/,/g, '');
    if (numValue === '') return '';
    return parseInt(numValue, 10).toLocaleString('ja-JP');
  }
}
