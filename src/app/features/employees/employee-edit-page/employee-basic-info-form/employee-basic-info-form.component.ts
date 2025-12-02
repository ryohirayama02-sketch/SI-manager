import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../../../services/employee.service';
import { EmployeeLifecycleService } from '../../../../services/employee-lifecycle.service';
import { EmployeeEligibilityService } from '../../../../services/employee-eligibility.service';
import { EmployeeChangeHistoryService } from '../../../../services/employee-change-history.service';
import { EmployeeBasicInfoPersonalComponent } from './components/employee-basic-info-personal/employee-basic-info-personal.component';
import { EmployeeBasicInfoEmploymentComponent } from './components/employee-basic-info-employment/employee-basic-info-employment.component';
import { EmployeeBasicInfoAffiliationComponent } from './components/employee-basic-info-affiliation/employee-basic-info-affiliation.component';
import { EmployeeBasicInfoLifecycleComponent } from './components/employee-basic-info-lifecycle/employee-basic-info-lifecycle.component';
import { EmployeeBasicInfoStandardRemunerationComponent } from './components/employee-basic-info-standard-remuneration/employee-basic-info-standard-remuneration.component';
import { EmployeeBasicInfoLeaveComponent } from './components/employee-basic-info-leave/employee-basic-info-leave.component';
import { EmployeeBasicInfoAutoDetectionComponent } from './components/employee-basic-info-auto-detection/employee-basic-info-auto-detection.component';

@Component({
  selector: 'app-employee-basic-info-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    EmployeeBasicInfoPersonalComponent,
    EmployeeBasicInfoEmploymentComponent,
    EmployeeBasicInfoAffiliationComponent,
    EmployeeBasicInfoLifecycleComponent,
    EmployeeBasicInfoStandardRemunerationComponent,
    EmployeeBasicInfoLeaveComponent,
    EmployeeBasicInfoAutoDetectionComponent
  ],
  templateUrl: './employee-basic-info-form.component.html',
  styleUrl: './employee-basic-info-form.component.css'
})
export class EmployeeBasicInfoFormComponent implements OnInit, OnDestroy {
  @Input() employeeId: string | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() errorMessagesChange = new EventEmitter<string[]>();
  @Output() warningMessagesChange = new EventEmitter<string[]>();

  form: FormGroup;
  errorMessages: string[] = [];
  warningMessages: string[] = [];
  activeTab: string = 'personal';

  eligibilitySubscription: Subscription | null = null;
  private originalEmployeeData: any = {};

  constructor(
    private fb: FormBuilder,
    private employeeService: EmployeeService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private employeeChangeHistoryService: EmployeeChangeHistoryService
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      nameKana: [''],
      gender: [''],
      birthDate: ['', Validators.required],
      address: [''],
      myNumber: [''],
      basicPensionNumber: [''],
      employmentType: [''],
      weeklyHours: [null],
      monthlyWage: [null],
      expectedEmploymentMonths: [null],
      isStudent: [false],
      prefecture: ['tokyo'],
      officeNumber: [''],
      department: [''],
      joinDate: ['', Validators.required],
      retireDate: [''],
      healthInsuranceAcquisitionDate: [''],
      pensionAcquisitionDate: [''],
      healthInsuranceLossDate: [''],
      pensionLossDate: [''],
      currentStandardMonthlyRemuneration: [null],
      determinationReason: [''],
      lastTeijiKetteiYear: [null],
      lastTeijiKetteiMonth: [null],
      lastSuijiKetteiYear: [null],
      lastSuijiKetteiMonth: [null],
      isShortTime: [false],
      leaveOfAbsenceStart: [''],
      leaveOfAbsenceEnd: [''],
      returnFromLeaveDate: [''],
      maternityLeaveStart: [''],
      maternityLeaveEnd: [''],
      childcareLeaveStart: [''],
      childcareLeaveEnd: [''],
      childcareNotificationSubmitted: [false],
      childcareLivingTogether: [false],
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.employeeId) return;

