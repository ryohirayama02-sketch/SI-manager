import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { EmployeeService } from '../../../../../../services/employee.service';

@Component({
  selector: 'app-employee-basic-info-leave',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-basic-info-leave.component.html',
  styleUrl: './employee-basic-info-leave.component.css',
})
export class EmployeeBasicInfoLeaveComponent implements OnInit {
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;
  @Output() validateDates = new EventEmitter<void>();
  maxDate = '9999-12-31';

  constructor(private employeeService: EmployeeService) {}

  ngOnInit(): void {}

  onDateChange(): void {
    this.validateDates.emit();
  }

  async onCheckboxChange(fieldName: string, event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const isChecked = checkbox.checked;

    if (!this.employeeId) return;

    // チェックが入った場合、今日の日付を保存
    if (isChecked) {
      const today = new Date().toISOString().split('T')[0];
      const dateFieldName = `${fieldName}Date` as keyof typeof this.form.value;

      // フォームの値も更新
      this.form.patchValue({
        [dateFieldName]: today,
      });

      // 従業員データを更新
      const updateData: any = {
        [fieldName]: true,
        [dateFieldName]: today,
      };
      await this.employeeService.updateEmployee(this.employeeId, updateData);
    } else {
      // チェックが外れた場合、日付も削除
      const dateFieldName = `${fieldName}Date` as keyof typeof this.form.value;
      this.form.patchValue({
        [dateFieldName]: null,
      });

      const updateData: any = {
        [fieldName]: false,
        [dateFieldName]: null,
      };
      await this.employeeService.updateEmployee(this.employeeId, updateData);
    }
  }
}
