import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { EmployeeService } from '../../../services/employee.service';
import { EmployeeLifecycleService } from '../../../services/employee-lifecycle.service';
import { EmployeeEligibilityService } from '../../../services/employee-eligibility.service';
import { SalaryCalculationService } from '../../../services/salary-calculation.service';
import { FamilyMemberService } from '../../../services/family-member.service';
import { OfficeService } from '../../../services/office.service';
import { Employee } from '../../../models/employee.model';
import { FamilyMember } from '../../../models/family-member.model';
import { Office } from '../../../models/office.model';

@Component({
  selector: 'app-employee-create-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './employee-create-page.component.html',
  styleUrl: './employee-create-page.component.css',
})
export class EmployeeCreatePageComponent implements OnInit {
  form: FormGroup;
  errorMessages: string[] = [];
  warningMessages: string[] = [];

  // 自動判定結果の表示用
  eligibilityStatus: string = '';
  ageInfo: string = '';
  insuranceStatus: {
    health: string;
    care: string;
    pension: string;
  } = { health: '', care: '', pension: '' };

  // タブ管理
  activeTab: 'basic' | 'family' = 'basic';

  // 家族情報関連
  familyMembers: FamilyMember[] = [];
  showFamilyForm: boolean = false;
  editingFamilyMember: FamilyMember | null = null;
  familyForm!: FormGroup;
  supportReviewAlerts: FamilyMember[] = [];

  // 事業所マスタ関連
  offices: Office[] = [];

