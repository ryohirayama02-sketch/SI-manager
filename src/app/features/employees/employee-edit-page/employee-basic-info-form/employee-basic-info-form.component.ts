import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../../../services/employee.service';
import { EmployeeLifecycleService } from '../../../../services/employee-lifecycle.service';
import { EmployeeEligibilityService } from '../../../../services/employee-eligibility.service';
import { EmployeeChangeHistoryService } from '../../../../services/employee-change-history.service';
import { EmployeeWorkCategoryService } from '../../../../services/employee-work-category.service';
import { FamilyMemberService } from '../../../../services/family-member.service';
import { Router } from '@angular/router';
import { EmployeeBasicInfoPersonalComponent } from './components/employee-basic-info-personal/employee-basic-info-personal.component';
import { EmployeeBasicInfoEmploymentComponent } from './components/employee-basic-info-employment/employee-basic-info-employment.component';
import { EmployeeBasicInfoAffiliationComponent } from './components/employee-basic-info-affiliation/employee-basic-info-affiliation.component';
import { EmployeeBasicInfoLifecycleComponent } from './components/employee-basic-info-lifecycle/employee-basic-info-lifecycle.component';
import { EmployeeBasicInfoStandardRemunerationComponent } from './components/employee-basic-info-standard-remuneration/employee-basic-info-standard-remuneration.component';
import { EmployeeBasicInfoLeaveComponent } from './components/employee-basic-info-leave/employee-basic-info-leave.component';

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
  ],
  templateUrl: './employee-basic-info-form.component.html',
  styleUrl: './employee-basic-info-form.component.css',
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
    private employeeChangeHistoryService: EmployeeChangeHistoryService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService,
    private familyMemberService: FamilyMemberService,
    private router: Router
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      nameKana: [''],
      gender: [''],
      birthDate: ['', Validators.required],
      address: [''],
      myNumber: [''],
      basicPensionNumber: [''],
      insuredNumber: [''],
      weeklyWorkHoursCategory: [''],
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
      expectedDeliveryDate: [''],
      maternityLeaveStart: [''],
      maternityLeaveEndExpected: [''],
      actualDeliveryDate: [''],
      maternityLeaveEnd: [''],
      childcareChildName: [''],
      childcareChildBirthDate: [''],
      childcareLeaveStart: [''],
      childcareLeaveEndExpected: [''],
      childcareLeaveEnd: [''],
      childcareNotificationSubmitted: [false],
      childcareLivingTogether: [false],
      sickPayApplicationRequest: [false],
      childcareEmployerCertificateRequest: [false],
      maternityAllowanceApplicationRequest: [false],
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.employeeId) return;

    const data = await this.employeeService.getEmployeeById(this.employeeId);
    if (data) {
      console.log('[employee-basic-info-form] 読み込みデータ:', {
        officeNumber: (data as any).officeNumber,
        prefecture: data.prefecture,
        department: (data as any).department,
        fullData: data,
      });

      this.originalEmployeeData = {
        name: data.name || '',
        nameKana: (data as any).nameKana || '',
        gender: (data as any).gender || '',
        birthDate: data.birthDate || '',
        address: (data as any).address || '',
        officeNumber: (data as any).officeNumber || '',
        prefecture: data.prefecture || 'tokyo',
        isShortTime: data.isShortTime || data.shortTimeWorker || false,
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
        insuredNumber: (data as any).insuredNumber || '',
        weeklyWorkHoursCategory: data.weeklyWorkHoursCategory || '',
        monthlyWage: data.monthlyWage || null,
        expectedEmploymentMonths:
          this.convertExpectedEmploymentMonthsToSelectValue(
            data.expectedEmploymentMonths
          ),
        isStudent: data.isStudent || false,
        prefecture: prefecture,
        officeNumber: officeNumber,
        department: (data as any).department || '',
        joinDate: data.joinDate || data.hireDate || '',
        retireDate: data.retireDate || '',
        healthInsuranceAcquisitionDate:
          (data as any).healthInsuranceAcquisitionDate || '',
        pensionAcquisitionDate: (data as any).pensionAcquisitionDate || '',
        healthInsuranceLossDate: (data as any).healthInsuranceLossDate || '',
        pensionLossDate: (data as any).pensionLossDate || '',
        currentStandardMonthlyRemuneration:
          data.standardMonthlyRemuneration || data.acquisitionStandard || null,
        determinationReason: (data as any).determinationReason || '',
        lastTeijiKetteiYear: (data as any).lastTeijiKetteiYear || null,
        lastTeijiKetteiMonth: (data as any).lastTeijiKetteiMonth || null,
        lastSuijiKetteiYear: (data as any).lastSuijiKetteiYear || null,
        lastSuijiKetteiMonth: (data as any).lastSuijiKetteiMonth || null,
        isShortTime: data.isShortTime || data.shortTimeWorker || false,
        leaveOfAbsenceStart: data.leaveOfAbsenceStart || '',
        leaveOfAbsenceEnd: data.leaveOfAbsenceEnd || '',
        returnFromLeaveDate: data.returnFromLeaveDate || '',
        expectedDeliveryDate: (data as any).expectedDeliveryDate || '',
        maternityLeaveStart: data.maternityLeaveStart || '',
        maternityLeaveEndExpected:
          (data as any).maternityLeaveEndExpected || '',
        actualDeliveryDate: (data as any).actualDeliveryDate || '',
        maternityLeaveEnd: data.maternityLeaveEnd || '',
        childcareChildName: (data as any).childcareChildName || '',
        childcareChildBirthDate: (data as any).childcareChildBirthDate || '',
        childcareLeaveStart: data.childcareLeaveStart || '',
        childcareLeaveEndExpected:
          (data as any).childcareLeaveEndExpected || '',
        childcareLeaveEnd: data.childcareLeaveEnd || '',
        childcareNotificationSubmitted:
          data.childcareNotificationSubmitted || false,
        childcareLivingTogether: data.childcareLivingTogether || false,
        sickPayApplicationRequest: data.sickPayApplicationRequest || false,
        childcareEmployerCertificateRequest:
          data.childcareEmployerCertificateRequest || false,
        maternityAllowanceApplicationRequest:
          data.maternityAllowanceApplicationRequest || false,
      });
    }

    this.eligibilitySubscription = this.employeeEligibilityService
      .observeEligibility()
      .subscribe(() => {
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
    const validationResult =
      this.employeeLifecycleService.validateEmployeeDates({
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

    // weeklyWorkHoursCategoryに基づいてisShortTimeを自動計算
    const tempEmployee: any = {
      weeklyWorkHoursCategory: value.weeklyWorkHoursCategory || '',
      monthlyWage: value.monthlyWage || null,
      expectedEmploymentMonths: value.expectedEmploymentMonths || null,
      isStudent: value.isStudent ?? false,
    };
    const isShortTime =
      this.employeeWorkCategoryService.isShortTimeWorker(tempEmployee);

    const updateData: any = {
      name: value.name,
      birthDate: value.birthDate,
      weeklyWorkHoursCategory: value.weeklyWorkHoursCategory || '',
      monthlyWage: value.monthlyWage || null,
      expectedEmploymentMonths: value.expectedEmploymentMonths || null,
      isStudent: value.isStudent ?? false,
      prefecture: value.prefecture || 'tokyo', // 事業所選択時に自動設定される
      officeNumber: value.officeNumber || '', // 事業所情報を必ず保存
      department: value.department || '', // 部署情報を必ず保存
      joinDate: value.joinDate,
      isShortTime: isShortTime, // weeklyWorkHoursCategoryから自動計算
      childcareNotificationSubmitted:
        value.childcareNotificationSubmitted ?? false,
      childcareLivingTogether: value.childcareLivingTogether ?? false,
      sickPayApplicationRequest: value.sickPayApplicationRequest ?? false,
      childcareEmployerCertificateRequest:
        value.childcareEmployerCertificateRequest ?? false,
      maternityAllowanceApplicationRequest:
        value.maternityAllowanceApplicationRequest ?? false,
    };

    // オプショナルフィールドの保存（空文字列も含めて保存）
    if (value.nameKana !== undefined)
      updateData.nameKana = value.nameKana || '';
    if (value.gender !== undefined) updateData.gender = value.gender || '';
    if (value.address !== undefined) updateData.address = value.address || '';
    if (value.myNumber !== undefined)
      updateData.myNumber = value.myNumber || '';
    if (value.basicPensionNumber !== undefined)
      updateData.basicPensionNumber = value.basicPensionNumber || '';
    if (value.insuredNumber !== undefined)
      updateData.insuredNumber = value.insuredNumber || '';
    // 事業所情報は上記のupdateDataで既に設定済み（必ず保存される）
    // 日付フィールド（空の場合はnullを保存）
    if (value.retireDate !== undefined)
      updateData.retireDate = value.retireDate || null;
    if (value.healthInsuranceAcquisitionDate !== undefined)
      updateData.healthInsuranceAcquisitionDate =
        value.healthInsuranceAcquisitionDate || null;
    if (value.pensionAcquisitionDate !== undefined)
      updateData.pensionAcquisitionDate = value.pensionAcquisitionDate || null;
    if (value.healthInsuranceLossDate !== undefined)
      updateData.healthInsuranceLossDate =
        value.healthInsuranceLossDate || null;
    if (value.pensionLossDate !== undefined)
      updateData.pensionLossDate = value.pensionLossDate || null;
    if (value.determinationReason !== undefined)
      updateData.determinationReason = value.determinationReason || '';
    if (value.lastTeijiKetteiYear !== undefined)
      updateData.lastTeijiKetteiYear = value.lastTeijiKetteiYear || null;
    if (value.lastTeijiKetteiMonth !== undefined)
      updateData.lastTeijiKetteiMonth = value.lastTeijiKetteiMonth || null;
    if (value.lastSuijiKetteiYear !== undefined)
      updateData.lastSuijiKetteiYear = value.lastSuijiKetteiYear || null;
    if (value.lastSuijiKetteiMonth !== undefined)
      updateData.lastSuijiKetteiMonth = value.lastSuijiKetteiMonth || null;
    if (value.leaveOfAbsenceStart !== undefined)
      updateData.leaveOfAbsenceStart = value.leaveOfAbsenceStart || null;
    if (value.leaveOfAbsenceEnd !== undefined)
      updateData.leaveOfAbsenceEnd = value.leaveOfAbsenceEnd || null;
    if (value.returnFromLeaveDate !== undefined)
      updateData.returnFromLeaveDate = value.returnFromLeaveDate || null;
    if (value.expectedDeliveryDate !== undefined)
      updateData.expectedDeliveryDate = value.expectedDeliveryDate || null;
    if (value.maternityLeaveStart !== undefined)
      updateData.maternityLeaveStart = value.maternityLeaveStart || null;
    if (value.maternityLeaveEndExpected !== undefined)
      updateData.maternityLeaveEndExpected =
        value.maternityLeaveEndExpected || null;
    if (value.actualDeliveryDate !== undefined)
      updateData.actualDeliveryDate = value.actualDeliveryDate || null;
    if (value.maternityLeaveEnd !== undefined)
      updateData.maternityLeaveEnd = value.maternityLeaveEnd || null;
    if (value.childcareChildName !== undefined)
      updateData.childcareChildName = value.childcareChildName || null;
    if (value.childcareChildBirthDate !== undefined)
      updateData.childcareChildBirthDate =
        value.childcareChildBirthDate || null;
    if (value.childcareLeaveStart !== undefined)
      updateData.childcareLeaveStart = value.childcareLeaveStart || null;
    if (value.childcareLeaveEndExpected !== undefined)
      updateData.childcareLeaveEndExpected =
        value.childcareLeaveEndExpected || null;
    if (value.childcareLeaveEnd !== undefined)
      updateData.childcareLeaveEnd = value.childcareLeaveEnd || null;
    if (value.sickPayApplicationRequest !== undefined)
      updateData.sickPayApplicationRequest = value.sickPayApplicationRequest;
    if (value.childcareEmployerCertificateRequest !== undefined)
      updateData.childcareEmployerCertificateRequest =
        value.childcareEmployerCertificateRequest;
    if (value.maternityAllowanceApplicationRequest !== undefined)
      updateData.maternityAllowanceApplicationRequest =
        value.maternityAllowanceApplicationRequest;

    console.log('[employee-basic-info-form] 保存データ:', {
      officeNumber: updateData.officeNumber,
      prefecture: updateData.prefecture,
      department: updateData.department,
      fullUpdateData: updateData,
    });

    await this.employeeService.updateEmployee(this.employeeId, updateData);
    await this.detectAndSaveChanges(this.originalEmployeeData, value);

    alert('保存しました');
    this.saved.emit();
  }

  private async detectAndSaveChanges(
    oldData: any,
    newData: any
  ): Promise<void> {
    if (!this.employeeId) return;

    const today = new Date().toISOString().split('T')[0];

    if (oldData.name && newData.name && oldData.name !== newData.name) {
      await this.employeeChangeHistoryService.saveChangeHistory({
        employeeId: this.employeeId,
        changeType: '氏名変更',
        changeDate: today,
        oldValue: oldData.name,
        newValue: newData.name,
        notificationNames: [
          '被保険者氏名変更届（健保）',
          '厚生年金被保険者氏名変更届',
        ],
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
        notificationNames: [
          '被保険者住所変更届（健保）',
          '厚生年金被保険者住所変更届',
        ],
      });
    }

    if (
      oldData.birthDate &&
      newData.birthDate &&
      oldData.birthDate !== newData.birthDate
    ) {
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
        notificationNames: [
          '被保険者性別変更届（健保）',
          '厚生年金被保険者性別変更届',
        ],
      });
    }

    const oldOfficeNumber = oldData.officeNumber || '';
    const newOfficeNumber = newData.officeNumber || '';
    if (
      oldOfficeNumber !== newOfficeNumber &&
      (oldOfficeNumber || newOfficeNumber)
    ) {
      const oldPrefecture = oldData.prefecture || '';
      const newPrefecture = newData.prefecture || '';
      const oldOfficeInfo = oldOfficeNumber
        ? `${oldOfficeNumber}${oldPrefecture ? ` (${oldPrefecture})` : ''}`
        : '(未設定)';
      const newOfficeInfo = newOfficeNumber
        ? `${newOfficeNumber}${newPrefecture ? ` (${newPrefecture})` : ''}`
        : '(未設定)';
      await this.employeeChangeHistoryService.saveChangeHistory({
        employeeId: this.employeeId,
        changeType: '所属事業所変更',
        changeDate: today,
        oldValue: oldOfficeInfo,
        newValue: newOfficeInfo,
        notificationNames: [
          '新しい事業所での資格取得届',
          '元の事業所での資格喪失届',
        ],
      });
    }

    const oldIsShortTime = oldData.isShortTime || false;
    const newIsShortTime = newData.isShortTime || false;

    if (oldIsShortTime !== newIsShortTime) {
      const oldStatus = oldIsShortTime ? '短時間労働者' : '通常加入';
      const newStatus = newIsShortTime ? '短時間労働者' : '通常加入';
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

  /**
   * 既存の数値データを選択値に変換
   * @param value 数値または選択値
   * @returns 選択値（'within-2months' | 'over-2months' | ''）
   */
  private convertExpectedEmploymentMonthsToSelectValue(
    value?: number | string | null
  ): string {
    if (value === undefined || value === null || value === '') {
      return '';
    }
    // 既に選択値の場合はそのまま返す
    if (typeof value === 'string') {
      return value === 'within-2months' || value === 'over-2months'
        ? value
        : '';
    }
    // 数値の場合は変換
    if (typeof value === 'number') {
      return value > 2 ? 'over-2months' : 'within-2months';
    }
    return '';
  }

  /**
   * 従業員をシステムから削除
   */
  async deleteEmployee(): Promise<void> {
    if (!this.employeeId) {
      window.alert('従業員IDが設定されていません');
      return;
    }

    // 削除確認
    const employee = await this.employeeService.getEmployeeById(
      this.employeeId
    );
    const employeeName = employee?.name || 'この従業員';
    const confirmMessage = `${employeeName}をシステムから削除しますか？\n\nこの操作は取り消せません。\n関連する家族情報も全て削除されます。`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // 家族情報を先に削除
      await this.familyMemberService.deleteFamilyMembersByEmployeeId(
        this.employeeId
      );

      // 従業員情報を削除
      await this.employeeService.deleteEmployee(this.employeeId);

      // 削除成功メッセージ
      window.alert('従業員を削除しました');

      // 従業員一覧画面にリダイレクト
      this.router.navigate(['/employees']);
    } catch (error) {
      console.error('[employee-basic-info-form] 従業員削除エラー:', error);
      window.alert('従業員の削除中にエラーが発生しました');
    }
  }
}
