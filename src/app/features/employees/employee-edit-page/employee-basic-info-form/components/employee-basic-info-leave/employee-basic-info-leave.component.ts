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
    // #region agent log
    const formControlErrors: any = {};
    const formControlStates: any = {};
    if (this.form) {
      Object.keys(this.form.controls).forEach(key => {
        const control = this.form.get(key);
        if (control) {
          formControlStates[key] = {
            valid: control.valid,
            invalid: control.invalid,
            errors: control.errors,
            value: control.value
          };
          if (control.errors) {
            formControlErrors[key] = control.errors;
          }
        }
      });
    }
    console.log('[DEBUG] onDateChange - Form state:', {
      formValid: this.form?.valid,
      formInvalid: this.form?.invalid,
      formControlErrors: formControlErrors,
      formControlStates: formControlStates,
      maternityLeaveStart: this.form?.get('maternityLeaveStart')?.value
    });
    console.log('[DEBUG] Form control errors (expanded):', JSON.stringify(formControlErrors, null, 2));
    const invalidControls = Object.keys(formControlStates).filter(key => formControlStates[key].invalid);
    console.log('[DEBUG] Invalid form controls:', invalidControls);
    invalidControls.forEach(key => {
      console.log(`[DEBUG] ${key}:`, {
        value: formControlStates[key].value,
        errors: formControlStates[key].errors,
        valid: formControlStates[key].valid,
        invalid: formControlStates[key].invalid
      });
    });
    // 必須フィールドの状態を確認
    const requiredFields = ['name', 'birthDate', 'weeklyWorkHoursCategory', 'monthlyWage', 'expectedEmploymentMonths', 'officeNumber', 'joinDate'];
    console.log('[DEBUG] Required fields status:', requiredFields.map(field => ({
      field,
      value: formControlStates[field]?.value,
      valid: formControlStates[field]?.valid,
      invalid: formControlStates[field]?.invalid,
      errors: formControlStates[field]?.errors
    })));
    fetch('http://127.0.0.1:7242/ingest/d28aa990-3fcc-448a-9722-b1e7cd6d4406',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employee-basic-info-leave.component.ts:23',message:'onDateChange called',data:{formValid:this.form?.valid,formInvalid:this.form?.invalid,formControlErrors:formControlErrors,formControlStates:formControlStates,maternityLeaveStart:this.form?.get('maternityLeaveStart')?.value},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    this.validateDates.emit();
    // #region agent log
    setTimeout(() => {
      const formControlErrorsAfter: any = {};
      if (this.form) {
        Object.keys(this.form.controls).forEach(key => {
          const control = this.form.get(key);
          if (control && control.errors) {
            formControlErrorsAfter[key] = control.errors;
          }
        });
      }
      console.log('[DEBUG] onDateChange - Form state after validateDates:', {
        formValid: this.form?.valid,
        formInvalid: this.form?.invalid,
        formControlErrors: formControlErrorsAfter
      });
      console.log('[DEBUG] Form control errors after validateDates (expanded):', JSON.stringify(formControlErrorsAfter, null, 2));
      fetch('http://127.0.0.1:7242/ingest/d28aa990-3fcc-448a-9722-b1e7cd6d4406',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'employee-basic-info-leave.component.ts:45',message:'onDateChange after validateDates',data:{formValid:this.form?.valid,formInvalid:this.form?.invalid,formControlErrors:formControlErrorsAfter},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
    }, 100);
    // #endregion
  }

  async onCheckboxChange(fieldName: string, event: Event): Promise<void> {
    if (!event || !event.target) {
      return;
    }

    const checkbox = event.target as HTMLInputElement;
    if (!checkbox) {
      return;
    }

    const isChecked = checkbox.checked;

    if (!this.employeeId) {
      return;
    }

    if (!this.form) {
      return;
    }

    try {
      // チェックが入った場合、今日の日付を保存
      if (isChecked) {
        const today = new Date();
        if (isNaN(today.getTime())) {
          return;
        }
        const todayStr = today.toISOString().split('T')[0];
        const dateFieldName = `${fieldName}Date` as keyof typeof this.form.value;

        // フォームの値も更新
        this.form.patchValue({
          [dateFieldName]: todayStr,
        });

        // 従業員データを更新
        const updateData: any = {
          [fieldName]: true,
          [dateFieldName]: todayStr,
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
    } catch (error) {
      console.error(`[employee-basic-info-leave] onCheckboxChangeエラー: fieldName=${fieldName}`, error);
    }
  }
}
