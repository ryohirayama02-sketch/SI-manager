import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EmployeeEligibilityService } from '../../../../../../services/employee-eligibility.service';
import { ExemptionDeterminationService } from '../../../../../../services/exemption-determination.service';
import { Employee } from '../../../../../../models/employee.model';

@Component({
  selector: 'app-employee-basic-info-auto-detection',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-basic-info-auto-detection.component.html',
  styleUrl: './employee-basic-info-auto-detection.component.css'
})
export class EmployeeBasicInfoAutoDetectionComponent implements OnInit, OnDestroy {
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;

  healthInsuranceStatus: string = '読み込み中...';
  pensionStatus: string = '読み込み中...';
  careInsuranceStatus: string = '読み込み中...';
  ageLimitStatus: string = '読み込み中...';

  private eligibilitySubscription?: Subscription;

  constructor(
    private employeeEligibilityService: EmployeeEligibilityService,
    private exemptionDeterminationService: ExemptionDeterminationService
  ) {}

  ngOnInit(): void {
    this.updateStatus();
    
    // フォームの値変更を監視
    this.form.valueChanges.subscribe(() => {
      this.updateStatus();
    });

    // 加入区分の変更を監視
    this.eligibilitySubscription = this.employeeEligibilityService.observeEligibility().subscribe(() => {
      this.updateStatus();
    });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  private updateStatus(): void {
    const value = this.form.value;
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    // 従業員情報を作成（簡易版）
    const employee: Partial<Employee> = {
      birthDate: value.birthDate || '',
      joinDate: value.joinDate || '',
      retireDate: value.retireDate || '',
      maternityLeaveStart: value.maternityLeaveStart || '',
      maternityLeaveEnd: value.maternityLeaveEnd || '',
      childcareLeaveStart: value.childcareLeaveStart || '',
      childcareLeaveEnd: value.childcareLeaveEnd || '',
      leaveOfAbsenceStart: value.leaveOfAbsenceStart || '',
      leaveOfAbsenceEnd: value.leaveOfAbsenceEnd || '',
      returnFromLeaveDate: value.returnFromLeaveDate || '',
    };

    if (!value.birthDate) {
      this.healthInsuranceStatus = '生年月日が未入力です';
      this.pensionStatus = '生年月日が未入力です';
      this.careInsuranceStatus = '生年月日が未入力です';
      this.ageLimitStatus = '生年月日が未入力です';
      return;
    }

    // 加入区分を判定
    const eligibilityResult = this.employeeEligibilityService.checkEligibility(
      employee as Employee,
      undefined,
      currentDate
    );

    // 健康保険加入区分
    if (eligibilityResult.healthInsuranceEligible) {
      this.healthInsuranceStatus = '加入';
    } else {
      this.healthInsuranceStatus = '非加入';
    }

    // 厚生年金加入区分
    if (eligibilityResult.pensionEligible) {
      this.pensionStatus = '加入';
    } else {
      this.pensionStatus = '非加入';
    }

    // 介護保険区分
    const careType = this.exemptionDeterminationService.getCareInsuranceType(
      value.birthDate,
      year,
      month
    );
    if (careType === 'type1') {
      this.careInsuranceStatus = '第1号被保険者（65歳以上）';
    } else if (careType === 'type2') {
      this.careInsuranceStatus = '第2号被保険者（40-64歳）';
    } else {
      this.careInsuranceStatus = '該当なし（39歳以下）';
    }

    // 年齢到達による保険料停止
    const ageFlags = eligibilityResult.ageFlags;
    const ageLimits: string[] = [];
    if (ageFlags.isNoHealth) {
      ageLimits.push('健康保険・介護保険停止（75歳以上）');
    }
    if (ageFlags.isNoPension) {
      ageLimits.push('厚生年金停止（70歳以上）');
    }
    if (ageLimits.length === 0) {
      this.ageLimitStatus = '停止なし';
    } else {
      this.ageLimitStatus = ageLimits.join('、');
    }
  }
}
