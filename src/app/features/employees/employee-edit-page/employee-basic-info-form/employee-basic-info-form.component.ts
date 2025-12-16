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
import { RoomIdService } from '../../../../services/room-id.service';
import { EmployeeBasicInfoPersonalComponent } from './components/employee-basic-info-personal/employee-basic-info-personal.component';
import { EmployeeBasicInfoEmploymentComponent } from './components/employee-basic-info-employment/employee-basic-info-employment.component';
import { EmployeeBasicInfoAffiliationComponent } from './components/employee-basic-info-affiliation/employee-basic-info-affiliation.component';
import { EmployeeBasicInfoLifecycleComponent } from './components/employee-basic-info-lifecycle/employee-basic-info-lifecycle.component';
import { EmployeeBasicInfoStandardRemunerationComponent } from './components/employee-basic-info-standard-remuneration/employee-basic-info-standard-remuneration.component';
import { EmployeeBasicInfoLeaveComponent } from './components/employee-basic-info-leave/employee-basic-info-leave.component';
import { StandardRemunerationHistoryService } from '../../../../services/standard-remuneration-history.service';
import { SalaryCalculationService } from '../../../../services/salary-calculation.service';
import { SettingsService } from '../../../../services/settings.service';

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
  private roomId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private employeeService: EmployeeService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private employeeChangeHistoryService: EmployeeChangeHistoryService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService,
    private familyMemberService: FamilyMemberService,
    private roomIdService: RoomIdService,
    private router: Router,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService,
    private salaryCalculationService: SalaryCalculationService,
    private settingsService: SettingsService
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
      sickPayApplicationRequestDate: [null],
      childcareEmployerCertificateRequestDate: [null],
      maternityAllowanceApplicationRequestDate: [null],
    });
  }

  async ngOnInit(): Promise<void> {
    if (!this.employeeId) return;
    this.roomId = this.roomIdService.requireRoomId();

    const data = await this.employeeService.getEmployeeByRoom(
      this.roomId,
      this.employeeId
    );
    if (data) {
      this.originalEmployeeData = {
        name: data.name || '',
        nameKana: (data as any).nameKana || '',
        gender: (data as any).gender || '',
        birthDate: data.birthDate || '',
        address: (data as any).address || '',
        officeNumber: (data as any).officeNumber || '',
        prefecture: data.prefecture || 'tokyo',
        isShortTime: data.isShortTime || (data as any).shortTimeWorker || false,
        weeklyWorkHoursCategory: data.weeklyWorkHoursCategory || '',
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
        joinDate: data.joinDate || (data as any).hireDate || '',
        retireDate: data.retireDate || '',
        currentStandardMonthlyRemuneration:
          (data as any).currentStandardMonthlyRemuneration ||
          (data as any).standardMonthlyRemuneration ||
          (data as any).acquisitionStandard ||
          null,
        determinationReason: (data as any).determinationReason || '',
        lastTeijiKetteiYear: (data as any).lastTeijiKetteiYear || null,
        lastTeijiKetteiMonth: (data as any).lastTeijiKetteiMonth || null,
        lastSuijiKetteiYear: (data as any).lastSuijiKetteiYear || null,
        lastSuijiKetteiMonth: (data as any).lastSuijiKetteiMonth || null,
        isShortTime: data.isShortTime || (data as any).shortTimeWorker || false,
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
        sickPayApplicationRequestDate:
          (data as any).sickPayApplicationRequestDate || null,
        childcareEmployerCertificateRequestDate:
          (data as any).childcareEmployerCertificateRequestDate || null,
        maternityAllowanceApplicationRequestDate:
          (data as any).maternityAllowanceApplicationRequestDate || null,
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
    if (value.sickPayApplicationRequestDate !== undefined)
      updateData.sickPayApplicationRequestDate =
        value.sickPayApplicationRequestDate || null;
    if (value.childcareEmployerCertificateRequestDate !== undefined)
      updateData.childcareEmployerCertificateRequestDate =
        value.childcareEmployerCertificateRequestDate || null;
    if (value.maternityAllowanceApplicationRequestDate !== undefined)
      updateData.maternityAllowanceApplicationRequestDate =
        value.maternityAllowanceApplicationRequestDate || null;

    if (!this.roomId) {
      console.warn(
        '[employee-basic-info-form] roomId is not set. skip update.'
      );
      return;
    }
    await this.employeeService.updateEmployeeInRoom(
      this.roomId,
      this.employeeId,
      updateData as any
    );
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
    const oldPrefecture = oldData.prefecture || '';
    const newPrefecture = newData.prefecture || '';
    if (
      (oldOfficeNumber !== newOfficeNumber ||
        oldPrefecture !== newPrefecture) &&
      (oldOfficeNumber || newOfficeNumber || oldPrefecture || newPrefecture)
    ) {
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
    const oldWeeklyCategory = oldData.weeklyWorkHoursCategory || '';
    const newWeeklyCategory = newData.weeklyWorkHoursCategory || '';

    // 保険加入状態の変化を検出
    const oldIsInsured = oldWeeklyCategory !== 'less-than-20hours';
    const newIsInsured = newWeeklyCategory !== 'less-than-20hours';

    // 週所定労働時間カテゴリの変化があれば履歴を残す（勤務区分変更）
    if (oldWeeklyCategory !== newWeeklyCategory) {

      await this.employeeChangeHistoryService.saveChangeHistory({
        employeeId: this.employeeId,
        changeType: '適用区分変更',
        changeDate: today,
        oldValue: this.convertWorkCategoryLabel(
          oldWeeklyCategory,
          oldIsShortTime
        ),
        newValue: this.convertWorkCategoryLabel(
          newWeeklyCategory,
          newIsShortTime
        ),
        notificationNames: ['資格取得届'],
      });

      // 保険加入状態が「非加入」から「加入」に変わった場合、標準報酬履歴を生成
      if (!oldIsInsured && newIsInsured) {
        await this.handleInsuranceAcquisition(newData, today);
      }
    } else if (oldIsShortTime !== newIsShortTime) {
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
   * 保険加入時の標準報酬履歴を生成
   */
  private async handleInsuranceAcquisition(
    newData: any,
    changeDate: string
  ): Promise<void> {
    if (!this.employeeId) return;

    // 変更月を取得（変更日の年月）
    const changeDateObj = new Date(changeDate);
    const acquisitionYear = changeDateObj.getFullYear();
    const acquisitionMonth = changeDateObj.getMonth() + 1;

    // 月額賃金見込を取得
    const monthlyWage = newData.monthlyWage || null;
    if (!monthlyWage || monthlyWage <= 0) {
      console.warn(
        `[employee-basic-info-form] 保険加入時の標準報酬履歴生成をスキップ: 月額賃金見込が設定されていません`,
        {
          employeeId: this.employeeId,
          acquisitionYear,
          acquisitionMonth,
          monthlyWage,
        }
      );
      return;
    }

    // 標準報酬等級表を取得
    const gradeTable = await this.settingsService.getStandardTable(
      acquisitionYear
    );
    if (!gradeTable || gradeTable.length === 0) {
      console.warn(
        `[employee-basic-info-form] 標準報酬等級表が取得できませんでした`,
        {
          employeeId: this.employeeId,
          acquisitionYear,
        }
      );
      return;
    }

    // 月額賃金見込から標準報酬月額を決定
    const result =
      this.salaryCalculationService.getStandardMonthlyRemuneration(
        monthlyWage,
        gradeTable
      );
    if (!result) {
      console.warn(
        `[employee-basic-info-form] 標準報酬月額の決定に失敗しました`,
        {
          employeeId: this.employeeId,
          acquisitionYear,
          acquisitionMonth,
          monthlyWage,
        }
      );
      return;
    }

    const standardMonthlyRemuneration = result.standard;
    const grade = result.rank || 0;

    // 既存の履歴を確認
    const existingHistories =
      await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
        this.employeeId
      );
    const existingAcquisition = existingHistories.find(
      (h) =>
        h.determinationReason === 'acquisition' &&
        h.applyStartYear === acquisitionYear &&
        h.applyStartMonth === acquisitionMonth
    );

    // 既存の履歴がない場合、または計算結果が異なる場合は保存/更新
    if (
      !existingAcquisition ||
      existingAcquisition.standardMonthlyRemuneration !==
        standardMonthlyRemuneration ||
      existingAcquisition.grade !== grade
    ) {
      await this.standardRemunerationHistoryService.saveStandardRemunerationHistory(
        {
          id: existingAcquisition?.id,
          employeeId: this.employeeId,
          applyStartYear: acquisitionYear,
          applyStartMonth: acquisitionMonth,
          grade: grade,
          standardMonthlyRemuneration: standardMonthlyRemuneration,
          determinationReason: 'acquisition',
          memo: `資格取得時決定（雇用条件変更による保険加入、月額賃金見込: ${monthlyWage.toLocaleString()}円）`,
          createdAt: existingAcquisition?.createdAt,
        }
      );

    }
  }

  /**
   * 週所定労働時間カテゴリを表示用ラベルに変換
   */
  private convertWorkCategoryLabel(
    category: string,
    isShortTime: boolean
  ): string {
    // カテゴリが空の場合は isShortTime で推定ラベル
    if (!category) {
      return isShortTime ? '短時間労働者' : '通常加入';
    }

    switch (category) {
      case '30hours-or-more':
        return 'フルタイム（週30時間以上）';
      case '20-30hours':
        return '短時間労働者（週20〜30時間）';
      case 'less-than-20hours':
        return '社会保険非加入（週20時間未満）';
      default:
        return isShortTime ? '短時間労働者' : '通常加入';
    }
  }

  /**
   * 既存の数値データを選択値に変換
   * @param value 数値または選択値
   * @returns 選択値（'within-2months' | 'over-2months' | ''）
   */
  public convertExpectedEmploymentMonthsToSelectValue(
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
  public async deleteEmployee(): Promise<void> {
    const employeeId = this.employeeId;
    const employeeService = this.employeeService;
    const familyMemberService = this.familyMemberService;
    const router = this.router;

    if (!employeeId) {
      window.alert('従業員IDが設定されていません');
      return;
    }

    if (!employeeService) {
      console.error('[employee-basic-info-form] employeeService is not initialized');
      window.alert('システムエラーが発生しました');
      return;
    }

    if (!familyMemberService) {
      console.error('[employee-basic-info-form] familyMemberService is not initialized');
      window.alert('システムエラーが発生しました');
      return;
    }

    if (!router) {
      console.error('[employee-basic-info-form] router is not initialized');
      window.alert('システムエラーが発生しました');
      return;
    }

    // 削除確認
    const employee = await employeeService.getEmployeeById(employeeId);
    const employeeName = employee?.name || 'この従業員';
    const confirmMessage = `${employeeName}をシステムから削除しますか？\n\nこの操作は取り消せません。\n関連する家族情報も全て削除されます。`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // 家族情報を先に削除
      await familyMemberService.deleteFamilyMembersByEmployeeId(employeeId);

      // 従業員情報を削除
      await employeeService.deleteEmployee(employeeId);

      // 削除成功メッセージ
      window.alert('従業員を削除しました');

      // 従業員一覧画面にリダイレクト
      router.navigate(['/employees']);
    } catch (error) {
      console.error('[employee-basic-info-form] 従業員削除エラー:', error);
      window.alert('従業員の削除中にエラーが発生しました');
    }
  }
}