    const data = await this.employeeService.getEmployeeById(this.employeeId);
    if (data) {
      this.originalEmployeeData = {
        name: data.name || '',
        nameKana: (data as any).nameKana || '',
        gender: (data as any).gender || '',
        birthDate: data.birthDate || '',
        address: (data as any).address || '',
        officeNumber: (data as any).officeNumber || '',
        prefecture: data.prefecture || 'tokyo',
        isShortTime: data.isShortTime || data.shortTimeWorker || false,
        weeklyHours: data.weeklyHours || null,
      };

      const officeNumber = (data as any).officeNumber || '';
      let prefecture = data.prefecture || 'tokyo';

      this.form.patchValue({
        name: data.name || '',
        nameKana: (data as any).nameKana || '',
        gender: (data as any).gender || '',
        birthDate: data.birthDate || '',
        address: (data as any).address || '',
        myNumber: (data as any).myNumber || '',
        basicPensionNumber: (data as any).basicPensionNumber || '',
        employmentType: (data as any).employmentType || '',
        weeklyHours: data.weeklyHours || null,
        monthlyWage: data.monthlyWage || null,
        expectedEmploymentMonths: data.expectedEmploymentMonths || null,
        isStudent: data.isStudent || false,
        prefecture: prefecture,
        officeNumber: officeNumber,
        department: (data as any).department || '',
        joinDate: data.joinDate || data.hireDate || '',
        retireDate: data.retireDate || '',
        healthInsuranceAcquisitionDate: (data as any).healthInsuranceAcquisitionDate || '',
        pensionAcquisitionDate: (data as any).pensionAcquisitionDate || '',
        healthInsuranceLossDate: (data as any).healthInsuranceLossDate || '',
        pensionLossDate: (data as any).pensionLossDate || '',
        currentStandardMonthlyRemuneration: data.standardMonthlyRemuneration || data.acquisitionStandard || null,
        determinationReason: (data as any).determinationReason || '',
        lastTeijiKetteiYear: (data as any).lastTeijiKetteiYear || null,
        lastTeijiKetteiMonth: (data as any).lastTeijiKetteiMonth || null,
        lastSuijiKetteiYear: (data as any).lastSuijiKetteiYear || null,
        lastSuijiKetteiMonth: (data as any).lastSuijiKetteiMonth || null,
        isShortTime: data.isShortTime || data.shortTimeWorker || false,
        leaveOfAbsenceStart: data.leaveOfAbsenceStart || '',
        leaveOfAbsenceEnd: data.leaveOfAbsenceEnd || '',
        returnFromLeaveDate: data.returnFromLeaveDate || '',
        maternityLeaveStart: data.maternityLeaveStart || '',
        maternityLeaveEnd: data.maternityLeaveEnd || '',
        childcareLeaveStart: data.childcareLeaveStart || '',
        childcareLeaveEnd: data.childcareLeaveEnd || '',
        childcareNotificationSubmitted: data.childcareNotificationSubmitted || false,
        childcareLivingTogether: data.childcareLivingTogether || false
      });
    }

