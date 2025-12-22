import { Injectable } from '@angular/core';
import { EmployeeService } from './employee.service';
import { BonusService } from './bonus.service';
import { MonthlySalaryService } from './monthly-salary.service';
import { SettingsService } from './settings.service';
import { PaymentSummaryStateService } from './payment-summary-state.service';
import { PaymentSummaryOrchestratorService } from './payment-summary-orchestrator.service';
import { NotificationCalculationService } from './notification-calculation.service';
import { AnnualWarningService } from './annual-warning.service';
import { BonusCalculationService } from './bonus-calculation.service';
import { Bonus } from '../models/bonus.model';
import { RoomIdService } from './room-id.service';
import { Employee } from '../models/employee.model';

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
    private paymentSummaryOrchestratorService: PaymentSummaryOrchestratorService,
    private notificationCalculationService: NotificationCalculationService,
    private annualWarningService: AnnualWarningService,
    private bonusCalculationService: BonusCalculationService,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 初期データをロード
   */
  async loadInitialData(): Promise<void> {
    this.state.setIsLoading(true);
    try {
      // 前のルームのデータをクリア
      this.state.clearCache();
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
    const gradeTable = await this.settingsService.getStandardTable(
      this.state.year
    );
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
    const roomId = this.roomIdService.requireRoomId();
    const bonuses: Bonus[] = [];

    // 従業員ごとに並列取得
    const bonusPromises = this.state.employees.map(async (emp) => {
      const employeeBonuses = await this.bonusService.listBonuses(
        roomId,
        emp.id,
        this.state.year
      );
      bonuses.push(...employeeBonuses);
    });

    await Promise.all(bonusPromises);

    return bonuses;
  }

  /**
   * 給与データを読み込む
   */
  private async loadSalaryData(): Promise<{ [employeeId: string]: any }> {
    const salaryDataByEmployeeId: { [employeeId: string]: any } = {};
    const roomId = this.roomIdService.requireRoomId();
    // 従業員ごとに並列
    await Promise.all(
      this.state.employees.map(async (emp) => {
        const monthMap: any = {};
        // 月ごとに並列
        const monthPromises = [];
        for (let month = 1; month <= 12; month++) {
          monthPromises.push(
            this.monthlySalaryService
              .getEmployeeSalary(roomId, emp.id, this.state.year, month)
              .then((monthData) => {
                if (monthData) {
                  monthMap[month.toString()] = monthData;
                }
              })
          );
        }
        await Promise.all(monthPromises);
        salaryDataByEmployeeId[emp.id] = monthMap;
      })
    );
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
      await this.paymentSummaryOrchestratorService.calculateMonthlyTotals(
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
      this.paymentSummaryOrchestratorService.calculateAnnualTotals(
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

  /**
   * 選択された従業員の賞与を再計算して保存
   * 従業員情報の変更（産休・育休解除など）に対応するため
   */
  async recalculateAndSaveBonuses(): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    
    // 最新の従業員情報を取得
    const latestEmployees = await this.employeeService.getAllEmployees();
    this.state.setEmployees(latestEmployees);
    
    const filteredEmployees = this.state.getFilteredEmployees();

    if (filteredEmployees.length === 0) {
      return;
    }

    for (const emp of filteredEmployees) {
      try {
        // 該当年度の賞与を取得
        const bonuses = await this.bonusService.listBonuses(
          roomId,
          emp.id,
          this.state.year
        );

        if (!bonuses || bonuses.length === 0) {
          continue;
        }

        // 各賞与を再計算して保存
        // 注意：isExemptedの条件を除外している理由：
        // 産休期間中に保存された賞与（isExempted: true）も、産休解除後に再計算する必要があるため
        for (const bonus of bonuses) {
          if (
            bonus.amount > 0 &&
            !bonus.isSalaryInsteadOfBonus &&
            bonus.payDate
          ) {
            try {
              // 最新の従業員情報で賞与を再計算（産休解除後の状態を反映）
              const calculationResult =
                await this.bonusCalculationService.calculateBonus(
                  emp,
                  emp.id,
                  bonus.amount,
                  bonus.payDate,
                  this.state.year
                );

              if (calculationResult) {
                // 賞与を保存（計算結果を反映）
                const bonusId =
                  bonus.id || `bonus_${bonus.payDate.replace(/-/g, '')}`;
                const updateData: any = {
                  roomId: roomId,
                  employeeId: emp.id,
                  year: this.state.year,
                  amount: bonus.amount,
                  payDate: bonus.payDate,
                  isExempt: calculationResult.isExempted || false,
                  cappedHealth: calculationResult.cappedBonusHealth || 0,
                  cappedPension: calculationResult.cappedBonusPension || 0,
                  healthEmployee: calculationResult.healthEmployee,
                  healthEmployer: calculationResult.healthEmployer,
                  careEmployee: calculationResult.careEmployee,
                  careEmployer: calculationResult.careEmployer,
                  pensionEmployee: calculationResult.pensionEmployee,
                  pensionEmployer: calculationResult.pensionEmployer,
                  standardBonusAmount: calculationResult.standardBonus,
                  cappedBonusHealth: calculationResult.cappedBonusHealth,
                  cappedBonusPension: calculationResult.cappedBonusPension,
                  isExempted: calculationResult.isExempted,
                  isRetiredNoLastDay: calculationResult.isRetiredNoLastDay,
                  isOverAge70: calculationResult.isOverAge70,
                  isOverAge75: calculationResult.isOverAge75,
                  requireReport: calculationResult.requireReport,
                  isSalaryInsteadOfBonus:
                    calculationResult.isSalaryInsteadOfBonus,
                };

                if (calculationResult.reportDeadline) {
                  updateData.reportDeadline = calculationResult.reportDeadline;
                }
                if (calculationResult.exemptReason) {
                  updateData.exemptReason = calculationResult.exemptReason;
                }

                await this.bonusService.saveBonus(
                  roomId,
                  emp.id,
                  this.state.year,
                  bonusId,
                  updateData
                );
              }
            } catch (error) {
              console.error(
                `[payment-summary-data] 賞与の再計算・保存エラー: ${emp.name} (${bonus.payDate})`,
                error
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `[payment-summary-data] 賞与の取得エラー: ${emp.name}`,
          error
        );
      }
    }

    // 賞与データを再読み込みして、計算結果を更新
    const bonuses = await this.loadBonuses();
    this.state.setBonuses(bonuses);
    
    // 計算処理を再実行
    if (this.state.employees.length > 0) {
      await this.calculateMonthlyTotals();
    }
  }
}