  // 従業員ID（登録後に使用）
  employeeId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private employeeService: EmployeeService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private salaryCalculationService: SalaryCalculationService,
    private familyMemberService: FamilyMemberService,
    private officeService: OfficeService,
    private router: Router
  ) {
    this.form = this.fb.group({
      // 個人情報
      name: ['', Validators.required],
      nameKana: [''],
      gender: [''],
      birthDate: ['', Validators.required],
      address: [''],
      myNumber: [''],
      basicPensionNumber: [''],
      // 雇用条件
      employmentType: [''],
      weeklyHours: [null],
      monthlyWage: [null],
      expectedEmploymentMonths: [null],
      isStudent: [false],
      // 所属
      prefecture: ['tokyo'],
      officeNumber: [''],
      department: [''],
      // 入退社
      joinDate: ['', Validators.required],
      retireDate: [''],
      healthInsuranceAcquisitionDate: [''],
      pensionAcquisitionDate: [''],
      healthInsuranceLossDate: [''],
      pensionLossDate: [''],
      // 休職・産休・育休
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
      sickPayApplicationRequestDate: [null],
      childcareEmployerCertificateRequest: [false],
      childcareEmployerCertificateRequestDate: [null],
      maternityAllowanceApplicationRequest: [false],
      maternityAllowanceApplicationRequestDate: [null],
    });

    // フォーム値変更時に自動判定を実行
    this.form.valueChanges.subscribe(() => {
      this.updateAutoDetection();
    });

    // 事業所選択時に都道府県を自動設定
    this.form
      .get('officeNumber')
      ?.valueChanges.subscribe((officeNumber: string) => {
        if (officeNumber) {
          const selectedOffice = this.offices.find(
            (office) => office.officeNumber === officeNumber
          );
          if (selectedOffice) {
            if (selectedOffice.prefecture) {
              this.form.patchValue(
                { prefecture: selectedOffice.prefecture },
                { emitEvent: false }
              );
            } else {
              console.warn(
                `事業所 ${officeNumber} の都道府県情報が設定されていません。事業所マスタで都道府県を設定してください。`
              );
            }
          } else {
            console.warn(
              `事業所 ${officeNumber} が事業所マスタに見つかりません。`
            );
          }
        } else {
          this.form.patchValue({ prefecture: 'tokyo' }, { emitEvent: false });
        }
      });
  }

  async ngOnInit(): Promise<void> {
    // 事業所一覧を読み込み
    await this.loadOffices();

    // 家族情報フォームを初期化
    this.initializeFamilyForm();
  }

  initializeFamilyForm(): void {
    this.familyForm = this.fb.group({
      name: ['', Validators.required],
      birthDate: ['', Validators.required],
      relationship: ['', Validators.required],
      livingTogether: [true],
      expectedIncome: [null],
      isThirdCategory: [false],
      supportStartDate: [''],
      supportEndDate: [''],
      changeDate: [''],
    });
  }

  async loadOffices(): Promise<void> {
    this.offices = await this.officeService.getAllOffices();
  }

  updateAutoDetection(): void {
    const value = this.form.value;

    if (!value.birthDate) {
      this.eligibilityStatus = '';
      this.ageInfo = '';
      this.insuranceStatus = { health: '', care: '', pension: '' };
      return;
    }

    // 年齢計算（SalaryCalculationServiceを使用）
    const age = this.salaryCalculationService.calculateAge(value.birthDate);
    this.ageInfo = `${age}歳`;

    // 年齢到達による保険料停止判定
    if (age >= 75) {
      this.insuranceStatus.health = '停止（75歳以上）';
      this.insuranceStatus.care = '停止（75歳以上）';
      this.insuranceStatus.pension =
        age >= 70 ? '停止（70歳以上）' : '加入可能';
    } else if (age >= 70) {
      this.insuranceStatus.health = '加入可能';
      this.insuranceStatus.care =
        age >= 65 ? '第1号被保険者' : age >= 40 ? 'あり（40〜64歳）' : 'なし';
      this.insuranceStatus.pension = '停止（70歳以上）';
    } else if (age >= 65) {
      this.insuranceStatus.health = '加入可能';
      this.insuranceStatus.care = '第1号被保険者';
      this.insuranceStatus.pension = '加入可能';
    } else if (age >= 40) {
      this.insuranceStatus.health = '加入可能';
      this.insuranceStatus.care = 'あり（40〜64歳）';
      this.insuranceStatus.pension = '加入可能';
    } else {
      this.insuranceStatus.health = '加入可能';
      this.insuranceStatus.care = 'なし';
      this.insuranceStatus.pension = '加入可能';
    }

    // 加入判定（EmployeeEligibilityServiceを使用）
    if (
      value.joinDate &&
      value.weeklyHours !== null &&
      value.weeklyHours !== undefined
    ) {
      const workInfo = {
        weeklyHours: value.weeklyHours,
        monthlyWage: value.monthlyWage,
        expectedEmploymentMonths: value.expectedEmploymentMonths,
        isStudent: value.isStudent,
      };

      const tempEmployee: Partial<Employee> = {
        birthDate: value.birthDate,
        joinDate: value.joinDate,
        retireDate: value.retireDate,
        isShortTime: value.isShortTime,
        weeklyHours: value.weeklyHours,
        monthlyWage: value.monthlyWage,
        expectedEmploymentMonths: value.expectedEmploymentMonths,
        isStudent: value.isStudent,
      };

      const eligibility = this.employeeEligibilityService.checkEligibility(
        tempEmployee as Employee,
        workInfo
      );

      if (eligibility.candidateFlag) {
        this.eligibilityStatus = '加入候補者（3ヶ月連続で実働20時間以上）';
      } else if (
        eligibility.healthInsuranceEligible ||
        eligibility.pensionEligible
      ) {
        if (
          value.isShortTime ||
          (value.weeklyHours >= 20 && value.weeklyHours < 30)
        ) {
          this.eligibilityStatus = '短時間対象（加入対象）';
        } else {
          this.eligibilityStatus = '加入対象';
        }
      } else {
        this.eligibilityStatus = '非対象';
      }
    } else {
      this.eligibilityStatus = '';
    }
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
  }

  onCheckboxChange(fieldName: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const isChecked = checkbox.checked;

    // チェックが入った場合、今日の日付を設定
    if (isChecked) {
      const today = new Date().toISOString().split('T')[0];
      const dateFieldName = `${fieldName}Date`;
      this.form.patchValue({
        [dateFieldName]: today,
      });
    } else {
      // チェックが外れた場合、日付も削除
      const dateFieldName = `${fieldName}Date`;
      this.form.patchValue({
        [dateFieldName]: null,
      });
    }
  }

  async onSubmit(): Promise<void> {
    this.validateDates();
    if (this.errorMessages.length > 0) {
      return;
    }
    if (!this.form.valid) {
      return;
    }

    const value = this.form.value;

    const employee: any = {
      name: value.name,
      birthDate: value.birthDate,
      joinDate: value.joinDate,
      isShortTime: value.isShortTime ?? false,
      prefecture: value.prefecture || 'tokyo',
      isStudent: value.isStudent ?? false,
      childcareNotificationSubmitted:
        value.childcareNotificationSubmitted ?? false,
      childcareLivingTogether: value.childcareLivingTogether ?? false,
    };

    // 値がある場合のみ追加（undefinedを除外）
    if (value.nameKana) employee.nameKana = value.nameKana;
    if (value.gender) employee.gender = value.gender;
    if (value.address) employee.address = value.address;
    if (value.myNumber) employee.myNumber = value.myNumber;
    if (value.basicPensionNumber)
      employee.basicPensionNumber = value.basicPensionNumber;
    if (value.employmentType) employee.employmentType = value.employmentType;
    if (value.officeNumber) employee.officeNumber = value.officeNumber;
    if (value.department) employee.department = value.department;
    if (value.retireDate) employee.retireDate = value.retireDate;
    if (value.healthInsuranceAcquisitionDate)
      employee.healthInsuranceAcquisitionDate =
        value.healthInsuranceAcquisitionDate;
    if (value.pensionAcquisitionDate)
      employee.pensionAcquisitionDate = value.pensionAcquisitionDate;
    if (value.healthInsuranceLossDate)
      employee.healthInsuranceLossDate = value.healthInsuranceLossDate;
    if (value.pensionLossDate) employee.pensionLossDate = value.pensionLossDate;
    if (value.weeklyHours) employee.weeklyHours = value.weeklyHours;
    if (value.monthlyWage) employee.monthlyWage = value.monthlyWage;
    if (value.expectedEmploymentMonths)
      employee.expectedEmploymentMonths = value.expectedEmploymentMonths;
    if (value.leaveOfAbsenceStart)
      employee.leaveOfAbsenceStart = value.leaveOfAbsenceStart;
    if (value.leaveOfAbsenceEnd)
      employee.leaveOfAbsenceEnd = value.leaveOfAbsenceEnd;
    if (value.returnFromLeaveDate)
      employee.returnFromLeaveDate = value.returnFromLeaveDate;
    if (value.expectedDeliveryDate)
      employee.expectedDeliveryDate = value.expectedDeliveryDate;
    if (value.maternityLeaveStart)
      employee.maternityLeaveStart = value.maternityLeaveStart;
    if (value.maternityLeaveEndExpected)
      employee.maternityLeaveEndExpected = value.maternityLeaveEndExpected;
    if (value.actualDeliveryDate)
      employee.actualDeliveryDate = value.actualDeliveryDate;
    if (value.maternityLeaveEnd)
      employee.maternityLeaveEnd = value.maternityLeaveEnd;
    if (value.childcareChildName)
      employee.childcareChildName = value.childcareChildName;
    if (value.childcareChildBirthDate)
      employee.childcareChildBirthDate = value.childcareChildBirthDate;
    if (value.childcareLeaveStart)
      employee.childcareLeaveStart = value.childcareLeaveStart;
    if (value.childcareLeaveEndExpected)
      employee.childcareLeaveEndExpected = value.childcareLeaveEndExpected;
    if (value.childcareLeaveEnd)
      employee.childcareLeaveEnd = value.childcareLeaveEnd;
    if (value.sickPayApplicationRequest !== undefined)
      employee.sickPayApplicationRequest = value.sickPayApplicationRequest;
    if (value.sickPayApplicationRequestDate)
      employee.sickPayApplicationRequestDate =
        value.sickPayApplicationRequestDate;
    if (value.childcareEmployerCertificateRequest !== undefined)
      employee.childcareEmployerCertificateRequest =
        value.childcareEmployerCertificateRequest;
    if (value.childcareEmployerCertificateRequestDate)
      employee.childcareEmployerCertificateRequestDate =
        value.childcareEmployerCertificateRequestDate;
    if (value.maternityAllowanceApplicationRequest !== undefined)
      employee.maternityAllowanceApplicationRequest =
        value.maternityAllowanceApplicationRequest;
    if (value.maternityAllowanceApplicationRequestDate)
      employee.maternityAllowanceApplicationRequestDate =
        value.maternityAllowanceApplicationRequestDate;

    // 従業員を登録
    const newEmployeeId = await this.employeeService.addEmployee(employee);

    // 家族情報を保存（登録済みの家族情報がある場合）
    if (this.familyMembers.length > 0 && newEmployeeId) {
      for (const member of this.familyMembers) {
        const familyMember: FamilyMember = {
          ...member,
          employeeId: newEmployeeId,
        };
        await this.familyMemberService.saveFamilyMember(familyMember);
      }
    }

    this.router.navigate(['/employees']);
  }

  // 家族情報関連メソッド
  async loadFamilyMembers(): Promise<void> {
    if (!this.employeeId) return;
    this.familyMembers =
      await this.familyMemberService.getFamilyMembersByEmployeeId(
        this.employeeId
      );
    this.supportReviewAlerts = this.familyMemberService.getSupportReviewAlerts(
      this.familyMembers
    );
  }

  showAddFamilyForm(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.familyForm) {
      this.initializeFamilyForm();
    }
    this.editingFamilyMember = null;
    this.familyForm.reset({
      livingTogether: true,
      isThirdCategory: false,
    });
    this.showFamilyForm = true;
  }

  showEditFamilyForm(member: FamilyMember, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.familyForm) {
      this.initializeFamilyForm();
    }
    this.editingFamilyMember = member;
    this.familyForm.patchValue({
      name: member.name,
      birthDate: member.birthDate,
      relationship: member.relationship,
      livingTogether: member.livingTogether,
      expectedIncome: member.expectedIncome || null,
      isThirdCategory: member.isThirdCategory,
      supportStartDate: member.supportStartDate || '',
      supportEndDate: member.supportEndDate || '',
      changeDate: member.changeDate || '',
    });
    this.showFamilyForm = true;
  }

  cancelFamilyForm(): void {
    this.showFamilyForm = false;
    this.editingFamilyMember = null;
    this.familyForm.reset();
  }

  async saveFamilyMember(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.familyForm || !this.familyForm.valid) {
      alert('必須項目を入力してください');
      return;
    }

    try {
      const value = this.familyForm.value;
      const familyMember: FamilyMember = {
        id: this.editingFamilyMember?.id,
        employeeId: '', // 従業員登録前は空（登録後に設定）
        name: value.name,
        birthDate: value.birthDate,
        relationship: value.relationship,
        livingTogether: value.livingTogether,
        expectedIncome: value.expectedIncome || null,
        isThirdCategory: value.isThirdCategory,
        supportStartDate: value.supportStartDate || undefined,
        supportEndDate: value.supportEndDate || undefined,
        changeDate: value.changeDate || undefined,
      };

      // 従業員がまだ登録されていない場合は、一時的に配列に保存
      if (!this.employeeId) {
        if (this.editingFamilyMember) {
          const index = this.familyMembers.findIndex(
            (m) => m.id === this.editingFamilyMember?.id
          );
          if (index >= 0) {
            this.familyMembers[index] = familyMember;
          }
        } else {
          // 一時IDを設定
          familyMember.id = `temp_${Date.now()}`;
          this.familyMembers.push(familyMember);
        }
        this.cancelFamilyForm();
        alert('家族情報を追加しました（従業員登録時に保存されます）');
        return;
      }

      // 従業員が登録済みの場合は、Firestoreに保存
      familyMember.employeeId = this.employeeId;
      const savedId = await this.familyMemberService.saveFamilyMember(
        familyMember
      );
      familyMember.id = savedId;

      // 履歴を保存
      if (value.changeDate) {
        await this.familyMemberService.saveFamilyMemberHistory({
          familyMemberId: savedId,
          employeeId: this.employeeId,
          changeDate: value.changeDate,
          changeType: this.editingFamilyMember ? 'update' : 'start',
          newValue: familyMember,
          createdAt: new Date(),
        });
      }

      await this.loadFamilyMembers();
      this.cancelFamilyForm();
      alert('家族情報を保存しました');
    } catch (error) {
      console.error('家族情報の保存エラー:', error);
      alert('家族情報の保存に失敗しました: ' + (error as Error).message);
    }
  }

  async deleteFamilyMember(memberId: string, event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!confirm('この家族情報を削除しますか？')) return;

    // 従業員がまだ登録されていない場合は、配列から削除
    if (!this.employeeId) {
      this.familyMembers = this.familyMembers.filter((m) => m.id !== memberId);
      return;
    }

    // 従業員が登録済みの場合は、Firestoreから削除
    await this.familyMemberService.deleteFamilyMember(memberId);
    await this.loadFamilyMembers();
  }

  getFamilyMemberAge(birthDate: string): number {
    return this.familyMemberService.calculateAge(birthDate);
  }

  /**
   * 年金区分を取得（20歳未満は「-」）
   */
  getPensionCategory(member: FamilyMember): string {
    const age = this.getFamilyMemberAge(member.birthDate);
    if (age < 20) {
      return '-';
    }
    return member.isThirdCategory ? '第3号' : '第2号';
  }

  /**
   * 満18歳になった年度末（高校卒業日）を取得
   */
  getAge18Date(birthDate: string): string {
    if (!birthDate) return '-';
    const birth = new Date(birthDate);
    // 満18歳になる年を計算
    const age18Year = birth.getFullYear() + 18;
    // その年の3月31日（年度末）を返す
    return `${age18Year}-03-31`;
  }

  /**
   * 満22歳になった年度末（大学卒業日）を取得
   */
  getAge22Date(birthDate: string): string {
    if (!birthDate) return '-';
    const birth = new Date(birthDate);
    // 満22歳になる年を計算
    const age22Year = birth.getFullYear() + 22;
    // その年の3月31日（年度末）を返す
    return `${age22Year}-03-31`;
  }
}