    this.eligibilitySubscription = this.employeeEligibilityService.observeEligibility().subscribe(() => {
      if (this.employeeId) {
        this.reloadEligibility();
      }
    });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }

  reloadEligibility(): void {
    // 加入区分変更時の処理（子コンポーネントが自動判定を更新）
  }

  validateDates(): void {
    const value = this.form.value;
    const validationResult = this.employeeLifecycleService.validateEmployeeDates({
      birthDate: value.birthDate,
      joinDate: value.joinDate,
      retireDate: value.retireDate,
      maternityLeaveStart: value.maternityLeaveStart,
      maternityLeaveEnd: value.maternityLeaveEnd,
      childcareLeaveStart: value.childcareLeaveStart,
      childcareLeaveEnd: value.childcareLeaveEnd,
      returnFromLeaveDate: value.returnFromLeaveDate,
      childcareNotificationSubmitted: value.childcareNotificationSubmitted,
      childcareLivingTogether: value.childcareLivingTogether,
    });

    this.errorMessages = validationResult.errors;
    this.warningMessages = validationResult.warnings;
    this.errorMessagesChange.emit(this.errorMessages);
    this.warningMessagesChange.emit(this.warningMessages);
  }

  async updateEmployee(): Promise<void> {
    this.validateDates();
    if (this.errorMessages.length > 0) {
      return;
    }
    if (!this.employeeId || !this.form.valid) return;

    const value = this.form.value;
    const updateData: any = {
      name: value.name,
      birthDate: value.birthDate,
      employmentType: value.employmentType || '',
      weeklyHours: value.weeklyHours || null,
      monthlyWage: value.monthlyWage || null,
      expectedEmploymentMonths: value.expectedEmploymentMonths || null,
      isStudent: value.isStudent ?? false,
      prefecture: value.prefecture || 'tokyo',
      joinDate: value.joinDate,
      isShortTime: value.isShortTime ?? false,
      childcareNotificationSubmitted: value.childcareNotificationSubmitted ?? false,
      childcareLivingTogether: value.childcareLivingTogether ?? false,
    };

    if (value.nameKana) updateData.nameKana = value.nameKana;
    if (value.gender) updateData.gender = value.gender;
    if (value.address) updateData.address = value.address;
    if (value.myNumber) updateData.myNumber = value.myNumber;
    if (value.basicPensionNumber) updateData.basicPensionNumber = value.basicPensionNumber;
    if (value.officeNumber) updateData.officeNumber = value.officeNumber;
    if (value.department) updateData.department = value.department;
    if (value.retireDate) updateData.retireDate = value.retireDate;
    if (value.healthInsuranceAcquisitionDate) updateData.healthInsuranceAcquisitionDate = value.healthInsuranceAcquisitionDate;
    if (value.pensionAcquisitionDate) updateData.pensionAcquisitionDate = value.pensionAcquisitionDate;
    if (value.healthInsuranceLossDate) updateData.healthInsuranceLossDate = value.healthInsuranceLossDate;
    if (value.pensionLossDate) updateData.pensionLossDate = value.pensionLossDate;
    if (value.determinationReason) updateData.determinationReason = value.determinationReason;
    if (value.lastTeijiKetteiYear) updateData.lastTeijiKetteiYear = value.lastTeijiKetteiYear;
    if (value.lastTeijiKetteiMonth) updateData.lastTeijiKetteiMonth = value.lastTeijiKetteiMonth;
    if (value.lastSuijiKetteiYear) updateData.lastSuijiKetteiYear = value.lastSuijiKetteiYear;
    if (value.lastSuijiKetteiMonth) updateData.lastSuijiKetteiMonth = value.lastSuijiKetteiMonth;
    if (value.leaveOfAbsenceStart) updateData.leaveOfAbsenceStart = value.leaveOfAbsenceStart;
    if (value.leaveOfAbsenceEnd) updateData.leaveOfAbsenceEnd = value.leaveOfAbsenceEnd;
    if (value.returnFromLeaveDate) updateData.returnFromLeaveDate = value.returnFromLeaveDate;
    if (value.maternityLeaveStart) updateData.maternityLeaveStart = value.maternityLeaveStart;
    if (value.maternityLeaveEnd) updateData.maternityLeaveEnd = value.maternityLeaveEnd;
    if (value.childcareLeaveStart) updateData.childcareLeaveStart = value.childcareLeaveStart;
    if (value.childcareLeaveEnd) updateData.childcareLeaveEnd = value.childcareLeaveEnd;

    await this.employeeService.updateEmployee(this.employeeId, updateData);
    await this.detectAndSaveChanges(this.originalEmployeeData, value);

    alert('保存しました');
    this.saved.emit();
  }

  private async detectAndSaveChanges(oldData: any, newData: any): Promise<void> {
    if (!this.employeeId) return;

    const today = new Date().toISOString().split('T')[0];

    if (oldData.name && newData.name && oldData.name !== newData.name) {
      await this.employeeChangeHistoryService.saveChangeHistory({
        employeeId: this.employeeId,
        changeType: '氏名変更',
        changeDate: today,
        oldValue: oldData.name,
        newValue: newData.name,
        notificationNames: ['被保険者氏名変更届（健保）', '厚生年金被保険者氏名変更届'],
      });
    }

    const oldAddress = oldData.address || '';
    const newAddress = newData.address || '';
    if (oldAddress !== newAddress && (oldAddress || newAddress)) {
      await this.employeeChangeHistoryService.saveChangeHistory({
        employeeId: this.employeeId,
        changeType: '住所変更',
        changeDate: today,
        oldValue: oldAddress || '(未設定)',
        newValue: newAddress || '(未設定)',
        notificationNames: ['被保険者住所変更届（健保）', '厚生年金被保険者住所変更届'],
      });
    }

    if (oldData.birthDate && newData.birthDate && oldData.birthDate !== newData.birthDate) {
      await this.employeeChangeHistoryService.saveChangeHistory({
        employeeId: this.employeeId,
        changeType: '生年月日訂正',
        changeDate: today,
        oldValue: oldData.birthDate,
        newValue: newData.birthDate,
        notificationNames: ['生年月日訂正届（健保・厚年）'],
      });
    }

    const oldGender = oldData.gender || '';
    const newGender = newData.gender || '';
    if (oldGender !== newGender && (oldGender || newGender)) {
      await this.employeeChangeHistoryService.saveChangeHistory({
        employeeId: this.employeeId,
        changeType: '性別変更',
        changeDate: today,
        oldValue: oldGender || '(未設定)',
        newValue: newGender || '(未設定)',
        notificationNames: ['被保険者性別変更届（健保）', '厚生年金被保険者性別変更届'],
      });
    }

    const oldOfficeNumber = oldData.officeNumber || '';
    const newOfficeNumber = newData.officeNumber || '';
    if (oldOfficeNumber !== newOfficeNumber && (oldOfficeNumber || newOfficeNumber)) {
      const oldPrefecture = oldData.prefecture || '';
      const newPrefecture = newData.prefecture || '';
      const oldOfficeInfo = oldOfficeNumber ? `${oldOfficeNumber}${oldPrefecture ? ` (${oldPrefecture})` : ''}` : '(未設定)';
      const newOfficeInfo = newOfficeNumber ? `${newOfficeNumber}${newPrefecture ? ` (${newPrefecture})` : ''}` : '(未設定)';
      await this.employeeChangeHistoryService.saveChangeHistory({
        employeeId: this.employeeId,
        changeType: '所属事業所変更',
        changeDate: today,
        oldValue: oldOfficeInfo,
        newValue: newOfficeInfo,
        notificationNames: ['新しい事業所での資格取得届', '元の事業所での資格喪失届'],
      });
    }

    const oldIsShortTime = oldData.isShortTime || false;
    const newIsShortTime = newData.isShortTime || false;
    const oldWeeklyHours = oldData.weeklyHours || null;
    const newWeeklyHours = newData.weeklyHours || null;

    if ((oldIsShortTime !== newIsShortTime) ||
        (oldWeeklyHours !== newWeeklyHours && oldWeeklyHours !== null && newWeeklyHours !== null)) {
      const oldStatus = oldIsShortTime ? `短時間労働者 (週${oldWeeklyHours || '?'}時間)` : `通常加入 (週${oldWeeklyHours || '?'}時間)`;
      const newStatus = newIsShortTime ? `短時間労働者 (週${newWeeklyHours || '?'}時間)` : `通常加入 (週${newWeeklyHours || '?'}時間)`;
      await this.employeeChangeHistoryService.saveChangeHistory({
        employeeId: this.employeeId,
        changeType: '適用区分変更',
        changeDate: today,
        oldValue: oldStatus,
        newValue: newStatus,
        notificationNames: ['資格取得届'],
      });
    }
  }
}

