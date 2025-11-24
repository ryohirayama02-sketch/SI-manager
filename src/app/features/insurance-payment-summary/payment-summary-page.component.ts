import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
import { InsuranceCalculationService } from '../../services/insurance-calculation.service';
import { SalaryCalculationService, MonthlyPremiums, TeijiKetteiResult, SuijiKouhoResult } from '../../services/salary-calculation.service';
import { NotificationDecisionService, NotificationDecisionResult } from '../../services/notification-decision.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';

@Component({
  selector: 'app-payment-summary-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-summary-page.component.html',
  styleUrl: './payment-summary-page.component.css'
})
export class PaymentSummaryPageComponent implements OnInit {
  employees: Employee[] = [];
  year: number = new Date().getFullYear();
  prefecture: string = 'tokyo';
  rates: any = null;
  gradeTable: any[] = [];
  
  // 月ごとの集計結果
  monthlyTotals: { [month: number]: {
    health: number;
    care: number;
    pension: number;
    total: number;
  } } = {};

  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};

  // 月次保険料一覧（従業員ごと）
  // MonthlyPremiumRow は calculateMonthlyPremiums の戻り値（MonthlyPremiums & { reasons: string[] }）をベースに変換
  monthlyPremiumsByEmployee: { [employeeId: string]: {
    month: number;
    healthEmployee: number;  // health_employee から変換
    healthEmployer: number;  // health_employer から変換
    careEmployee: number;    // care_employee から変換
    careEmployer: number;    // care_employer から変換
    pensionEmployee: number; // pension_employee から変換
    pensionEmployer: number; // pension_employer から変換
    exempt: boolean;         // reasons から判定
    notes: string[];         // reasons から取得
  }[] } = {};

  // 会社全体の月次保険料合計
  companyMonthlyTotals: {
    month: number;
    healthTotal: number;
    careTotal: number;
    pensionTotal: number;
    total: number;
  }[] = [];

  // 届出要否判定結果（従業員ごと）
  notificationsByEmployee: { [employeeId: string]: NotificationDecisionResult[] } = {};

  // 賞与保険料の年間合計
  bonusAnnualTotals: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    totalEmployee: number;
    totalEmployer: number;
    total: number;
  } = {
    healthEmployee: 0,
    healthEmployer: 0,
    careEmployee: 0,
    careEmployer: 0,
    pensionEmployee: 0,
    pensionEmployer: 0,
    totalEmployee: 0,
    totalEmployer: 0,
    total: 0
  };

  // 月ごとの賞与データ
  bonusByMonth: { [month: number]: Bonus[] } = {};

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private insuranceCalculationService: InsuranceCalculationService,
    private salaryCalculationService: SalaryCalculationService,
    private notificationDecisionService: NotificationDecisionService
  ) {}

  async ngOnInit(): Promise<void> {
    const employeesData = await this.employeeService.getAllEmployees();
    this.employees = employeesData || [];
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    this.gradeTable = await this.settingsService.getStandardTable(this.year);
    
    // 賞与データを読み込む
    const bonuses = await this.bonusService.loadBonus(this.year);
    
    if (this.employees.length > 0) {
      await this.calculateMonthlyTotals(bonuses);
    }
  }

  async calculateMonthlyTotals(bonuses: Bonus[] = []): Promise<void> {
    // 賞与保険料の年間合計を初期化
    this.bonusAnnualTotals = {
      healthEmployee: 0,
      healthEmployer: 0,
      careEmployee: 0,
      careEmployer: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      totalEmployee: 0,
      totalEmployer: 0,
      total: 0
    };

    // 月ごとの賞与データを初期化
    this.bonusByMonth = {};
    for (const bonus of bonuses) {
      const month = bonus.month;
      if (month >= 1 && month <= 12) {
        if (!this.bonusByMonth[month]) {
          this.bonusByMonth[month] = [];
        }
        this.bonusByMonth[month].push(bonus);
      }
    }

    // 賞与データを従業員ごとにグループ化
    const bonusesByEmployee: { [employeeId: string]: Bonus[] } = {};
    for (const bonus of bonuses) {
      if (!bonusesByEmployee[bonus.employeeId]) {
        bonusesByEmployee[bonus.employeeId] = [];
      }
      bonusesByEmployee[bonus.employeeId].push(bonus);
    }

    // 月ごとの集計を初期化
    const allMonthlyTotals: { [month: number]: {
      health: number;
      care: number;
      pension: number;
      total: number;
    } } = {};

    for (let month = 1; month <= 12; month++) {
      allMonthlyTotals[month] = {
        health: 0,
        care: 0,
        pension: 0,
        total: 0
      };
    }

    if (!this.employees || this.employees.length === 0) {
      this.monthlyTotals = allMonthlyTotals;
      return;
    }

    // 全従業員をループ
    for (const emp of this.employees) {
      this.errorMessages[emp.id] = [];
      this.warningMessages[emp.id] = [];
      
      // A. 月次給与の保険料を取得
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(emp.id, this.year);
      let monthlyPremiums: { [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      } } = {};

      // 月次保険料一覧を計算（初期化を確実に行う）
      const monthlyPremiumRows: {
        month: number;
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
        exempt: boolean;
        notes: string[];
      }[] = [];
      
      if (salaryData) {
        // 1〜12月分の月次保険料を計算
        for (let month = 1; month <= 12; month++) {
          const monthKey = this.salaryCalculationService.getSalaryKey(emp.id, month);
          const monthSalaryData = salaryData[monthKey];
          const fixedSalary = monthSalaryData?.fixedSalary ?? monthSalaryData?.fixed ?? 0;
          const variableSalary = monthSalaryData?.variableSalary ?? monthSalaryData?.variable ?? 0;
          
          // calculateMonthlyPremiums を呼び出し（戻り値: MonthlyPremiums & { reasons: string[] }）
          const premiumResult = this.salaryCalculationService.calculateMonthlyPremiums(
            emp,
            this.year,
            month,
            fixedSalary,
            variableSalary,
            this.gradeTable,
            this.rates
          );
          
          // MonthlyPremiumRow に変換（サービス側の戻り値型に完全一致）
          const exempt = premiumResult.reasons.some(r => 
            r.includes('産前産後休業') || r.includes('育児休業')
          );
          
          monthlyPremiumRows.push({
            month,
            healthEmployee: premiumResult.health_employee,
            healthEmployer: premiumResult.health_employer,
            careEmployee: premiumResult.care_employee,
            careEmployer: premiumResult.care_employer,
            pensionEmployee: premiumResult.pension_employee,
            pensionEmployer: premiumResult.pension_employer,
            exempt,
            notes: premiumResult.reasons
          });
          
          // 既存の monthlyPremiums 形式にも変換（後方互換性）
          monthlyPremiums[month] = {
            healthEmployee: premiumResult.health_employee,
            healthEmployer: premiumResult.health_employer,
            careEmployee: premiumResult.care_employee,
            careEmployer: premiumResult.care_employer,
            pensionEmployee: premiumResult.pension_employee,
            pensionEmployer: premiumResult.pension_employer
          };
        }
        
        // 年齢関連の矛盾チェック
        this.validateAgeRelatedErrors(emp, monthlyPremiums);
      }
      
      // B. 賞与の保険料を取得（読み込んだ賞与データから該当従業員分を抽出）
      const employeeBonuses = bonusesByEmployee[emp.id] || [];
      
      // 賞与保険料を月次給与の保険料に加算
      for (const bonus of employeeBonuses) {
        const bonusHealthEmployee = bonus.healthEmployee || 0;
        const bonusHealthEmployer = bonus.healthEmployer || 0;
        const bonusCareEmployee = bonus.careEmployee || 0;
        const bonusCareEmployer = bonus.careEmployer || 0;
        const bonusPensionEmployee = bonus.pensionEmployee || 0;
        const bonusPensionEmployer = bonus.pensionEmployer || 0;
        
        // 賞与保険料の年間合計に加算
        this.bonusAnnualTotals.healthEmployee += bonusHealthEmployee;
        this.bonusAnnualTotals.healthEmployer += bonusHealthEmployer;
        this.bonusAnnualTotals.careEmployee += bonusCareEmployee;
        this.bonusAnnualTotals.careEmployer += bonusCareEmployer;
        this.bonusAnnualTotals.pensionEmployee += bonusPensionEmployee;
        this.bonusAnnualTotals.pensionEmployer += bonusPensionEmployer;
        
        // 月次給与の保険料に賞与分を加算（該当月の保険料に加算）
        const bonusMonth = bonus.month;
        if (monthlyPremiums[bonusMonth]) {
          monthlyPremiums[bonusMonth].healthEmployee += bonusHealthEmployee;
          monthlyPremiums[bonusMonth].healthEmployer += bonusHealthEmployer;
          monthlyPremiums[bonusMonth].careEmployee += bonusCareEmployee;
          monthlyPremiums[bonusMonth].careEmployer += bonusCareEmployer;
          monthlyPremiums[bonusMonth].pensionEmployee += bonusPensionEmployee;
          monthlyPremiums[bonusMonth].pensionEmployer += bonusPensionEmployer;
        }
        
        // 月次保険料一覧にも加算
        const premiumRow = monthlyPremiumRows.find(r => r.month === bonusMonth);
        if (premiumRow) {
          premiumRow.healthEmployee += bonusHealthEmployee;
          premiumRow.healthEmployer += bonusHealthEmployer;
          premiumRow.careEmployee += bonusCareEmployee;
          premiumRow.careEmployer += bonusCareEmployer;
          premiumRow.pensionEmployee += bonusPensionEmployee;
          premiumRow.pensionEmployer += bonusPensionEmployer;
        }
      }
      
      // 月次保険料一覧を保存（salaryDataがない場合でも空配列を設定）
      this.monthlyPremiumsByEmployee[emp.id] = monthlyPremiumRows;

      // 届出要否判定を取得
      await this.calculateNotifications(emp, salaryData);

      // サービスを使用して月次会社負担を計算
      const employeeMonthlyTotals = this.insuranceCalculationService.getMonthlyCompanyBurden(
        emp,
        monthlyPremiums,
        employeeBonuses
      );

      // 全従業員分を合計
      for (let month = 1; month <= 12; month++) {
        allMonthlyTotals[month].health += employeeMonthlyTotals[month]?.health || 0;
        allMonthlyTotals[month].care += employeeMonthlyTotals[month]?.care || 0;
        allMonthlyTotals[month].pension += employeeMonthlyTotals[month]?.pension || 0;
        allMonthlyTotals[month].total += employeeMonthlyTotals[month]?.total || 0;
      }
    }

    // 賞与保険料を支給月の月別合計に加算
    for (const bonus of bonuses) {
      const bonusMonth = bonus.month;
      if (bonusMonth >= 1 && bonusMonth <= 12) {
        // 該当月のオブジェクトが存在することを確認（初期化済み）
        if (!allMonthlyTotals[bonusMonth]) {
          allMonthlyTotals[bonusMonth] = {
            health: 0,
            care: 0,
            pension: 0,
            total: 0
          };
        }
        
        const bonusHealthEmployee = bonus.healthEmployee || 0;
        const bonusHealthEmployer = bonus.healthEmployer || 0;
        const bonusCareEmployee = bonus.careEmployee || 0;
        const bonusCareEmployer = bonus.careEmployer || 0;
        const bonusPensionEmployee = bonus.pensionEmployee || 0;
        const bonusPensionEmployer = bonus.pensionEmployer || 0;
        
        // 賞与保険料を月別合計に加算
        allMonthlyTotals[bonusMonth].health += bonusHealthEmployee + bonusHealthEmployer;
        allMonthlyTotals[bonusMonth].care += bonusCareEmployee + bonusCareEmployer;
        allMonthlyTotals[bonusMonth].pension += bonusPensionEmployee + bonusPensionEmployer;
        allMonthlyTotals[bonusMonth].total += 
          (bonusHealthEmployee + bonusHealthEmployer) + 
          (bonusCareEmployee + bonusCareEmployer) + 
          (bonusPensionEmployee + bonusPensionEmployer);
      }
    }

    this.monthlyTotals = allMonthlyTotals;
    
    // 賞与保険料の年間合計を計算
    this.bonusAnnualTotals.totalEmployee = 
      this.bonusAnnualTotals.healthEmployee + 
      this.bonusAnnualTotals.careEmployee + 
      this.bonusAnnualTotals.pensionEmployee;
    this.bonusAnnualTotals.totalEmployer = 
      this.bonusAnnualTotals.healthEmployer + 
      this.bonusAnnualTotals.careEmployer + 
      this.bonusAnnualTotals.pensionEmployer;
    this.bonusAnnualTotals.total = 
      this.bonusAnnualTotals.totalEmployee + 
      this.bonusAnnualTotals.totalEmployer;
    
    // 会社全体の月次保険料合計を計算
    this.calculateCompanyMonthlyTotals();
  }

  /**
   * monthlyPremiumsByEmployee を元に会社全体の月次合計を計算
   * 事業主が支払うべき総額（本人負担 + 会社負担）を月ごとに集計する
   */
  calculateCompanyMonthlyTotals(): void {
    const totals: { [month: number]: {
      healthTotal: number;
      careTotal: number;
      pensionTotal: number;
      total: number;
    } } = {};

    // 1〜12月を初期化
    for (let month = 1; month <= 12; month++) {
      totals[month] = {
        healthTotal: 0,
        careTotal: 0,
        pensionTotal: 0,
        total: 0
      };
    }

    // 全従業員分を合算
    for (const emp of this.employees) {
      const employeeRows = this.monthlyPremiumsByEmployee[emp.id];
      if (!employeeRows || employeeRows.length === 0) {
        continue;
      }

      for (const row of employeeRows) {
        const month = row.month;
        // exempt の月はそのまま 0 として扱う（既に 0 になっている）
        // 事業主が支払うべき総額 = 本人負担 + 会社負担
        const healthSum = row.healthEmployee + row.healthEmployer;
        const careSum = row.careEmployee + row.careEmployer;
        const pensionSum = row.pensionEmployee + row.pensionEmployer;
        
        totals[month].healthTotal += healthSum;
        totals[month].careTotal += careSum;
        totals[month].pensionTotal += pensionSum;
      }
    }

    // 配列形式に変換（total は healthTotal + careTotal + pensionTotal として計算）
    this.companyMonthlyTotals = [];
    for (let month = 1; month <= 12; month++) {
      const healthTotal = totals[month].healthTotal;
      const careTotal = totals[month].careTotal;
      const pensionTotal = totals[month].pensionTotal;
      const total = healthTotal + careTotal + pensionTotal;
      
      this.companyMonthlyTotals.push({
        month,
        healthTotal,
        careTotal,
        pensionTotal,
        total
      });
    }
  }

  /**
   * 指定月の賞与情報をツールチップ用の文字列として返す
   * @param month 月（1-12）
   * @returns ツールチップ用の文字列
   */
  getBonusTooltip(month: number): string {
    const bonuses = this.bonusByMonth[month];
    if (!bonuses || bonuses.length === 0) {
      return '';
    }

    const lines: string[] = [];
    for (const bonus of bonuses) {
      const employee = this.employees.find(e => e.id === bonus.employeeId);
      const employeeName = employee ? employee.name : bonus.employeeId;
      
      lines.push(`【${employeeName}】`);
      lines.push(`賞与額: ${(bonus.amount || 0).toLocaleString()}円`);
      
      if (bonus.standardBonusAmount !== undefined) {
        lines.push(`標準賞与額: ${bonus.standardBonusAmount.toLocaleString()}円`);
      }
      
      const healthEmployee = bonus.healthEmployee || 0;
      const healthEmployer = bonus.healthEmployer || 0;
      const careEmployee = bonus.careEmployee || 0;
      const careEmployer = bonus.careEmployer || 0;
      const pensionEmployee = bonus.pensionEmployee || 0;
      const pensionEmployer = bonus.pensionEmployer || 0;
      
      if (healthEmployee > 0 || healthEmployer > 0) {
        lines.push(`健康保険: 本人${healthEmployee.toLocaleString()}円 / 会社${healthEmployer.toLocaleString()}円`);
      }
      if (careEmployee > 0 || careEmployer > 0) {
        lines.push(`介護保険: 本人${careEmployee.toLocaleString()}円 / 会社${careEmployer.toLocaleString()}円`);
      }
      if (pensionEmployee > 0 || pensionEmployer > 0) {
        lines.push(`厚生年金: 本人${pensionEmployee.toLocaleString()}円 / 会社${pensionEmployer.toLocaleString()}円`);
      }
      
      if (bonus.isExempted || bonus.isExempt) {
        lines.push(`免除: ${bonus.exemptReason || '産休・育休中'}`);
      } else if (bonus.isSalaryInsteadOfBonus) {
        lines.push(`給与扱い: 年間4回以上支給のため`);
      } else if (bonus.isRetiredNoLastDay) {
        lines.push(`対象外: 月末在籍なし`);
      } else {
        lines.push(`有効`);
      }
      
      if (bonuses.length > 1 && bonus !== bonuses[bonuses.length - 1]) {
        lines.push(''); // 複数賞与の場合は区切り
      }
    }
    
    return lines.join('\n');
  }

  validateAgeRelatedErrors(emp: Employee, monthlyPremiums: { [month: number]: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
  } }): void {
    const age = this.insuranceCalculationService.getAge(emp.birthDate);
    
    // 70歳以上なのに厚生年金の保険料が計算されている
    for (let month = 1; month <= 12; month++) {
      const premiums = monthlyPremiums[month];
      if (premiums && age >= 70 && premiums.pensionEmployee > 0) {
        this.errorMessages[emp.id].push(`${month}月：70歳以上は厚生年金保険料は発生しません`);
      }
      
      // 75歳以上なのに健康保険・介護保険が計算されている
      if (premiums && age >= 75 && (premiums.healthEmployee > 0 || premiums.careEmployee > 0)) {
        this.errorMessages[emp.id].push(`${month}月：75歳以上は健康保険・介護保険は発生しません`);
      }
    }
  }

  getTotalForYear(): number {
    return this.insuranceCalculationService.getTotalForYear(this.monthlyTotals);
  }

  getTotalHealth(): number {
    return this.insuranceCalculationService.getTotalHealth(this.monthlyTotals);
  }

  getTotalCare(): number {
    return this.insuranceCalculationService.getTotalCare(this.monthlyTotals);
  }

  getTotalPension(): number {
    return this.insuranceCalculationService.getTotalPension(this.monthlyTotals);
  }

  hasNotesForEmployee(employeeId: string): boolean {
    const rows = this.monthlyPremiumsByEmployee[employeeId];
    if (!rows || rows.length === 0) {
      return false;
    }
    return rows.some(r => r.notes && r.notes.length > 0);
  }

  /**
   * 会社全体の健康保険年間合計（本人負担 + 会社負担）
   */
  getCompanyTotalHealth(): number {
    let sum = 0;
    for (const total of this.companyMonthlyTotals) {
      sum += total.healthTotal;
    }
    return sum;
  }

  /**
   * 会社全体の介護保険年間合計（本人負担 + 会社負担）
   */
  getCompanyTotalCare(): number {
    let sum = 0;
    for (const total of this.companyMonthlyTotals) {
      sum += total.careTotal;
    }
    return sum;
  }

  /**
   * 会社全体の厚生年金年間合計（本人負担 + 会社負担）
   */
  getCompanyTotalPension(): number {
    let sum = 0;
    for (const total of this.companyMonthlyTotals) {
      sum += total.pensionTotal;
    }
    return sum;
  }

  /**
   * 会社全体の年間総額（健康保険 + 介護保険 + 厚生年金）
   */
  getCompanyTotal(): number {
    let sum = 0;
    for (const total of this.companyMonthlyTotals) {
      sum += total.total;
    }
    return sum;
  }

  /**
   * 会社全体の健康保険年間合計（本人負担 + 会社負担）
   */
  getAnnualTotalHealth(): number {
    return this.getCompanyTotalHealth();
  }

  /**
   * 会社全体の介護保険年間合計（本人負担 + 会社負担）
   */
  getAnnualTotalCare(): number {
    return this.getCompanyTotalCare();
  }

  /**
   * 会社全体の厚生年金年間合計（本人負担 + 会社負担）
   */
  getAnnualTotalPension(): number {
    return this.getCompanyTotalPension();
  }

  /**
   * 会社全体の年間総額（健康保険 + 介護保険 + 厚生年金）
   */
  getAnnualTotal(): number {
    return this.getCompanyTotal();
  }

  /**
   * 従業員ごとの届出要否を計算
   */
  async calculateNotifications(employee: Employee, salaryData: any): Promise<void> {
    const notifications: NotificationDecisionResult[] = [];

    // 1. 定時決定の届出要否判定
    if (salaryData) {
      const salaries: { [key: string]: { total: number; fixed: number; variable: number } } = {};
      for (let month = 1; month <= 12; month++) {
        const monthKey = this.salaryCalculationService.getSalaryKey(employee.id, month);
        const monthSalaryData = salaryData[monthKey];
        if (monthSalaryData) {
          salaries[monthKey] = {
            total: monthSalaryData.totalSalary ?? monthSalaryData.total ?? 0,
            fixed: monthSalaryData.fixedSalary ?? monthSalaryData.fixed ?? 0,
            variable: monthSalaryData.variableSalary ?? monthSalaryData.variable ?? 0
          };
        }
      }

      // 定時決定を計算
      const currentStandard = employee.standardMonthlyRemuneration || 0;
      const currentGrade = currentStandard > 0 
        ? this.salaryCalculationService.findGrade(this.gradeTable, currentStandard)?.grade || 0
        : 0;
      
      const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
        employee.id,
        salaries,
        this.gradeTable,
        currentStandard
      );

      if (teijiResult.grade > 0) {
        const teijiNotification = this.notificationDecisionService.checkTeijiNotification(
          teijiResult,
          currentGrade,
          this.year
        );
        notifications.push(teijiNotification);
      }

      // 2. 随時改定の届出要否判定
      const suijiResults = this.salaryCalculationService.checkRehabSuiji(
        employee.id,
        salaries,
        this.gradeTable,
        [employee],
        this.year.toString(),
        { [employee.id]: teijiResult }
      );

      for (const suijiResult of suijiResults) {
        if (suijiResult.isEligible) {
          const suijiNotification = this.notificationDecisionService.checkSuijiNotification(
            suijiResult,
            suijiResult.changeMonth,
            this.year
          );
          notifications.push(suijiNotification);
        }
      }
    }

    // 3. 賞与支払届の届出要否判定
    const bonuses = await this.bonusService.getBonusesForResult(employee.id, this.year);
    for (const bonus of bonuses) {
      if (bonus.payDate && bonus.amount) {
        const payDate = new Date(bonus.payDate);
        const bonusNotification = this.notificationDecisionService.checkBonusNotification(
          bonus.amount,
          payDate,
          bonus.isRetiredNoLastDay || false,
          bonus.isExempted || false,
          bonus.isOverAge75 || false,
          bonus.isSalaryInsteadOfBonus || false
        );
        notifications.push(bonusNotification);
      }
    }

    this.notificationsByEmployee[employee.id] = notifications;
  }

  /**
   * 届出種類の表示名を取得
   */
  getNotificationTypeLabel(type: 'teiji' | 'suiji' | 'bonus'): string {
    switch (type) {
      case 'teiji':
        return '定時決定';
      case 'suiji':
        return '随時改定';
      case 'bonus':
        return '賞与支払届';
      default:
        return type;
    }
  }
}

