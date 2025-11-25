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

  // 現在の年月
  currentYear: number = new Date().getFullYear();
  currentMonth: number = new Date().getMonth() + 1;

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
  ) {}

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
      let currentMonthPremium = null;
      let standardMonthlyRemuneration: number | null = null;
      let grade: number | null = null;
      
      try {
        const salaryData = await this.monthlySalaryService.getEmployeeSalary(
          emp.id,
          this.currentYear
        );
        
        if (salaryData) {
          const monthKey = this.currentMonth.toString();
          const monthData = salaryData[monthKey];
          
          if (monthData) {
            const fixedSalary = monthData.fixedTotal ?? monthData.fixed ?? monthData.fixedSalary ?? 0;
            const variableSalary = monthData.variableTotal ?? monthData.variable ?? monthData.variableSalary ?? 0;
            const totalSalary = fixedSalary + variableSalary;
            
            // 標準報酬月額と等級を計算
            if (totalSalary > 0 && gradeTable.length > 0) {
              const gradeResult = this.salaryCalculationService.findGrade(gradeTable, totalSalary);
              if (gradeResult) {
                standardMonthlyRemuneration = gradeResult.remuneration;
                grade = gradeResult.grade;
              }
            }
            
            if (fixedSalary > 0 || variableSalary > 0) {
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
            }
          }
        }
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
      
      // 産休・育休中
      if (emp.maternityLeaveStart || emp.maternityLeaveEnd || emp.childcareLeaveStart || emp.childcareLeaveEnd) {
        notes.push('産休・育休中');
      }
      
      // 退職済み
      if (emp.retireDate) {
        const retireDate = new Date(emp.retireDate);
        if (retireDate <= new Date()) {
          notes.push('退職済み');
        }
      }
      
      // 休職中の判定（復職日が設定されていて、復職日が未来の場合）
      if (emp.returnFromLeaveDate) {
        const returnDate = new Date(emp.returnFromLeaveDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        returnDate.setHours(0, 0, 0, 0);
        
        // 復職日が未来なら休職中
        if (returnDate > today) {
          // 当月が休職期間中かどうかを判定
          const currentDate = new Date(this.currentYear, this.currentMonth - 1, 1);
          const returnDateStart = new Date(returnDate);
          returnDateStart.setDate(1); // 復職日の月初日
          
          // 復職日が当月より未来なら休職中
          if (returnDateStart > currentDate) {
            notes.push('休職中');
          }
        }
      }

      this.employeeDisplayInfos.push({
        employee: emp,
        eligibility,
        currentMonthPremium,
        notes,
        standardMonthlyRemuneration,
        grade,
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

  getFilteredEmployees(): EmployeeDisplayInfo[] {
    return this.employeeDisplayInfos.filter((info) => {
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
    this.router.navigate(['/employees', id]);
  }

  goCreate(): void {
    this.router.navigate(['/employees/new']);
  }
}


