import { Injectable } from '@angular/core';
import { EmployeeService } from './employee.service';
import { BonusService } from './bonus.service';
import { MonthlySalaryService } from './monthly-salary.service';
import { SettingsService } from './settings.service';
import { PaymentSummaryStateService } from './payment-summary-state.service';
import { PaymentSummaryCalculationService } from './payment-summary-calculation.service';
import { NotificationCalculationService } from './notification-calculation.service';
import { AnnualWarningService } from './annual-warning.service';
import { Bonus } from '../models/bonus.model';

/**
 * PaymentSummaryDataService
 * 
 * 保険料サマリー画面のデータロード処理を担当するサービス
 * 従業員、賞与、給与、料率・等級表の読み込みと計算処理のオーケストレーションを提供
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryDataService {
  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private state: PaymentSummaryStateService,
    private paymentSummaryCalculationService: PaymentSummaryCalculationService,
    private notificationCalculationService: NotificationCalculationService,
    private annualWarningService: AnnualWarningService
  ) {}

  /**
   * 初期データをロード
   */
  async loadInitialData(): Promise<void> {
    this.state.setIsLoading(true);
    try {
      const employeesData = await this.employeeService.getAllEmployees();
      this.state.setEmployees(employeesData);
      await this.loadData();
    } finally {
      this.state.setIsLoading(false);
    }
  }

  /**
   * データをロード（年度変更時も含む）
   */
  async loadData(): Promise<void> {
    // 料率と等級表を読み込む
    const rates = await this.settingsService.getRates(
      this.state.year.toString(),
      this.state.prefecture
    );
    const gradeTable = await this.settingsService.getStandardTable(this.state.year);
    this.state.setRatesAndGradeTable(rates, gradeTable);

    // 賞与データを読み込む
    const bonuses = await this.loadBonuses();
    this.state.setBonuses(bonuses);

    // 月次給与データを一括読み込み
    const salaryData = await this.loadSalaryData();
    this.state.setSalaryData(salaryData);

    // 計算処理を実行
    if (this.state.employees.length > 0) {
      await this.calculateMonthlyTotals();
    }
  }

  /**
   * 賞与データを読み込む
   */
  private async loadBonuses(): Promise<Bonus[]> {
    const bonuses: Bonus[] = [];
    for (const emp of this.state.employees) {
      const employeeBonuses = await this.bonusService.getBonusesForResult(
        emp.id,
        this.state.year
      );
      bonuses.push(...employeeBonuses);
      console.log(
        `[payment-summary] 賞与データ取得: 従業員=${emp.name}, 年度=${this.state.year}, 賞与件数=${employeeBonuses.length}`,
        employeeBonuses
      );
    }
    console.log(
      `[payment-summary] 全賞与データ: 年度=${this.state.year}, 総件数=${bonuses.length}`,
      bonuses
    );
    return bonuses;
  }

  /**
   * 給与データを読み込む
   */
  private async loadSalaryData(): Promise<{ [employeeId: string]: any }> {
    const salaryDataByEmployeeId: { [employeeId: string]: any } = {};
    for (const emp of this.state.employees) {
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(
        emp.id,
        this.state.year
      );
      salaryDataByEmployeeId[emp.id] = salaryData;
      console.log(
        `[payment-summary] 給与データ取得: 従業員=${emp.name}, 年度=${this.state.year}, データ=`,
        salaryData
      );
    }
    return salaryDataByEmployeeId;
  }

  /**
   * 月次保険料を計算
   */
  async calculateMonthlyTotals(): Promise<void> {
    // 選択された従業員のみを取得
    const filteredEmployees = this.state.getFilteredEmployees();

    // サービスを使用して計算（選択された従業員のみ）
    const result =
      await this.paymentSummaryCalculationService.calculateMonthlyTotals(
        filteredEmployees,
        this.state.currentYearBonuses,
        this.state.year,
        this.state.gradeTable,
        this.state.rates,
        this.state.salaryDataByEmployeeId,
        this.state.prefecture
      );

    // 結果を状態に反映
    this.state.setCalculationResults(result);

    // 年間合計を計算
    const annualTotals =
      this.paymentSummaryCalculationService.calculateAnnualTotals(
        result.companyMonthlyTotals
      );
    this.state.setAnnualTotals(annualTotals);

    // 届出要否判定を一括取得（選択された従業員のみ）
    const notificationsByEmployee =
      await this.notificationCalculationService.calculateNotificationsBatch(
        filteredEmployees,
        this.state.year,
        this.state.gradeTable,
        this.state.bonusesByEmployeeId,
        this.state.salaryDataByEmployeeId
      );
    this.state.setNotifications(notificationsByEmployee);

    // 年間警告を収集（選択された従業員のみ）
    const warnings = await this.annualWarningService.collectAnnualWarnings(
      filteredEmployees,
      this.state.currentYearBonuses,
      this.state.year,
      this.state.monthlyPremiumsByEmployee,
      this.state.salaryDataByEmployeeId
    );
    this.state.setWarnings(warnings);
  }

  /**
   * 年度変更時の処理
   */
  async onYearChange(): Promise<void> {
    this.state.setYear(Number(this.state.year));
    this.state.setIsLoading(true);
    try {
      // キャッシュをクリア
      this.state.clearCache();
      await this.loadData();
    } finally {
      this.state.setIsLoading(false);
    }
  }
}



