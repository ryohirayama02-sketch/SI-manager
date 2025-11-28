import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../../services/employee.service';
import { EmployeeLifecycleService } from '../../../services/employee-lifecycle.service';
import { EmployeeEligibilityService } from '../../../services/employee-eligibility.service';
import { SalaryCalculationService } from '../../../services/salary-calculation.service';
import { MonthlySalaryService } from '../../../services/monthly-salary.service';
import { SettingsService } from '../../../services/settings.service';
import { SuijiService } from '../../../services/suiji.service';
import { FamilyMemberService } from '../../../services/family-member.service';
import { StandardRemunerationHistoryService } from '../../../services/standard-remuneration-history.service';
import { Employee } from '../../../models/employee.model';
import { FamilyMember } from '../../../models/family-member.model';
import { StandardRemunerationHistory, InsuranceStatusHistory } from '../../../models/standard-remuneration-history.model';

@Component({
  selector: 'app-employee-edit-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './employee-edit-page.component.html',
  styleUrl: './employee-edit-page.component.css'
})
export class EmployeeEditPageComponent implements OnInit, OnDestroy {
  employeeId: string | null = null;
  form: any;
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
  
  // 標準報酬履歴（read-only）
  standardMonthlyRemunerationHistory: string = '';
  currentStandardMonthlyRemuneration: number | null = null;
  determinationReason: string = '';
  lastTeijiKetteiYear: number | null = null;
  lastTeijiKetteiMonth: number | null = null;
  lastSuijiKetteiYear: number | null = null;
  lastSuijiKetteiMonth: number | null = null;

  // 加入区分購読用
  eligibilitySubscription: Subscription | null = null;

  // タブ管理
  activeTab: 'basic' | 'family' | 'history' = 'basic';

  // 家族情報関連
  familyMembers: FamilyMember[] = [];
  showFamilyForm: boolean = false;
  editingFamilyMember: FamilyMember | null = null;
  familyForm: any;
  supportReviewAlerts: FamilyMember[] = [];

  // 標準報酬履歴・社保加入履歴関連
  standardRemunerationHistories: StandardRemunerationHistory[] = [];
  insuranceStatusHistories: InsuranceStatusHistory[] = [];
  selectedHistoryYear: number = new Date().getFullYear();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private employeeService: EmployeeService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private salaryCalculationService: SalaryCalculationService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private suijiService: SuijiService,
    private familyMemberService: FamilyMemberService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService
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
      // 標準報酬関連（表示用）
      currentStandardMonthlyRemuneration: [null],
      determinationReason: [''],
      lastTeijiKetteiYear: [null],
      lastTeijiKetteiMonth: [null],
      lastSuijiKetteiYear: [null],
      lastSuijiKetteiMonth: [null],
      // 休職・産休・育休
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

