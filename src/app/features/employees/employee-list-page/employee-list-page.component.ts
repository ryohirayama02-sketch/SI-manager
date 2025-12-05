import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../../services/employee.service';
import { EmployeeEligibilityService, EmployeeEligibilityResult } from '../../../services/employee-eligibility.service';
import { MonthlySalaryService } from '../../../services/monthly-salary.service';
import { SettingsService } from '../../../services/settings.service';
import { SalaryCalculationService } from '../../../services/salary-calculation.service';
import { EmployeeLifecycleService } from '../../../services/employee-lifecycle.service';
import { Employee } from '../../../models/employee.model';

interface EmployeeDisplayInfo {
  employee: Employee;
  eligibility: EmployeeEligibilityResult;
  currentMonthPremium: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    total: number;
  } | null;
  notes: string[]; // 備考欄用
  standardMonthlyRemuneration: number | null; // 標準報酬月額（月次給与データから計算）
  grade: number | null; // 等級
  leaveStatus?: {
    status: 'maternity' | 'childcare' | 'leave' | 'none';
    startDate: string | null;
    endDate: string | null;
  };
  hasCollectionImpossibleAlert?: boolean;
}

@Component({
  selector: 'app-employee-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-list-page.component.html',
  styleUrl: './employee-list-page.component.css'
})
export class EmployeeListPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  employeeDisplayInfos: EmployeeDisplayInfo[] = [];
  
  // タブ管理
  activeTab: 'all' | 'onLeave' = 'all';
  
  // フィルター用
  filterName: string = '';
  filterEligibilityStatus: string = ''; // 'all' | 'eligible' | 'short-time' | 'non-eligible' | 'candidate'

  // Firestore購読用
  employeesSubscription: Subscription | null = null;

  // 月次保険料サマリー（従業員IDをキーとする）
  monthlyPremiumSummary: {
    [employeeId: string]: {
      healthEmployee: number;
      healthEmployer: number;
      careEmployee: number;
      careEmployer: number;
      pensionEmployee: number;
      pensionEmployer: number;
      total: number;
    };
  } = {};

  // 表示対象の年月（先月）
  currentYear: number;
  currentMonth: number;

  // 加入判定の説明辞書
  eligibilityDescriptions: { [key: string]: string } = {
    eligible: '社会保険の加入対象です',
    shortTime: '短時間労働者（一定要件を満たせば加入）',
    nonEligible: '社会保険の加入対象外です',
    candidate: '加入要件を満たす可能性があります',
  };

  constructor(
    private employeeService: EmployeeService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private salaryCalculationService: SalaryCalculationService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private router: Router
  ) {
    // 先月の年月を計算
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    this.currentYear = lastMonth.getFullYear();
    this.currentMonth = lastMonth.getMonth() + 1;
  }

  async ngOnInit(): Promise<void> {
    await this.reloadEmployees();
    this.employeesSubscription = this.employeeService.observeEmployees().subscribe(() => {
      this.reloadEmployees();
    });
  }

  async reloadEmployees(): Promise<void> {
    this.employees = await this.employeeService.getEmployees();
    await this.loadEmployeeDisplayInfos();
  }

  ngOnDestroy(): void {
    this.employeesSubscription?.unsubscribe();
  }

  async loadEmployeeDisplayInfos(): Promise<void> {
    // 標準報酬月額テーブルを取得（料率はSalaryCalculationService内で取得される）
    const gradeTable = await this.settingsService.getStandardTable(this.currentYear);

    this.employeeDisplayInfos = [];

    for (const emp of this.employees) {
      // 加入判定
      const workInfo = {
        weeklyHours: emp.weeklyHours,
        monthlyWage: emp.monthlyWage,
        expectedEmploymentMonths: emp.expectedEmploymentMonths,
        isStudent: emp.isStudent,
        consecutiveMonthsOver20Hours: emp.consecutiveMonthsOver20Hours,
      };
      const eligibility = this.employeeEligibilityService.checkEligibility(
        emp,
        workInfo
      );

      // 当月の保険料を計算
      // 注: payment-summary-calculation.service.tsは全従業員の年間データを計算するサービスで、
      // 従業員一覧画面で当月だけを取得するには重いため、SalaryCalculationServiceを直接使用
      // 重要：標準報酬月額が確定している場合は、給与が0円でも保険料を計算する
      let currentMonthPremium = null;
      let standardMonthlyRemuneration: number | null = null;
      let grade: number | null = null;
      
      try {
        const salaryData = await this.monthlySalaryService.getEmployeeSalary(
          emp.id,
          this.currentYear
        );
        
        let fixedSalary = 0;
        let variableSalary = 0;
        
        if (salaryData) {
          const monthKey = this.currentMonth.toString();
          const monthData = salaryData[monthKey];
          
          if (monthData) {
            fixedSalary = monthData.fixedTotal ?? monthData.fixed ?? monthData.fixedSalary ?? 0;
            variableSalary = monthData.variableTotal ?? monthData.variable ?? monthData.variableSalary ?? 0;
            const totalSalary = fixedSalary + variableSalary;
            
            // 標準報酬月額と等級を計算（給与がある場合のみ）
            if (totalSalary > 0 && gradeTable.length > 0) {
              const gradeResult = this.salaryCalculationService.findGrade(gradeTable, totalSalary);
              if (gradeResult) {
                standardMonthlyRemuneration = gradeResult.remuneration;
                grade = gradeResult.grade;
              }
            }
          }
        }
        
        // 標準報酬月額が確定している場合は、給与が0円でも保険料を計算
        // 標準報酬月額は、従業員データのstandardMonthlyRemunerationまたはacquisitionStandardから取得される
        const premiums = await this.salaryCalculationService.calculateMonthlyPremiums(
          emp,
          this.currentYear,
          this.currentMonth,
          fixedSalary,
          variableSalary,
          gradeTable
        );
        
        currentMonthPremium = {
          healthEmployee: premiums.health_employee,
          healthEmployer: premiums.health_employer,
          careEmployee: premiums.care_employee,
          careEmployer: premiums.care_employer,
          pensionEmployee: premiums.pension_employee,
          pensionEmployer: premiums.pension_employer,
          total: premiums.health_employee + premiums.health_employer +
                 premiums.care_employee + premiums.care_employer +
                 premiums.pension_employee + premiums.pension_employer,
        };
        
        // monthlyPremiumSummaryにも格納
        this.monthlyPremiumSummary[emp.id] = {
          healthEmployee: premiums.health_employee,
          healthEmployer: premiums.health_employer,
          careEmployee: premiums.care_employee,
          careEmployer: premiums.care_employer,
          pensionEmployee: premiums.pension_employee,
          pensionEmployer: premiums.pension_employer,
          total: premiums.health_employee + premiums.health_employer +
                 premiums.care_employee + premiums.care_employer +
                 premiums.pension_employee + premiums.pension_employer,
        };
      } catch (error) {
        console.error(`従業員 ${emp.id} の保険料計算エラー:`, error);
      }

      // 備考欄の生成
      const notes: string[] = [];
      
      // 加入候補者アラート
      if (eligibility.candidateFlag) {
        notes.push('⚠️ 加入候補者（3ヶ月連続で実働20時間以上）');
      }
      
      // 年齢到達による停止・変更（Service統一ロジックを使用）
      const age = this.salaryCalculationService.calculateAge(emp.birthDate);
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;
      const careType = this.salaryCalculationService.getCareInsuranceType(emp.birthDate, currentYear, currentMonth);
      
      if (age >= 75) {
        notes.push('75歳到達により健康保険・介護保険停止');
      } else if (age >= 70) {
        notes.push('70歳到達により厚生年金停止');
      } else if (careType === 'type1') {
        notes.push('65歳到達により介護保険第1号被保険者');
      } else if (careType === 'type2') {
        notes.push('40歳到達により介護保険第2号被保険者');
      }
      
      // 産休・育休中（現時点で期間中かどうかを判定）
      const now = new Date();
      const nowYear = now.getFullYear();
      const nowMonth = now.getMonth() + 1;
      const currentLeaveStatus = this.getLeaveStatusForMonth(emp, nowYear, nowMonth);
      
      if (currentLeaveStatus.status === 'maternity') {
        notes.push('産休中');
      } else if (currentLeaveStatus.status === 'childcare') {
        notes.push('育休中');
      }
      
      // 退職済み
      if (emp.retireDate) {
        const retireDate = new Date(emp.retireDate);
        if (retireDate <= new Date()) {
          notes.push('退職済み');
        }
      }
      
      // 休職中の判定（先月の状態をチェック）
      if (emp.returnFromLeaveDate) {
        const returnDate = new Date(emp.returnFromLeaveDate);
        const lastMonthDate = new Date(this.currentYear, this.currentMonth - 1, 1);
        returnDate.setHours(0, 0, 0, 0);
        lastMonthDate.setHours(0, 0, 0, 0);
        
        // 復職日が先月より未来なら休職中
        if (returnDate > lastMonthDate) {
          const returnDateStart = new Date(returnDate);
          returnDateStart.setDate(1); // 復職日の月初日
          
          // 復職日が先月より未来なら休職中
          if (returnDateStart > lastMonthDate) {
            notes.push('休職中');
          }
        }
      }

      // 休業情報を取得
      const leaveStatus = this.getCurrentLeaveStatus(emp);
      const hasCollectionImpossibleAlert = await this.hasCollectionImpossibleAlert(emp);

      this.employeeDisplayInfos.push({
        employee: emp,
        eligibility,
        currentMonthPremium,
        notes,
        standardMonthlyRemuneration,
        grade,
        leaveStatus,
        hasCollectionImpossibleAlert,
      });
    }
  }

  getEligibilityStatusLabel(info: EmployeeDisplayInfo): string {
    if (info.eligibility.candidateFlag) {
      return '加入候補';
    }
    if (info.eligibility.healthInsuranceEligible || info.eligibility.pensionEligible) {
      if (info.employee.isShortTime || (info.employee.weeklyHours && info.employee.weeklyHours >= 20 && info.employee.weeklyHours < 30)) {
        return '短時間対象';
      }
      return '加入対象';
    }
    return '非対象';
  }

  getEligibilityCategory(info: EmployeeDisplayInfo): string {
    if (info.eligibility.candidateFlag) {
      return 'candidate';
    }
    if (info.eligibility.healthInsuranceEligible || info.eligibility.pensionEligible) {
      if (info.employee.isShortTime || (info.employee.weeklyHours && info.employee.weeklyHours >= 20 && info.employee.weeklyHours < 30)) {
        return 'shortTime';
      }
      return 'eligible';
    }
    return 'nonEligible';
  }

  isCandidate(info: EmployeeDisplayInfo): boolean {
    return info.eligibility.candidateFlag === true;
  }

  getStandardMonthlyRemunerationDisplay(info: EmployeeDisplayInfo): string {
    // 月次給与データから計算した標準報酬月額を優先表示
    if (info.standardMonthlyRemuneration && info.standardMonthlyRemuneration > 0) {
      const gradeText = info.grade ? `（${info.grade}等級）` : '';
      return `${info.standardMonthlyRemuneration.toLocaleString('ja-JP')}円${gradeText}`;
    }
    
    // 資格取得時決定の標準報酬月額
    if (info.employee.acquisitionStandard) {
      return `${info.employee.acquisitionStandard.toLocaleString('ja-JP')}円（資格取得時決定）`;
    }
    
    // 通常の標準報酬月額（従業員データに保存されている値）
    if (info.employee.standardMonthlyRemuneration) {
      return `${info.employee.standardMonthlyRemuneration.toLocaleString('ja-JP')}円`;
    }
    
    return '-';
  }

  getHealthInsuranceStatus(info: EmployeeDisplayInfo): string {
    if (info.eligibility.ageFlags.isNoHealth) {
      return '停止（75歳以上）';
    }
    if (info.eligibility.healthInsuranceEligible) {
      return '加入';
    }
    return '未加入';
  }

  getCareInsuranceStatus(info: EmployeeDisplayInfo): string {
    const emp = info.employee;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const careType = this.salaryCalculationService.getCareInsuranceType(emp.birthDate, currentYear, currentMonth);
    
    if (careType === 'none') {
      // 75歳以上または39歳以下
      if (info.eligibility.ageFlags.isNoHealth) {
        return '停止（75歳以上）';
      }
      return 'なし';
    } else if (careType === 'type1') {
      return '第1号被保険者';
    } else if (careType === 'type2') {
      return 'あり（40〜64歳）';
    }
    return 'なし';
  }

  getPensionStatus(info: EmployeeDisplayInfo): string {
    if (info.eligibility.ageFlags.isNoPension) {
      return '停止（70歳以上）';
    }
    if (info.eligibility.pensionEligible) {
      return '加入';
    }
    return '未加入';
  }

  /**
   * 指定年月における休業ステータスを取得
   */
  getLeaveStatusForMonth(employee: Employee, year: number, month: number): {
    status: 'maternity' | 'childcare' | 'leave' | 'none';
    startDate: string | null;
    endDate: string | null;
  } {
    const targetDate = new Date(year, month - 1, 1);
    const targetEndDate = new Date(year, month, 0); // その月の最終日

    // 産前産後休業中
    if (employee.maternityLeaveStart && employee.maternityLeaveEnd) {
      const start = new Date(employee.maternityLeaveStart);
      const end = new Date(employee.maternityLeaveEnd);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      if (targetDate <= end && targetEndDate >= start) {
        return {
          status: 'maternity',
          startDate: employee.maternityLeaveStart,
          endDate: employee.maternityLeaveEnd
        };
      }
    }

    // 育児休業中
    if (employee.childcareLeaveStart && employee.childcareLeaveEnd) {
      const start = new Date(employee.childcareLeaveStart);
      const end = new Date(employee.childcareLeaveEnd);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      if (targetDate <= end && targetEndDate >= start) {
        return {
          status: 'childcare',
          startDate: employee.childcareLeaveStart,
          endDate: employee.childcareLeaveEnd
        };
      }
    }

    // 無給休職中（leaveOfAbsenceStart と leaveOfAbsenceEnd の期間内）
    if (employee.leaveOfAbsenceStart && employee.leaveOfAbsenceEnd) {
      const start = new Date(employee.leaveOfAbsenceStart);
      const end = new Date(employee.leaveOfAbsenceEnd);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      if (targetDate <= end && targetEndDate >= start) {
        return {
          status: 'leave',
          startDate: employee.leaveOfAbsenceStart,
          endDate: employee.leaveOfAbsenceEnd
        };
      }
    }

    // 無給休職中（returnFromLeaveDate が未来の場合）
    if (employee.returnFromLeaveDate) {
      const returnDate = new Date(employee.returnFromLeaveDate);
      returnDate.setHours(0, 0, 0, 0);
      const targetDateStart = new Date(year, month - 1, 1);
      if (returnDate > targetDateStart) {
        return {
          status: 'leave',
          startDate: employee.leaveOfAbsenceStart || null,
          endDate: employee.returnFromLeaveDate
        };
      }
    }

    return { status: 'none', startDate: null, endDate: null };
  }

  /**
   * 先月の休業ステータスを取得（保険料表示用）
   */
  getCurrentLeaveStatus(employee: Employee): {
    status: 'maternity' | 'childcare' | 'leave' | 'none';
    startDate: string | null;
    endDate: string | null;
  } {
    // 先月の状態を返す（保険料表示と一致させるため）
    return this.getLeaveStatusForMonth(employee, this.currentYear, this.currentMonth);
  }

  /**
   * 休業ステータスのラベルを取得
   */
  getLeaveStatusLabel(status: 'maternity' | 'childcare' | 'leave' | 'none'): string {
    switch (status) {
      case 'maternity':
        return '産休中';
      case 'childcare':
        return '育休中';
      case 'leave':
        return '休職中';
      default:
        return '-';
    }
  }

  /**
   * 徴収不能アラートがあるかチェック（先月のデータをチェック）
   */
  async hasCollectionImpossibleAlert(employee: Employee): Promise<boolean> {
    // 無給休職中の場合（先月の状態をチェック）
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = lastMonth.getFullYear();
    const lastMonthMonth = lastMonth.getMonth() + 1;
    const leaveStatus = this.getLeaveStatusForMonth(employee, lastMonthYear, lastMonthMonth);
    if (leaveStatus.status === 'leave') {
      return true;
    }

    // 給与 < 本人負担保険料の月があるかチェック（先月のデータをチェック）
    try {
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(employee.id, this.currentYear);
      if (!salaryData) return false;

      const monthKey = this.currentMonth.toString();
      const monthData = salaryData[monthKey];
      if (!monthData) return false;

      const totalSalary = monthData.totalSalary ?? monthData.total ?? 0;
      if (totalSalary === 0) return true; // 無給の場合は徴収不能

      // 保険料を計算
      const gradeTable = await this.settingsService.getStandardTable(this.currentYear);
      const fixedSalary = monthData.fixedSalary ?? monthData.fixed ?? 0;
      const variableSalary = monthData.variableSalary ?? monthData.variable ?? 0;

      if (fixedSalary > 0 || variableSalary > 0) {
        const premiums = await this.salaryCalculationService.calculateMonthlyPremiums(
          employee,
          this.currentYear,
          this.currentMonth,
          fixedSalary,
          variableSalary,
          gradeTable
        );

        const totalEmployeePremium = premiums.health_employee + premiums.care_employee + premiums.pension_employee;
        if (totalSalary < totalEmployeePremium) {
          return true;
        }
      }
    } catch (error) {
      console.error(`従業員 ${employee.id} の徴収不能チェックエラー:`, error);
    }

    return false;
  }

  /**
   * 休業中かどうかを判定する
   */
  isOnLeave(employee: Employee): boolean {
    const leaveStatus = this.getCurrentLeaveStatus(employee);
    return leaveStatus.status !== 'none';
  }

  /**
   * 休業者の一覧を取得
   */
  getOnLeaveEmployees(): EmployeeDisplayInfo[] {
    return this.employeeDisplayInfos.filter((info) => this.isOnLeave(info.employee));
  }

  getFilteredEmployees(): EmployeeDisplayInfo[] {
    // タブに応じてフィルタリング
    let targetInfos: EmployeeDisplayInfo[];
    if (this.activeTab === 'onLeave') {
      targetInfos = this.getOnLeaveEmployees();
    } else {
      targetInfos = this.employeeDisplayInfos;
    }

    return targetInfos.filter((info) => {
      // 名前フィルター
      if (this.filterName && !info.employee.name.includes(this.filterName)) {
        return false;
      }

      // 対象区分フィルター
      if (this.filterEligibilityStatus && this.filterEligibilityStatus !== 'all') {
        const status = this.getEligibilityStatusLabel(info);
        if (this.filterEligibilityStatus === 'eligible' && status !== '加入対象') {
          return false;
        }
        if (this.filterEligibilityStatus === 'short-time' && status !== '短時間対象') {
          return false;
        }
        if (this.filterEligibilityStatus === 'non-eligible' && status !== '非対象') {
          return false;
        }
        if (this.filterEligibilityStatus === 'candidate' && status !== '加入候補') {
          return false;
        }
      }

      return true;
    });
  }

  goDetail(id: string): void {
    this.router.navigate(['/employees', id, 'edit']);
  }

  goCreate(): void {
    this.router.navigate(['/employees/new']);
  }

  /**
   * 従業員の年齢を取得
   */
  getAge(employee: Employee): number {
    return this.salaryCalculationService.calculateAge(employee.birthDate);
  }
}


