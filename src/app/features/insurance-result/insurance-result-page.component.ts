import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { InsuranceCalculationService } from '../../services/insurance-calculation.service';
import { SalaryCalculationService } from '../../services/salary-calculation.service';
import { SettingsService } from '../../services/settings.service';
import { EmployeeLifecycleService } from '../../services/employee-lifecycle.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';

interface MonthlyPremiumData {
  month: number;
  grade: number | null;
  standardMonthlyRemuneration: number;
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  total: number;
  isExempt: boolean;
  exemptReason: string;
  reasons: string[];
}

interface EmployeeInsuranceData {
  monthlyPremiums: MonthlyPremiumData[];
  monthlyTotal: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    total: number;
  };
  bonusTotal: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    total: number;
  };
  grandTotal: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    total: number;
  };
  latestBonus: Bonus | null;
  hasLeaveOfAbsence: boolean;
}

@Component({
  selector: 'app-insurance-result-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './insurance-result-page.component.html',
  styleUrl: './insurance-result-page.component.css'
})
export class InsuranceResultPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  year: number = new Date().getFullYear();
  availableYears: number[] = [];
  insuranceData: { [employeeId: string]: EmployeeInsuranceData } = {};
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};
  // 加入区分購読用
  eligibilitySubscription: Subscription | null = null;

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService,
    private insuranceCalculationService: InsuranceCalculationService,
    private salaryCalculationService: SalaryCalculationService,
    private settingsService: SettingsService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private employeeEligibilityService: EmployeeEligibilityService
  ) {
    // 年度選択用の年度リストを生成（現在年度±2年）
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      this.availableYears.push(y);
    }
  }

  async ngOnInit(): Promise<void> {
    const employeesData = await this.employeeService.getAllEmployees();
    this.employees = employeesData || [];
    if (this.employees.length > 0) {
      await this.loadInsuranceData();
    }

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService.observeEligibility().subscribe(() => {
      this.reloadEligibility();
    });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  async reloadEligibility(): Promise<void> {
    // 加入区分が変更された場合、保険料データを再計算
    await this.loadInsuranceData();
  }

  async onYearChange(): Promise<void> {
    // 年度変更時にデータを再読み込み
    await this.loadInsuranceData();
  }

  async loadInsuranceData(): Promise<void> {
    if (!this.employees || this.employees.length === 0) {
      return;
    }

    // 標準報酬月額テーブルを取得
    const gradeTable = await this.settingsService.getStandardTable(this.year);

    for (const emp of this.employees) {
      try {
        console.log(`[loadInsuranceData] 処理開始: ${emp.name} (ID: ${emp.id})`);
        this.errorMessages[emp.id] = [];
        this.warningMessages[emp.id] = [];

        // 月次給与データを取得
        const monthlySalaryData = await this.monthlySalaryService.getEmployeeSalary(emp.id, this.year);
        console.log(`[loadInsuranceData] ${emp.name} の給与データ:`, monthlySalaryData);
      
      // 月次給与の保険料を計算
      const monthlyPremiums: MonthlyPremiumData[] = [];
      let monthlyTotal = {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        total: 0,
      };

      for (let month = 1; month <= 12; month++) {
        const monthKey = month.toString();
        const monthData = monthlySalaryData?.[monthKey];
        
        if (monthData) {
          const fixedSalary = monthData.fixedTotal ?? monthData.fixed ?? monthData.fixedSalary ?? 0;
          const variableSalary = monthData.variableTotal ?? monthData.variable ?? monthData.variableSalary ?? 0;
          
          if (fixedSalary > 0 || variableSalary > 0) {
            const premiumResult = await this.salaryCalculationService.calculateMonthlyPremiums(
              emp,
              this.year,
              month,
              fixedSalary,
              variableSalary,
              gradeTable
            );

            // 標準報酬等級を取得（gradeTableから直接検索）
            const totalSalary = fixedSalary + variableSalary;
            let grade: number | null = null;
            let standardMonthlyRemuneration = 0;
            
            // gradeTableから等級を検索
            const gradeRow = gradeTable.find((r: any) => totalSalary >= r.lower && totalSalary < r.upper);
            if (gradeRow) {
              grade = gradeRow.rank;
              standardMonthlyRemuneration = gradeRow.standard;
            } else {
              // reasonsから等級情報を抽出（フォールバック）
              const gradeMatch = premiumResult.reasons.find(r => r.includes('等級'))?.match(/等級(\d+)/);
              if (gradeMatch) {
                grade = parseInt(gradeMatch[1], 10);
              }
              const standardMatch = premiumResult.reasons.find(r => r.includes('標準報酬月額'))?.match(/標準報酬月額([\d,]+)円/);
              if (standardMatch) {
                standardMonthlyRemuneration = parseInt(standardMatch[1].replace(/,/g, ''), 10);
              }
            }

            // 免除判定（Service統一ロジックを使用）
            const isExempt = this.salaryCalculationService.isExemptMonth(emp, this.year, month);
            // 免除理由はreasons配列から取得（Service層で設定済み）
            const exemptReason = isExempt 
              ? premiumResult.reasons.find(r => r.includes('産前産後休業') || r.includes('育児休業') || r.includes('免除')) || ''
              : '';

            // 料率取得失敗の警告を追加
            if (premiumResult.reasons.some(r => r.includes('保険料率の取得に失敗しました'))) {
              this.warningMessages[emp.id].push(
                `${month}月：保険料率が設定されていません。設定画面で料率を設定してください。`
              );
            }

            const monthlyPremium: MonthlyPremiumData = {
              month,
              grade,
              standardMonthlyRemuneration,
              healthEmployee: premiumResult.health_employee,
              healthEmployer: premiumResult.health_employer,
              careEmployee: premiumResult.care_employee,
              careEmployer: premiumResult.care_employer,
              pensionEmployee: premiumResult.pension_employee,
              pensionEmployer: premiumResult.pension_employer,
              total: premiumResult.health_employee + premiumResult.health_employer +
                     premiumResult.care_employee + premiumResult.care_employer +
                     premiumResult.pension_employee + premiumResult.pension_employer,
              isExempt,
              exemptReason,
              reasons: premiumResult.reasons,
            };

            monthlyPremiums.push(monthlyPremium);

            // 月次合計に加算
            monthlyTotal.healthEmployee += premiumResult.health_employee;
            monthlyTotal.healthEmployer += premiumResult.health_employer;
            monthlyTotal.careEmployee += premiumResult.care_employee;
            monthlyTotal.careEmployer += premiumResult.care_employer;
            monthlyTotal.pensionEmployee += premiumResult.pension_employee;
            monthlyTotal.pensionEmployer += premiumResult.pension_employer;
          }
        }
      }

      monthlyTotal.total = monthlyTotal.healthEmployee + monthlyTotal.healthEmployer +
                           monthlyTotal.careEmployee + monthlyTotal.careEmployer +
                           monthlyTotal.pensionEmployee + monthlyTotal.pensionEmployer;

      // 賞与データを取得
      const bonuses = await this.bonusService.getBonusesForResult(emp.id, this.year);
      const latestBonus = bonuses && bonuses.length > 0 
        ? bonuses.sort((a, b) => new Date(b.payDate).getTime() - new Date(a.payDate).getTime())[0]
        : null;

      // 賞与の年間合計を計算
      const bonusTotal = {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        total: 0,
      };

      for (const bonus of bonuses || []) {
        if (!bonus.isExempted && !bonus.isSalaryInsteadOfBonus) {
          bonusTotal.healthEmployee += bonus.healthEmployee || 0;
          bonusTotal.healthEmployer += bonus.healthEmployer || 0;
          bonusTotal.careEmployee += bonus.careEmployee || 0;
          bonusTotal.careEmployer += bonus.careEmployer || 0;
          bonusTotal.pensionEmployee += bonus.pensionEmployee || 0;
          bonusTotal.pensionEmployer += bonus.pensionEmployer || 0;
        }
      }

      bonusTotal.total = bonusTotal.healthEmployee + bonusTotal.healthEmployer +
                         bonusTotal.careEmployee + bonusTotal.careEmployer +
                         bonusTotal.pensionEmployee + bonusTotal.pensionEmployer;

      // 合計（給与＋賞与）
      const grandTotal = {
        healthEmployee: monthlyTotal.healthEmployee + bonusTotal.healthEmployee,
        healthEmployer: monthlyTotal.healthEmployer + bonusTotal.healthEmployer,
        careEmployee: monthlyTotal.careEmployee + bonusTotal.careEmployee,
        careEmployer: monthlyTotal.careEmployer + bonusTotal.careEmployer,
        pensionEmployee: monthlyTotal.pensionEmployee + bonusTotal.pensionEmployee,
        pensionEmployer: monthlyTotal.pensionEmployer + bonusTotal.pensionEmployer,
        total: monthlyTotal.total + bonusTotal.total,
      };

      // 休職中の判定
      const hasLeaveOfAbsence = this.checkLeaveOfAbsence(emp);

      this.insuranceData[emp.id] = {
        monthlyPremiums,
        monthlyTotal,
        bonusTotal,
        grandTotal,
        latestBonus,
        hasLeaveOfAbsence,
      };

      console.log(`[loadInsuranceData] ${emp.name} の保険料データ設定完了:`, {
        monthlyPremiumsCount: monthlyPremiums.length,
        monthlyTotal: monthlyTotal.total,
        grandTotal: grandTotal.total
      });

      // 年齢関連の矛盾チェック
      this.validateAgeRelatedErrors(emp, grandTotal, this.insuranceData[emp.id]);
      } catch (error) {
        console.error(`従業員 ${emp.name} (ID: ${emp.id}) の保険料計算エラー:`, error);
        this.errorMessages[emp.id] = [
          ...(this.errorMessages[emp.id] || []),
          `保険料の計算中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
        ];
        
        // エラーが発生しても空のデータを設定して表示できるようにする
        this.insuranceData[emp.id] = {
          monthlyPremiums: [],
          monthlyTotal: {
            healthEmployee: 0,
            healthEmployer: 0,
            careEmployee: 0,
            careEmployer: 0,
            pensionEmployee: 0,
            pensionEmployer: 0,
            total: 0,
          },
          bonusTotal: {
            healthEmployee: 0,
            healthEmployer: 0,
            careEmployee: 0,
            careEmployer: 0,
            pensionEmployee: 0,
            pensionEmployer: 0,
            total: 0,
          },
          grandTotal: {
            healthEmployee: 0,
            healthEmployer: 0,
            careEmployee: 0,
            careEmployer: 0,
            pensionEmployee: 0,
            pensionEmployer: 0,
            total: 0,
          },
          latestBonus: null,
          hasLeaveOfAbsence: false,
        };
      }
    }
  }

  checkLeaveOfAbsence(emp: Employee): boolean {
    if (!emp.leaveOfAbsenceStart || !emp.leaveOfAbsenceEnd) {
      return false;
    }
    const startDate = new Date(emp.leaveOfAbsenceStart);
    const endDate = new Date(emp.leaveOfAbsenceEnd);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 休職期間中かどうかを判定
    return startDate <= today && endDate >= today;
  }

  validateAgeRelatedErrors(emp: Employee, totals: any, data: EmployeeInsuranceData): void {
    const age = this.insuranceCalculationService.getAge(emp.birthDate);
    
    // 70歳以上なのに厚生年金の保険料が計算されている
    if (age >= 70 && totals.pensionEmployee > 0) {
      this.errorMessages[emp.id].push('70歳以上は厚生年金保険料は発生しません');
    }
    
    // 75歳以上なのに健康保険・介護保険が計算されている（Service統一ロジックを使用）
    for (let month = 1; month <= 12; month++) {
      const careType = this.salaryCalculationService.getCareInsuranceType(emp.birthDate, this.year, month);
      if (careType === 'none' && age >= 75) {
        // 75歳以上で介護保険が計算されている場合
        const monthlyData = data.monthlyPremiums.find(p => p.month === month);
        if (monthlyData && monthlyData.careEmployee > 0) {
          this.errorMessages[emp.id].push(`${month}月：75歳以上は健康保険・介護保険は発生しません`);
        }
      }
    }
  }

  getInsuranceData(employeeId: string): EmployeeInsuranceData | null {
    return this.insuranceData[employeeId] || null;
  }
}