    // フォーム値変更時に自動判定を実行
    this.form.valueChanges.subscribe(() => {
      this.updateAutoDetection();
    });
  }

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('id');
    if (!this.employeeId) return;

    const data = await this.employeeService.getEmployeeById(this.employeeId);
    if (data) {
      this.form.patchValue({
        // 個人情報
        name: data.name || '',
        nameKana: (data as any).nameKana || '',
        gender: (data as any).gender || '',
        birthDate: data.birthDate || '',
        address: (data as any).address || '',
        myNumber: (data as any).myNumber || '',
        basicPensionNumber: (data as any).basicPensionNumber || '',
        // 雇用条件
        employmentType: (data as any).employmentType || '',
        weeklyHours: data.weeklyHours || null,
        monthlyWage: data.monthlyWage || null,
        expectedEmploymentMonths: data.expectedEmploymentMonths || null,
        isStudent: data.isStudent || false,
        // 所属
        prefecture: data.prefecture || 'tokyo',
        officeNumber: (data as any).officeNumber || '',
        department: (data as any).department || '',
        // 入退社
        joinDate: data.joinDate || data.hireDate || '',
        retireDate: data.retireDate || '',
        healthInsuranceAcquisitionDate: (data as any).healthInsuranceAcquisitionDate || '',
        pensionAcquisitionDate: (data as any).pensionAcquisitionDate || '',
        healthInsuranceLossDate: (data as any).healthInsuranceLossDate || '',
        pensionLossDate: (data as any).pensionLossDate || '',
        // 標準報酬関連（表示用）
        currentStandardMonthlyRemuneration: data.standardMonthlyRemuneration || data.acquisitionStandard || null,
        determinationReason: (data as any).determinationReason || '',
        lastTeijiKetteiYear: (data as any).lastTeijiKetteiYear || null,
        lastTeijiKetteiMonth: (data as any).lastTeijiKetteiMonth || null,
        lastSuijiKetteiYear: (data as any).lastSuijiKetteiYear || null,
        lastSuijiKetteiMonth: (data as any).lastSuijiKetteiMonth || null,
        // 休職・産休・育休
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

      // 初期表示時に自動判定を実行
      this.updateAutoDetection();
      
      // 月次給与データから最新の標準報酬月額を取得
      await this.loadCurrentStandardMonthlyRemuneration();
      
      // 家族情報を読み込み
      await this.loadFamilyMembers();
      
      // 標準報酬履歴・社保加入履歴を読み込み
      await this.loadHistories();
    }

    // 家族情報フォームを初期化
    if (!this.familyForm) {
      this.familyForm = this.fb.group({
        name: ['', Validators.required],
        birthDate: ['', Validators.required],
        relationship: ['', Validators.required],
        livingTogether: [true],
        expectedIncome: [null],
        isThirdCategory: [false],
        supportStartDate: [''],
        supportEndDate: [''],
        changeDate: ['']
      });
    }

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService.observeEligibility().subscribe(() => {
      if (this.employeeId) {
        this.reloadEligibility();
      }
    });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  reloadEligibility(): void {
    // 加入区分を再計算して画面に反映
    this.updateAutoDetection();
  }

  async loadCurrentStandardMonthlyRemuneration(): Promise<void> {
    if (!this.employeeId) return;

    const currentYear = new Date().getFullYear();
    
    // 月次給与データを取得
    const salaryData = await this.monthlySalaryService.getEmployeeSalary(this.employeeId, currentYear);
    if (!salaryData) {
      // 月次給与データがない場合、従業員マスタの値を表示
      const data = await this.employeeService.getEmployeeById(this.employeeId);
      if (data?.acquisitionStandard) {
        this.currentStandardMonthlyRemuneration = data.acquisitionStandard;
        this.determinationReason = 'acquisition';
        this.standardMonthlyRemunerationHistory = `資格取得時決定: ${data.acquisitionStandard.toLocaleString('ja-JP')}円（等級${data.acquisitionGrade || '-'}）`;
      } else if (data?.standardMonthlyRemuneration) {
        this.currentStandardMonthlyRemuneration = data.standardMonthlyRemuneration;
        this.determinationReason = '';
        this.standardMonthlyRemunerationHistory = `標準報酬月額: ${data.standardMonthlyRemuneration.toLocaleString('ja-JP')}円`;
      } else {
        this.currentStandardMonthlyRemuneration = null;
        this.standardMonthlyRemunerationHistory = '未設定';
      }
      return;
    }

    // 給与データから標準報酬月額を計算
    const salaries: { [key: string]: { total: number; fixed: number; variable: number } } = {};
    for (let month = 1; month <= 12; month++) {
      const monthKey = month.toString();
      const monthData = salaryData[monthKey];
      if (monthData) {
        const key = this.salaryCalculationService.getSalaryKey(this.employeeId, month);
        salaries[key] = {
          total: monthData.totalSalary ?? monthData.total ?? 0,
          fixed: monthData.fixedSalary ?? monthData.fixed ?? 0,
          variable: monthData.variableSalary ?? monthData.variable ?? 0
        };
      }
    }

    // 標準報酬等級表を取得
    const gradeTable = await this.settingsService.getStandardTable(currentYear);
    
    // 定時決定を計算
    const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
      this.employeeId,
      salaries,
      gradeTable,
      currentYear
    );

    // 随時改定の情報を取得（最新の随時改定を確認）
    const years = [currentYear - 1, currentYear, currentYear + 1]; // 前年、当年、翌年を確認
    const suijiAlerts = await this.suijiService.loadAllAlerts(years);
    const employeeSuijiAlerts = suijiAlerts
      .filter((alert: any) => alert.employeeId === this.employeeId)
      .sort((a: any, b: any) => {
        // 年度と適用開始月でソート（新しい順）
        if (a.year !== b.year) return b.year - a.year;
        return b.applyStartMonth - a.applyStartMonth;
      });

    // 標準報酬月額を設定
    if (teijiResult.standardMonthlyRemuneration > 0) {
      this.currentStandardMonthlyRemuneration = teijiResult.standardMonthlyRemuneration;
      this.determinationReason = 'teiji';
      this.standardMonthlyRemunerationHistory = `定時決定: ${teijiResult.standardMonthlyRemuneration.toLocaleString('ja-JP')}円（等級${teijiResult.grade}）`;
      
      // 最終定時決定年月を設定（原則9月適用）
      this.lastTeijiKetteiYear = currentYear;
      this.lastTeijiKetteiMonth = 9;
    } else {
      // 定時決定ができない場合、従業員マスタの値を確認
      const data = await this.employeeService.getEmployeeById(this.employeeId);
      if (data?.acquisitionStandard) {
        this.currentStandardMonthlyRemuneration = data.acquisitionStandard;
        this.determinationReason = 'acquisition';
        this.standardMonthlyRemunerationHistory = `資格取得時決定: ${data.acquisitionStandard.toLocaleString('ja-JP')}円（等級${data.acquisitionGrade || '-'}）`;
      } else {
        this.currentStandardMonthlyRemuneration = null;
        this.determinationReason = '';
        this.standardMonthlyRemunerationHistory = '未設定';
      }
    }

    // 随時改定の情報を設定（最新の随時改定がある場合）
    if (employeeSuijiAlerts.length > 0) {
      const latestSuiji = employeeSuijiAlerts[0];
      this.lastSuijiKetteiYear = latestSuiji.year || currentYear;
      this.lastSuijiKetteiMonth = latestSuiji.applyStartMonth || null;
      
      // 随時改定が最新の場合、決定理由を随時改定に変更
      if (latestSuiji.year === currentYear && latestSuiji.applyStartMonth && latestSuiji.applyStartMonth >= 9) {
        this.determinationReason = 'suiji';
        this.standardMonthlyRemunerationHistory = `随時改定: ${this.currentStandardMonthlyRemuneration?.toLocaleString('ja-JP') || '未設定'}円（適用開始: ${latestSuiji.applyStartMonth}月）`;
      }
    }

    // フォームに反映
    this.form.patchValue({
      currentStandardMonthlyRemuneration: this.currentStandardMonthlyRemuneration,
      determinationReason: this.determinationReason,
      lastTeijiKetteiYear: this.lastTeijiKetteiYear,
      lastTeijiKetteiMonth: this.lastTeijiKetteiMonth,
      lastSuijiKetteiYear: this.lastSuijiKetteiYear,
      lastSuijiKetteiMonth: this.lastSuijiKetteiMonth
    });

    // 標準報酬関連フィールドを読み取り専用に設定
    this.form.get('determinationReason')?.disable();
    this.form.get('lastTeijiKetteiYear')?.disable();
    this.form.get('lastTeijiKetteiMonth')?.disable();
    this.form.get('lastSuijiKetteiYear')?.disable();
    this.form.get('lastSuijiKetteiMonth')?.disable();
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
      this.insuranceStatus.pension = age >= 70 ? '停止（70歳以上）' : '加入可能';
    } else if (age >= 70) {
      this.insuranceStatus.health = '加入可能';
      this.insuranceStatus.care = age >= 65 ? '第1号被保険者' : (age >= 40 ? 'あり（40〜64歳）' : 'なし');
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
    if (value.joinDate && value.weeklyHours !== null && value.weeklyHours !== undefined) {
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
      } else if (eligibility.healthInsuranceEligible || eligibility.pensionEligible) {
        if (value.isShortTime || (value.weeklyHours >= 20 && value.weeklyHours < 30)) {
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
  }

  async updateEmployee(): Promise<void> {
    this.validateDates();
    if (this.errorMessages.length > 0) {
      return;
    }
    if (!this.employeeId || !this.form.valid) return;

    const value = this.form.value;
    const updateData: any = {
      // 個人情報
      name: value.name,
      birthDate: value.birthDate,
      // 雇用条件
      employmentType: value.employmentType || '',
      weeklyHours: value.weeklyHours || null,
      monthlyWage: value.monthlyWage || null,
      expectedEmploymentMonths: value.expectedEmploymentMonths || null,
      isStudent: value.isStudent ?? false,
      // 所属
      prefecture: value.prefecture || 'tokyo',
      // 入退社
      joinDate: value.joinDate,
      isShortTime: value.isShortTime ?? false,
      childcareNotificationSubmitted: value.childcareNotificationSubmitted ?? false,
      childcareLivingTogether: value.childcareLivingTogether ?? false,
    };

    // 値がある場合のみ追加（undefinedを除外）
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
    this.router.navigate([`/employees/${this.employeeId}`]);
  }

  // 家族情報関連メソッド
  async loadFamilyMembers(): Promise<void> {
    if (!this.employeeId) return;
    this.familyMembers = await this.familyMemberService.getFamilyMembersByEmployeeId(this.employeeId);
    this.supportReviewAlerts = this.familyMemberService.getSupportReviewAlerts(this.familyMembers);
  }

  showAddFamilyForm(): void {
    this.editingFamilyMember = null;
    this.familyForm.reset({
      livingTogether: true,
      isThirdCategory: false
    });
    this.showFamilyForm = true;
  }

  showEditFamilyForm(member: FamilyMember): void {
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
      changeDate: member.changeDate || ''
    });
    this.showFamilyForm = true;
  }

  cancelFamilyForm(): void {
    this.showFamilyForm = false;
    this.editingFamilyMember = null;
    this.familyForm.reset();
  }

  async saveFamilyMember(): Promise<void> {
    if (!this.employeeId || !this.familyForm.valid) return;

    const value = this.familyForm.value;
    const familyMember: FamilyMember = {
      id: this.editingFamilyMember?.id,
      employeeId: this.employeeId,
      name: value.name,
      birthDate: value.birthDate,
      relationship: value.relationship,
      livingTogether: value.livingTogether,
      expectedIncome: value.expectedIncome || null,
      isThirdCategory: value.isThirdCategory,
      supportStartDate: value.supportStartDate || undefined,
      supportEndDate: value.supportEndDate || undefined,
      changeDate: value.changeDate || undefined
    };

    await this.familyMemberService.saveFamilyMember(familyMember);
    
    // 履歴を保存
    if (value.changeDate) {
      await this.familyMemberService.saveFamilyMemberHistory({
        familyMemberId: familyMember.id || '',
        employeeId: this.employeeId,
        changeDate: value.changeDate,
        changeType: this.editingFamilyMember ? 'update' : 'start',
        newValue: familyMember,
        createdAt: new Date()
      });
    }

    await this.loadFamilyMembers();
    this.cancelFamilyForm();
  }

  async deleteFamilyMember(memberId: string): Promise<void> {
    if (!confirm('この家族情報を削除しますか？')) return;
    await this.familyMemberService.deleteFamilyMember(memberId);
    await this.loadFamilyMembers();
  }

  getFamilyMemberAge(birthDate: string): number {
    return this.familyMemberService.calculateAge(birthDate);
  }

  // 標準報酬履歴・社保加入履歴関連メソッド
  async loadHistories(): Promise<void> {
    if (!this.employeeId) return;
    
    // 標準報酬履歴を読み込み
    this.standardRemunerationHistories = await this.standardRemunerationHistoryService.getStandardRemunerationHistories(this.employeeId);
    
    // 社保加入履歴を読み込み
    this.insuranceStatusHistories = await this.standardRemunerationHistoryService.getInsuranceStatusHistories(this.employeeId);
  }

  async generateHistories(): Promise<void> {
    if (!this.employeeId) return;
    
    const employee = await this.employeeService.getEmployeeById(this.employeeId);
    if (!employee) return;

    // 標準報酬履歴を自動生成
    await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(this.employeeId, employee);
    
    // 社保加入履歴を自動生成
    await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(this.employeeId, employee);
    
    await this.loadHistories();
    alert('履歴を自動生成しました');
  }

  getDeterminationReasonLabel(reason: string): string {
    switch (reason) {
      case 'acquisition': return '資格取得時決定';
      case 'teiji': return '定時決定';
      case 'suiji': return '随時改定';
      default: return reason;
    }
  }

  getInsuranceStatusLabel(status: string): string {
    switch (status) {
      case 'joined': return '加入';
      case 'lost': return '喪失';
      case 'exempt_maternity': return '免除（産休）';
      case 'exempt_childcare': return '免除（育休）';
      case 'type1': return '第1号被保険者';
      default: return status;
    }
  }

  getFilteredInsuranceHistories(): InsuranceStatusHistory[] {
    return this.insuranceStatusHistories.filter(h => h.year === this.selectedHistoryYear);
  }
}

