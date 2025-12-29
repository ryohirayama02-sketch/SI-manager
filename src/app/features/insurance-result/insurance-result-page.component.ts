import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SalaryCalculationService } from '../../services/salary-calculation.service';
import { SettingsService } from '../../services/settings.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { PremiumCalculationService } from '../../services/premium-calculation.service';
import { StandardRemunerationHistoryService } from '../../services/standard-remuneration-history.service';
import { BonusCalculationService } from '../../services/bonus-calculation.service';
import { SuijiService } from '../../services/suiji.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';
import { RoomIdService } from '../../services/room-id.service';
import { SuijiKouhoResult } from '../../services/salary-calculation.service';
import { PremiumStoppingRuleService } from '../../services/premium-stopping-rule.service';
import { EmployeeLifecycleService } from '../../services/employee-lifecycle.service';
import { EmployeeWorkCategoryService } from '../../services/employee-work-category.service';

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
  // 計算式情報（ツールチップ表示用、オプショナル）
  calculationFormula?: {
    health?: string; // 例: "標準報酬500,000円×4.955%"
    care?: string; // 例: "標準報酬500,000円×1.73%"
    pension?: string; // 例: "標準報酬500,000円×9.15%"
  };
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
  styleUrl: './insurance-result-page.component.css',
})
export class InsuranceResultPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  sortedEmployees: Employee[] = []; // 50音順でソートされた従業員リスト
  selectedEmployeeIds: Set<string> = new Set(); // 選択された従業員IDのセット
  cachedSelectedEmployeeIdsArray: string[] = []; // 選択された従業員IDの配列（キャッシュ）
  year: number = new Date().getFullYear();
  selectedMonth: number | 'all' | string = 'all';
  availableYears: number[] = [];
  insuranceData: { [employeeId: string]: EmployeeInsuranceData } = {};
  bonusData: { [employeeId: string]: Bonus[] } = {};
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};
  // 加入区分購読用
  eligibilitySubscription: Subscription | null = null;
  // 従業員情報変更購読用
  employeeSubscription: Subscription | null = null;
  // 各従業員の展開状態を管理
  expandedEmployees: { [employeeId: string]: boolean } = {};
  // 読み込み状態
  isLoadingInsuranceData: boolean = false;
  // キャッシュ用プロパティ
  cachedTableRows: Array<{
    employee: Employee;
    monthlyPremium: MonthlyPremiumData | null;
    bonusPremium: Bonus | null;
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
  }> = [];
  cachedSelectedEmployees: Employee[] = [];
  cachedHasBonus: boolean = false;

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private monthlySalaryService: MonthlySalaryService,
    private salaryCalculationService: SalaryCalculationService,
    private settingsService: SettingsService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private roomIdService: RoomIdService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService,
    private bonusCalculationService: BonusCalculationService,
    private suijiService: SuijiService,
    private premiumStoppingRuleService: PremiumStoppingRuleService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private premiumCalculationService: PremiumCalculationService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService
  ) {
    // 年度選択用の年度リストを生成（2020〜2030）
    for (let y = 2020; y <= 2030; y++) {
      this.availableYears.push(y);
    }
  }

  ngOnInit(): void {
    // 従業員情報の変更を直接購読（observeEmployeesを使用）
    this.employeeSubscription = this.employeeService
      .observeEmployees()
      .subscribe(async () => {
        // 従業員情報が変更されたときは、既に表示されているデータがあれば再読み込み
        // loadSelectedEmployeesData内で最新の従業員情報を取得する
        if (this.selectedEmployeeIds.size > 0) {
          // 賞与の保険料を再計算して保存（産休・育休解除などに対応）
          try {
            await this.recalculateAndSaveBonuses();
          } catch (error) {
            console.error(
              '[insurance-result-page] 賞与の再計算・保存エラー:',
              error
            );
            // エラーが発生しても、表示データの再読み込みは続行する
          }
          // 表示データを再読み込み
          await this.loadSelectedEmployeesData();
        }
      });

    // 加入区分の変更も購読（既存のロジックを維持）
    this.eligibilitySubscription = this.employeeEligibilityService
      .observeEligibility()
      .subscribe(
        (eligibilityMap) => {
          // 加入区分変更時は、既に表示されているデータがあれば再読み込み
          // loadSelectedEmployeesData内で最新の従業員情報を取得する
          if (this.selectedEmployeeIds.size > 0) {
            this.loadSelectedEmployeesData();
          }
        },
        (error) => {
          console.error(
            '[insurance-result-page] observeEligibility エラー',
            error
          );
        }
      );

    // 従業員リストの取得とソートを非同期で実行（UIブロックを防ぐ）
    // Promise.then()を使うことで、ngOnInitがすぐに完了し、UIがブロックされない
    this.employeeService
      .getAllEmployees()
      .then((employeesData) => {
        this.employees = employeesData || [];
        // ソート処理を次のイベントループに回す（UIの応答性を保つ）
        setTimeout(() => {
          this.sortedEmployees = this.sortEmployeesByName(this.employees);
        }, 0);
      })
      .catch((error) => {
        console.error('従業員データの取得エラー:', error);
        this.employees = [];
        this.sortedEmployees = [];
      });
  }

  /**
   * 従業員を名前（カナ）で50音順にソート（簡略版）
   * 50音 → アルファベット → 数字の順
   */
  sortEmployeesByName(employees: Employee[]): Employee[] {
    // 簡略化：localeCompareだけで十分な場合が多い
    return [...employees].sort((a, b) => {
      const nameA = (a as any).nameKana || a.name || '';
      const nameB = (b as any).nameKana || b.name || '';
      return nameA.localeCompare(nameB, 'ja');
    });
  }

  /**
   * 従業員の選択状態を変更（selectのchangeイベント用）
   */
  onEmployeeSelectionChange(selectedIds: string[]): void {
    this.selectedEmployeeIds = new Set(selectedIds);
    // キャッシュを更新
    this.cachedSelectedEmployeeIdsArray = selectedIds;
    this.cachedSelectedEmployees = this.calculateSelectedEmployees();
    // 従業員選択が変更されたらデータをクリア（再読み込みは「結果表示」ボタンで）
    this.clearInsuranceData();
  }

  /**
   * チェックボックスの変更を処理
   */
  onEmployeeCheckboxChange(employeeId: string, checked: boolean): void {
    if (checked) {
      this.selectedEmployeeIds.add(employeeId);
    } else {
      this.selectedEmployeeIds.delete(employeeId);
    }
    // キャッシュを更新
    this.cachedSelectedEmployeeIdsArray = Array.from(this.selectedEmployeeIds);
    this.cachedSelectedEmployees = this.calculateSelectedEmployees();
    // 従業員選択が変更されたらデータをクリア（再読み込みは「結果表示」ボタンで）
    this.clearInsuranceData();
  }

  /**
   * 従業員が選択されているかどうかを判定
   */
  isEmployeeSelected(employeeId: string): boolean {
    return this.selectedEmployeeIds.has(employeeId);
  }

  /**
   * 全選択/全解除
   */
  toggleSelectAll(): void {
    if (this.selectedEmployeeIds.size === this.sortedEmployees.length) {
      // 全解除
      this.selectedEmployeeIds.clear();
    } else {
      // 全選択
      this.selectedEmployeeIds = new Set(
        this.sortedEmployees.map((emp) => emp.id)
      );
    }
    // キャッシュを更新
    this.cachedSelectedEmployeeIdsArray = Array.from(this.selectedEmployeeIds);
    this.cachedSelectedEmployees = this.calculateSelectedEmployees();
    // 従業員選択が変更されたらデータをクリア（再読み込みは「結果表示」ボタンで）
    this.clearInsuranceData();
  }

  /**
   * 全選択されているかどうかを判定
   */
  isAllSelected(): boolean {
    return (
      this.sortedEmployees.length > 0 &&
      this.selectedEmployeeIds.size === this.sortedEmployees.length
    );
  }

  /**
   * 結果表示ボタンクリック時：選択された従業員のデータだけを読み込む
   * 従業員情報が更新された場合に備えて、賞与の保険料を再計算して保存してから計算する
   */
  async onShowResults(): Promise<void> {
    if (this.selectedEmployeeIds.size === 0) {
      alert('従業員を選択してください');
      return;
    }

    // 従業員情報が更新された場合に備えて、最新の従業員情報を取得
    await this.refreshEmployeesList();

    // 選択された従業員の賞与を再計算して保存
    await this.recalculateAndSaveBonuses();

    // 保険料を計算
    await this.loadSelectedEmployeesData();
  }

  /**
   * 選択された従業員の賞与を再計算して保存
   */
  private async recalculateAndSaveBonuses(): Promise<void> {
    const roomId = this.roomIdService.requireRoomId();
    const selectedEmployees = this.sortedEmployees.filter((emp) =>
      this.selectedEmployeeIds.has(emp.id)
    );

    for (const emp of selectedEmployees) {
      try {
        // 該当年度の賞与を取得
        const bonuses = await this.bonusService.listBonuses(
          roomId,
          emp.id,
          this.year
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
                  this.year
                );

              if (calculationResult) {
                // 賞与を保存（計算結果を反映）
                const bonusId =
                  bonus.id || `bonus_${bonus.payDate.replace(/-/g, '')}`;
                const updateData: any = {
                  roomId: roomId,
                  employeeId: emp.id,
                  year: this.year,
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
                  this.year,
                  bonusId,
                  updateData
                );
              }
            } catch (error) {
              console.error(
                `[insurance-result-page] 賞与の再計算・保存エラー: ${emp.name} (${bonus.payDate})`,
                error
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `[insurance-result-page] 賞与の取得エラー: ${emp.name}`,
          error
        );
      }
    }
  }

  /**
   * 従業員リストを最新の情報に更新
   */
  private async refreshEmployeesList(): Promise<void> {
    try {
      const employeesData = await this.employeeService.getAllEmployees();
      this.employees = employeesData || [];
      this.sortedEmployees = this.sortEmployeesByName(this.employees);
    } catch (error) {
      console.error(
        '[insurance-result-page] 従業員データの再取得エラー:',
        error
      );
    }
  }

  /**
   * 選択された従業員のデータだけを読み込む
   */
  private async loadSelectedEmployeesData(): Promise<void> {
    if (this.selectedEmployeeIds.size === 0) {
      return;
    }

    this.isLoadingInsuranceData = true;

    try {
      // 従業員情報が更新された可能性があるため、最新の情報を取得
      await this.refreshEmployeesList();

      // 対象月ごとに標準報酬月額テーブルを取得（3月始まりの年度判定）
      const monthsToCalc =
        this.selectedMonth === 'all'
          ? Array.from({ length: 12 }, (_, i) => i + 1)
          : [this.selectedMonth as number];
      const gradeTableByMonth: { [month: number]: any[] } = {};
      for (const m of monthsToCalc) {
        gradeTableByMonth[m] =
          await this.settingsService.getStandardTableForMonth(this.year, m);
      }

      // 随時改定アラートを取得
      const suijiAlerts = await this.suijiService.loadAlerts(this.year);

      // 選択された従業員だけを取得（最新の情報を使用）
      const selectedEmployees = this.sortedEmployees.filter((emp) =>
        this.selectedEmployeeIds.has(emp.id)
      );

      // 選択された従業員をバッチ処理（一度に2人ずつ処理してUIの応答性を保つ）
      const batchSize = 2;
      for (let i = 0; i < selectedEmployees.length; i += batchSize) {
        const batch = selectedEmployees.slice(i, i + batchSize);

        // バッチ内の従業員を並列処理
        await Promise.all(
          batch.map((emp) => {
            return this.processEmployeeInsuranceData(
              emp,
              gradeTableByMonth,
              monthsToCalc,
              suijiAlerts
            );
          })
        );

        // UIの更新を許可するために少し待機
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // キャッシュを更新
      this.updateCachedData();
    } finally {
      this.isLoadingInsuranceData = false;
    }
  }

  /**
   * 選択された従業員IDの配列を取得（selectのngModel用・キャッシュ版）
   */
  getSelectedEmployeeIdsArray(): string[] {
    return this.cachedSelectedEmployeeIdsArray;
  }

  /**
   * trackBy関数（*ngForのパフォーマンス改善用）
   */
  trackByEmployeeId(index: number, employee: Employee): string {
    return employee.id;
  }

  /**
   * 選択された従業員のリストを取得（キャッシュ版）
   */
  getSelectedEmployees(): Employee[] {
    return this.cachedSelectedEmployees;
  }

  /**
   * 選択された従業員のリストを計算
   */
  private calculateSelectedEmployees(): Employee[] {
    return this.sortedEmployees.filter((emp) =>
      this.selectedEmployeeIds.has(emp.id)
    );
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
    this.employeeSubscription?.unsubscribe();
  }

  async reloadEligibility(): Promise<void> {
    // 加入区分が変更された場合、既に表示されているデータがあれば再読み込み
    if (this.selectedEmployeeIds.size > 0) {
      await this.loadSelectedEmployeesData();
    }
  }

  async onYearChange(): Promise<void> {
    // 年度変更時はデータをクリア（再読み込みは「結果表示」ボタンで）
    this.clearInsuranceData();
  }

  onMonthChange(): void {
    // 月変更時はデータをクリア（再読み込みは「結果表示」ボタンで）
    // selectedMonthを数値に変換（文字列の場合）
    if (
      this.selectedMonth !== 'all' &&
      typeof this.selectedMonth === 'string'
    ) {
      this.selectedMonth = Number(this.selectedMonth);
    }
    this.clearInsuranceData();
  }

  /**
   * 保険料データをクリア
   */
  private clearInsuranceData(): void {
    this.insuranceData = {};
    this.bonusData = {};
    // キャッシュもクリア
    this.cachedTableRows = [];
    this.cachedSelectedEmployees = [];
    this.cachedHasBonus = false;
    this.errorMessages = {};
    this.warningMessages = {};
  }

  /**
   * 保険料データが存在するかどうか（テンプレート用）
   */
  hasInsuranceData(): boolean {
    return Object.keys(this.insuranceData).length > 0;
  }

  getMonthLabel(): string {
    if (this.selectedMonth === 'all') {
      return '';
    }
    const month =
      typeof this.selectedMonth === 'string'
        ? Number(this.selectedMonth)
        : this.selectedMonth;
    return `${month}月`;
  }

  getFilteredMonthlyPremiums(
    premiums: MonthlyPremiumData[]
  ): MonthlyPremiumData[] {
    if (this.selectedMonth === 'all') {
      return premiums;
    }
    const month =
      typeof this.selectedMonth === 'string'
        ? Number(this.selectedMonth)
        : this.selectedMonth;
    return premiums.filter((p) => p.month === month);
  }

  getFilteredBonus(employeeId: string): Bonus | null {
    const bonuses = this.bonusData[employeeId] || [];
    if (this.selectedMonth === 'all') {
      // 全月選択時は最新1回分を表示
      return bonuses.length > 0
        ? bonuses.sort(
            (a, b) =>
              new Date(b.payDate || '').getTime() -
              new Date(a.payDate || '').getTime()
          )[0]
        : null;
    }
    // 特定月選択時は支給日ベースで該当月の賞与を表示
    const month =
      typeof this.selectedMonth === 'string'
        ? Number(this.selectedMonth)
        : this.selectedMonth;
    // this.yearを数値に変換（文字列の場合に備えて）
    const selectedYearNum =
      typeof this.year === 'string' ? parseInt(this.year, 10) : this.year;

    const filtered = bonuses.filter((b) => {
      if (!b.payDate) return false;
      // 支給日から年と月を抽出
      const payDateObj = new Date(b.payDate);
      const payYear = payDateObj.getFullYear();
      const payMonth = payDateObj.getMonth() + 1; // getMonth()は0-11なので+1

      // selectedYearとselectedMonthに完全一致する賞与のみ
      return payYear === selectedYearNum && payMonth === month;
    });

    return filtered.length > 0 ? filtered[0] : null;
  }

  /**
   * キャッシュされたデータを更新
   */
  private updateCachedData(): void {
    this.cachedTableRows = this.calculateTableRows();
    this.cachedSelectedEmployees = this.calculateSelectedEmployees();
    this.cachedHasBonus = this.calculateHasBonus();
  }

  /**
   * 個別の従業員の保険料データを処理
   */
  private async processEmployeeInsuranceData(
    emp: Employee,
    gradeTableByMonth: { [month: number]: any[] },
    targetMonths: number[],
    suijiAlerts: (SuijiKouhoResult & { id: string })[]
  ): Promise<void> {
    try {
      const roomId = this.roomIdService.requireRoomId();
      this.errorMessages[emp.id] = [];
      this.warningMessages[emp.id] = [];

      // 標準報酬履歴を生成（選択年度の履歴が確実に存在するように）
      await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(
        emp.id,
        emp
      );

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

      for (const month of targetMonths) {
        const monthData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          emp.id,
          this.year,
          month
        );
        const monthKey = month.toString();

        // 給与データの取得（存在しない場合は0）
        const fixedSalary =
          monthData?.fixedTotal ??
          monthData?.fixed ??
          monthData?.fixedSalary ??
          0;
        const variableSalary =
          monthData?.variableTotal ??
          monthData?.variable ??
          monthData?.variableSalary ??
          0;

        // 標準報酬月額を従業員データと履歴から取得（給与0でも計算するため）
        // this.yearを数値に変換（文字列の場合に備えて）
        const selectedYearNum =
          typeof this.year === 'string' ? parseInt(this.year, 10) : this.year;

        let standardFromHistory =
          (await this.standardRemunerationHistoryService.getStandardRemunerationForMonth(
            emp.id,
            selectedYearNum,
            month
          )) || 0;

        // 標準報酬履歴から取得できない場合、資格取得時決定の履歴を確認
        if (!standardFromHistory || standardFromHistory === 0) {
          const allHistories =
            await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
              emp.id
            );

          // 資格取得時決定の履歴を探す（保険加入年月以前で最も新しいもの）
          // 保険加入日が未設定の場合は入社日をフォールバックとして使用
          const insuranceJoinDate = emp.insuranceJoinDate || emp.joinDate;
          if (insuranceJoinDate) {
            const joinDate = new Date(insuranceJoinDate);
            const joinYear = joinDate.getFullYear();
            const joinMonth = joinDate.getMonth() + 1;

            // 既存の入社日も取得（既存履歴との互換性のため）
            let joinYearFromJoinDate: number | null = null;
            let joinMonthFromJoinDate: number | null = null;
            if (emp.joinDate) {
              const joinDateFromJoinDate = new Date(emp.joinDate);
              if (!isNaN(joinDateFromJoinDate.getTime())) {
                joinYearFromJoinDate = joinDateFromJoinDate.getFullYear();
                joinMonthFromJoinDate = joinDateFromJoinDate.getMonth() + 1;
              }
            }

            // 選択年度が保険加入年以降の場合、資格取得時決定の履歴を使用
            // this.yearを数値に変換（文字列の場合に備えて）
            const selectedYearNum =
              typeof this.year === 'string'
                ? parseInt(this.year, 10)
                : this.year;

            if (selectedYearNum >= joinYear) {
              // 既存履歴との互換性を考慮：保険加入年月と入社年月の両方を検索
              const acquisitionHistory = allHistories.find(
                (h) =>
                  h.determinationReason === 'acquisition' &&
                  ((h.applyStartYear === joinYear &&
                    h.applyStartMonth === joinMonth) ||
                    (joinYearFromJoinDate !== null &&
                      joinMonthFromJoinDate !== null &&
                      h.applyStartYear === joinYearFromJoinDate &&
                      h.applyStartMonth === joinMonthFromJoinDate))
              );

              if (acquisitionHistory) {
                // 選択年度の該当月が保険加入月以降の場合、資格取得時決定の標準報酬月額を使用
                const isAfterJoinMonth =
                  selectedYearNum > joinYear ||
                  (selectedYearNum === joinYear && month >= joinMonth);

                if (isAfterJoinMonth) {
                  standardFromHistory =
                    acquisitionHistory.standardMonthlyRemuneration;
                }
              } else {
                // 資格取得時決定の履歴が見つからない場合、月額賃金から直接計算
                const monthlyWage = (emp as any).monthlyWage;
                if (monthlyWage && monthlyWage > 0) {
                  // 保険加入年の標準報酬等級表を取得
                  const gradeTable =
                    await this.settingsService.getStandardTable(joinYear);
                  if (gradeTable && gradeTable.length > 0) {
                    const result =
                      this.salaryCalculationService.getStandardMonthlyRemuneration(
                        monthlyWage,
                        gradeTable
                      );
                    if (result && result.standard > 0) {
                      standardFromHistory = result.standard;
                    }
                  }
                }
              }
            }
          }
        }

        // 標準報酬履歴から取得した値を優先する
        // これにより、定時改定や随時改定で標準報酬月額が変わった場合も正しく反映される
        // emp.currentStandardMonthlyRemunerationは従業員データの現在値であり、
        // 過去の月では定時改定・随時改定前の値のままの可能性があるため、履歴を優先する
        const effectiveStandard =
          standardFromHistory > 0
            ? standardFromHistory
            : emp.currentStandardMonthlyRemuneration &&
              emp.currentStandardMonthlyRemuneration > 0
            ? emp.currentStandardMonthlyRemuneration
            : 0;
        const hasStandardRemuneration = effectiveStandard > 0;

        // 給与がある場合、または標準報酬月額が確定している場合は保険料を計算
        if (fixedSalary > 0 || variableSalary > 0 || hasStandardRemuneration) {
          const gradeTable = gradeTableByMonth[month];
          // 従業員データに標準報酬が無い場合は履歴から取得した値をセットして計算
          const employeeForCalc =
            hasStandardRemuneration && effectiveStandard
              ? {
                  ...emp,
                  currentStandardMonthlyRemuneration: effectiveStandard,
                }
              : emp;

          const premiumResult =
            await this.salaryCalculationService.calculateMonthlyPremiums(
              employeeForCalc,
              this.year,
              month,
              fixedSalary,
              variableSalary,
              gradeTable,
              suijiAlerts
            );

          // 標準報酬等級を取得（premium-calculation.service.tsと同じロジックで随時改定を優先）
          const totalSalary = fixedSalary + variableSalary;
          let grade: number | null = null;
          let standardMonthlyRemuneration = 0;

          // 1. 随時改定が適用されている場合は新しい等級を使用
          let appliedSuiji: SuijiKouhoResult | null = null;
          if (suijiAlerts && suijiAlerts.length > 0) {
            const employeeSuiji = suijiAlerts.filter(
              (alert) => alert.employeeId === emp.id && alert.isEligible
            );
            const applicableSuiji = employeeSuiji
              .filter((alert) => {
                const applyStartMonth = alert.applyStartMonth;
                return applyStartMonth <= month;
              })
              .sort((a, b) => {
                // 降順ソート：適用開始月が大きい（現在の月に近い）ものを優先
                return b.applyStartMonth - a.applyStartMonth;
              });

            if (applicableSuiji.length > 0) {
              appliedSuiji = applicableSuiji[0];
            }
          }

          if (appliedSuiji && gradeTable) {
            const newGradeRow = gradeTable.find(
              (r: any) => r.rank === appliedSuiji!.newGrade
            );
            if (newGradeRow && newGradeRow.standard) {
              const suijiStandard = newGradeRow.standard;
              grade = appliedSuiji.newGrade;
              standardMonthlyRemuneration = suijiStandard;
            }
          }

          // 2. 標準報酬履歴から取得（随時改定が適用されていない場合）
          if (!standardMonthlyRemuneration && emp.id) {
            const historyStandard =
              await this.standardRemunerationHistoryService.getStandardRemunerationForMonth(
                emp.id,
                selectedYearNum,
                month
              );

            if (historyStandard && historyStandard > 0) {
              standardMonthlyRemuneration = historyStandard;
              if (gradeTable) {
                const gradeRow = gradeTable.find(
                  (r: any) => r.standard === historyStandard
                );
                if (gradeRow) {
                  grade = gradeRow.rank;
                }
              }
            }
          }

          // 3. 従業員データの標準報酬月額を確認
          if (
            !standardMonthlyRemuneration &&
            emp.currentStandardMonthlyRemuneration &&
            emp.currentStandardMonthlyRemuneration > 0
          ) {
            const teijiStandard = emp.currentStandardMonthlyRemuneration;
            standardMonthlyRemuneration = teijiStandard;
            if (gradeTable) {
              const gradeRow = gradeTable.find(
                (r: any) => r.standard === teijiStandard
              );
              if (gradeRow) {
                grade = gradeRow.rank;
              }
            }
          }

          // 4. その月の給与額から等級を判定（標準報酬月額が確定していない場合）
          if (!standardMonthlyRemuneration && totalSalary > 0 && gradeTable) {
            const gradeRow = gradeTable.find(
              (r: any) => totalSalary >= r.lower && totalSalary < r.upper
            );
            if (gradeRow) {
              grade = gradeRow.rank;
              standardMonthlyRemuneration = gradeRow.standard;
            }
          }

          // 免除判定（Service統一ロジックを使用）
          const isExempt = this.salaryCalculationService.isExemptMonth(
            emp,
            this.year,
            month
          );
          const exemptInfo =
            this.salaryCalculationService.getExemptReasonForMonth(
              emp,
              this.year,
              month
            );
          const exemptReason = isExempt ? exemptInfo?.reason || '免除中' : '';

          // 免除月は保険料を0として扱う（念のためUI集計側でも明示ゼロ化）
          const healthEmployee = isExempt ? 0 : premiumResult.health_employee;
          const healthEmployer = isExempt ? 0 : premiumResult.health_employer;
          const careEmployee = isExempt ? 0 : premiumResult.care_employee;
          const careEmployer = isExempt ? 0 : premiumResult.care_employer;
          const pensionEmployee = isExempt ? 0 : premiumResult.pension_employee;
          const pensionEmployer = isExempt ? 0 : premiumResult.pension_employer;

          // 計算式を生成（ツールチップ表示用）
          let calculationFormula:
            | { health?: string; care?: string; pension?: string }
            | undefined;

          /**
           * 保険非加入の判定（正式仕様）
           *
           * 【保険非加入の定義】
           * 以下の2つのケースを「保険非加入」として扱う：
           *
           * 1. 勤務区分による保険非加入
           *    - 従業員の勤務区分が「社会保険未加入」である場合
           *    - 判定方法: EmployeeWorkCategoryService.isNonInsured(employee) が true を返す
           *    - 保険料計算: premium-calculation.service.ts の174行目で全保険料を0円に設定
           *    - 理由: reasons に「勤務区分が「社会保険未加入」のため保険料は0円」を追加
           *
           * 2. 保険加入月より前の期間
           *    - 保険加入日（insuranceJoinDate または joinDate）より前の期間で、保険料が0円の場合
           *    - 判定方法:
           *      - 保険料が0円（healthEmployee === 0 && healthEmployer === 0 && pensionEmployee === 0 && pensionEmployer === 0）
           *      - かつ、対象年月が保険加入年月より前（selectedYear < joinYear || (selectedYear === joinYear && month < joinMonth)）
           *    - 保険料計算: premium-calculation.service.ts の587-593行目で healthBase が0になる
           *    - 理由: reasons には明示的な理由が追加されない（保険加入月より前のため自動的に0円）
           *
           * 【保険料0円との違い】
           * 保険料が0円になるケースは複数あるが、「保険非加入」と表示すべきは上記2つのみ。
           * その他の保険料0円のケース（退職後、産休・育休、年齢到達など）は計算式を表示するか、別の理由を表示する。
           */
          const isNonInsured =
            this.employeeWorkCategoryService.isNonInsured(emp);
          const hasNonInsuredReason = premiumResult.reasons.some(
            (r) => r.includes('社会保険未加入') || r.includes('保険未加入')
          );

          // 保険加入月より前の期間を判定
          // 保険料が0円で、かつ保険加入月より前の期間の場合も「保険非加入」と表示する
          let isBeforeInsuranceJoinMonth = false;
          const insuranceJoinDate = emp.insuranceJoinDate || emp.joinDate;
          if (
            insuranceJoinDate &&
            healthEmployee === 0 &&
            healthEmployer === 0 &&
            pensionEmployee === 0 &&
            pensionEmployer === 0
          ) {
            const joinDate = new Date(insuranceJoinDate);
            if (!isNaN(joinDate.getTime())) {
              const joinYear = joinDate.getFullYear();
              const joinMonth = joinDate.getMonth() + 1;
              const selectedYearNum =
                typeof this.year === 'string'
                  ? parseInt(this.year, 10)
                  : this.year;
              // 保険加入月より前の期間かどうかを判定
              if (
                selectedYearNum < joinYear ||
                (selectedYearNum === joinYear && month < joinMonth)
              ) {
                isBeforeInsuranceJoinMonth = true;
              }
            }
          }

          if (!isExempt && standardMonthlyRemuneration > 0) {
            // 保険非加入または保険加入月より前の期間の場合は計算式を生成しない
            if (
              isNonInsured ||
              hasNonInsuredReason ||
              isBeforeInsuranceJoinMonth
            ) {
              calculationFormula = {
                health: '保険非加入',
                pension: '保険非加入',
              };
            } else {
              try {
                // 年齢による停止を判定
                let isPensionStopped = false;
                let isHealthStopped = false;

                if (emp.birthDate) {
                  try {
                    const age = this.employeeLifecycleService.getAgeAtMonth(
                      emp.birthDate,
                      selectedYearNum,
                      month
                    );

                    const stoppingFlags =
                      this.premiumStoppingRuleService.getStoppingFlags(
                        emp,
                        selectedYearNum,
                        month,
                        age
                      );

                    isPensionStopped = stoppingFlags.isPensionStopped;
                    isHealthStopped = stoppingFlags.isHealthStopped;
                  } catch (ageError) {
                    // 年齢計算に失敗しても既存処理には影響しない
                    console.warn(
                      `年齢計算に失敗しました（${emp.id}, ${this.year}年${month}月）:`,
                      ageError
                    );
                  }
                }

                // 料率を取得
                const prefecture = (emp as any).prefecture || 'tokyo';
                const rates = await this.settingsService.getRates(
                  this.year.toString(),
                  prefecture,
                  month.toString()
                );

                if (rates) {
                  // 介護保険の判定
                  const careType = emp.birthDate
                    ? this.salaryCalculationService.getCareInsuranceType(
                        emp.birthDate,
                        selectedYearNum,
                        month
                      )
                    : 'none';
                  const isCareApplicable = careType === 'type2';

                  // 健康保険の計算式（75歳以上で停止されている場合は「加入対象外」を表示）
                  if (isHealthStopped) {
                    calculationFormula = {
                      health: '加入対象外（75歳到達）',
                    };
                  } else {
                    // 健康保険の計算式（介護保険料率は含めない）
                    const healthRateTotal =
                      rates.health_employee + rates.health_employer;
                    const healthRatePercent = (healthRateTotal * 100).toFixed(
                      3
                    );
                    calculationFormula = {
                      health: `標準報酬${standardMonthlyRemuneration.toLocaleString()}円×${healthRatePercent}% /2`,
                    };

                    // 介護保険の計算式
                    if (isCareApplicable && standardMonthlyRemuneration > 0) {
                      // 40歳～64歳の場合：計算式を表示
                      const careRateTotal =
                        rates.care_employee + rates.care_employer;
                      const careRatePercent = (careRateTotal * 100).toFixed(3);
                      calculationFormula = {
                        ...calculationFormula,
                        care: `標準報酬${standardMonthlyRemuneration.toLocaleString()}円×${careRatePercent}% /2`,
                      };
                    } else if (careType === 'none') {
                      // 40歳未満の場合：対象外を表示
                      calculationFormula = {
                        ...calculationFormula,
                        care: '対象外（40歳未満）',
                      };
                    } else if (careType === 'type1') {
                      // 65歳以上の場合：対象外を表示
                      calculationFormula = {
                        ...calculationFormula,
                        care: '対象外（65歳以上）',
                      };
                    }
                  }

                  // 厚生年金の計算式（70歳以上で停止されている場合は「加入対象外」を表示）
                  if (isPensionStopped) {
                    calculationFormula = {
                      ...calculationFormula,
                      pension: '加入対象外（70歳到達）',
                    };
                  } else {
                    // 厚生年金用の標準報酬月額を補正（上限・下限の適用）
                    const adjustment =
                      this.premiumCalculationService.adjustPensionStandardMonthlyRemuneration(
                        standardMonthlyRemuneration
                      );
                    const adjustedStandard = adjustment.adjusted;
                    const pensionRateTotal =
                      rates.pension_employee + rates.pension_employer;
                    const pensionRatePercent = (pensionRateTotal * 100).toFixed(
                      2
                    );
                    // 上限・下限に該当する場合は理由を追加
                    const reasonText = adjustment.reason
                      ? `（厚生年金${adjustment.reason}）`
                      : '';
                    calculationFormula = {
                      ...calculationFormula,
                      pension: `標準報酬${adjustedStandard.toLocaleString()}円×${pensionRatePercent}%${reasonText} /2`,
                    };
                  }
                }
              } catch (error) {
                // 計算式の生成に失敗しても既存処理には影響しない
                console.warn(
                  `計算式の生成に失敗しました（${emp.id}, ${this.year}年${month}月）:`,
                  error
                );
              }
            }
          }

          const monthlyPremium: MonthlyPremiumData = {
            month,
            grade,
            standardMonthlyRemuneration,
            healthEmployee,
            healthEmployer,
            careEmployee,
            careEmployer,
            pensionEmployee,
            pensionEmployer,
            total:
              healthEmployee +
              healthEmployer +
              careEmployee +
              careEmployer +
              pensionEmployee +
              pensionEmployer,
            isExempt,
            exemptReason,
            reasons: [],
            calculationFormula,
          };

          monthlyPremiums.push(monthlyPremium);

          // 月次合計に加算
          monthlyTotal.healthEmployee += healthEmployee;
          monthlyTotal.healthEmployer += healthEmployer;
          monthlyTotal.careEmployee += careEmployee;
          monthlyTotal.careEmployer += careEmployer;
          monthlyTotal.pensionEmployee += pensionEmployee;
          monthlyTotal.pensionEmployer += pensionEmployer;
        }
      }

      monthlyTotal.total =
        monthlyTotal.healthEmployee +
        monthlyTotal.healthEmployer +
        monthlyTotal.careEmployee +
        monthlyTotal.careEmployer +
        monthlyTotal.pensionEmployee +
        monthlyTotal.pensionEmployer;

      // 賞与データを取得
      const bonuses = await this.bonusService.listBonuses(
        roomId,
        emp.id,
        this.year
      );
      this.bonusData[emp.id] = bonuses || [];
      const latestBonus =
        bonuses && bonuses.length > 0
          ? bonuses.sort(
              (a: Bonus, b: Bonus) =>
                new Date(b.payDate || '').getTime() -
                new Date(a.payDate || '').getTime()
            )[0]
          : null;

      // 賞与の年間合計を計算（賞与額が0のものは除外）
      // 従業員情報が更新された場合に備えて、賞与の保険料も再計算する
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
        // 賞与額が0の場合は除外（免除中かどうかに関わらず）
        if (
          bonus.amount > 0 &&
          !bonus.isExempted &&
          !bonus.isSalaryInsteadOfBonus
        ) {
          // 賞与入力画面で保存済みの保険料データを優先的に使用
          // 保険料が保存されていない場合のみ再計算する
          let recalculatedPremiums = {
            healthEmployee: bonus.healthEmployee || 0,
            healthEmployer: bonus.healthEmployer || 0,
            careEmployee: bonus.careEmployee || 0,
            careEmployer: bonus.careEmployer || 0,
            pensionEmployee: bonus.pensionEmployee || 0,
            pensionEmployer: bonus.pensionEmployer || 0,
          };

          // 保険料が保存されていない場合のみ再計算
          const hasStoredPremiums =
            (bonus.healthEmployee !== undefined &&
              bonus.healthEmployee !== null) ||
            (bonus.pensionEmployee !== undefined &&
              bonus.pensionEmployee !== null);

          if (!hasStoredPremiums && bonus.payDate) {
            try {
              const calculationResult =
                await this.bonusCalculationService.calculateBonus(
                  emp,
                  emp.id,
                  bonus.amount,
                  bonus.payDate,
                  this.year
                );

              if (calculationResult) {
                // 再計算した結果を使用
                recalculatedPremiums = {
                  healthEmployee: calculationResult.healthEmployee || 0,
                  healthEmployer: calculationResult.healthEmployer || 0,
                  careEmployee: calculationResult.careEmployee || 0,
                  careEmployer: calculationResult.careEmployer || 0,
                  pensionEmployee: calculationResult.pensionEmployee || 0,
                  pensionEmployer: calculationResult.pensionEmployer || 0,
                };

                // bonusオブジェクトにも再計算結果を反映（表示用）
                bonus.healthEmployee = calculationResult.healthEmployee || 0;
                bonus.healthEmployer = calculationResult.healthEmployer || 0;
                bonus.careEmployee = calculationResult.careEmployee || 0;
                bonus.careEmployer = calculationResult.careEmployer || 0;
                bonus.pensionEmployee = calculationResult.pensionEmployee || 0;
                bonus.pensionEmployer = calculationResult.pensionEmployer || 0;

                // 計算式生成に必要な情報も保存
                if (calculationResult.cappedBonusHealth !== undefined) {
                  bonus.cappedBonusHealth = calculationResult.cappedBonusHealth;
                }
                if (calculationResult.cappedBonusPension !== undefined) {
                  bonus.cappedBonusPension =
                    calculationResult.cappedBonusPension;
                }
                if (calculationResult.standardBonus !== undefined) {
                  bonus.standardBonusAmount = calculationResult.standardBonus;
                }
              }
            } catch (error) {
              console.error(
                `[insurance-result-page] 賞与の再計算エラー: ${emp.name} (${bonus.payDate})`,
                error
              );
              // エラーが発生した場合は、既存の値をそのまま使用
            }
          }

          // 計算式を生成（ツールチップ表示用）
          // 既存の賞与データにも計算式を生成するため、再計算の有無に関わらず実行
          if (!bonus.isExempted && bonus.payDate) {
            try {
              const payDateObj = new Date(bonus.payDate);
              const payYear = payDateObj.getFullYear();
              const payMonth = payDateObj.getMonth() + 1;

              // 標準賞与額を取得（上限適用後の額を優先）
              // cappedBonusHealth/cappedBonusPensionが存在しない場合は、再計算を試みる
              let standardBonusHealth =
                bonus.cappedBonusHealth ?? bonus.standardBonusAmount ?? 0;
              let standardBonusPension =
                bonus.cappedBonusPension ?? bonus.standardBonusAmount ?? 0;

              // 標準賞与額が取得できない場合、再計算を試みる
              if (
                standardBonusHealth === 0 &&
                standardBonusPension === 0 &&
                bonus.amount > 0
              ) {
                try {
                  const calculationResult =
                    await this.bonusCalculationService.calculateBonus(
                      emp,
                      emp.id,
                      bonus.amount,
                      bonus.payDate,
                      this.year
                    );

                  if (calculationResult) {
                    standardBonusHealth =
                      calculationResult.cappedBonusHealth ??
                      calculationResult.standardBonus ??
                      0;
                    standardBonusPension =
                      calculationResult.cappedBonusPension ??
                      calculationResult.standardBonus ??
                      0;

                    // bonusオブジェクトにも保存（次回の表示時に使用）
                    if (calculationResult.cappedBonusHealth !== undefined) {
                      bonus.cappedBonusHealth =
                        calculationResult.cappedBonusHealth;
                    }
                    if (calculationResult.cappedBonusPension !== undefined) {
                      bonus.cappedBonusPension =
                        calculationResult.cappedBonusPension;
                    }
                    if (calculationResult.standardBonus !== undefined) {
                      bonus.standardBonusAmount =
                        calculationResult.standardBonus;
                    }
                  }
                } catch (error) {
                  // 再計算に失敗しても計算式の生成は続行（標準賞与額が0の場合は計算式を生成しない）
                  console.warn(
                    `賞与の再計算に失敗しました（${emp.id}, ${bonus.payDate}）:`,
                    error
                  );
                }
              }

              // 年齢による停止を判定
              let isPensionStopped = false;
              let isHealthStopped = false;

              if (emp.birthDate) {
                try {
                  const age = this.employeeLifecycleService.getAgeAtMonth(
                    emp.birthDate,
                    payYear,
                    payMonth
                  );

                  const stoppingFlags =
                    this.premiumStoppingRuleService.getStoppingFlags(
                      emp,
                      payYear,
                      payMonth,
                      age
                    );

                  isPensionStopped = stoppingFlags.isPensionStopped;
                  isHealthStopped = stoppingFlags.isHealthStopped;
                } catch (ageError) {
                  // 年齢計算に失敗しても既存処理には影響しない
                  console.warn(
                    `賞与の年齢計算に失敗しました（${emp.id}, ${bonus.payDate}）:`,
                    ageError
                  );
                }
              }

              // 料率を取得して計算式を生成
              // 健康保険は年間上限オーバー時でも計算式を表示するため、standardBonusHealth >= 0 の条件で生成
              // 厚生年金は既存ロジックを維持（standardBonusPension > 0）
              if (standardBonusHealth >= 0 || standardBonusPension > 0) {
                // 料率を取得
                const prefecture = (emp as any).prefecture || 'tokyo';
                const rates = await this.settingsService.getRates(
                  payYear.toString(),
                  prefecture,
                  payMonth.toString()
                );

                if (rates) {
                  // 介護保険の判定
                  const careType = emp.birthDate
                    ? this.salaryCalculationService.getCareInsuranceType(
                        emp.birthDate,
                        payYear,
                        payMonth
                      )
                    : 'none';
                  const isCareApplicable = careType === 'type2';

                  // 健康保険の計算式
                  // 75歳以上で停止されている場合は「加入対象外」を表示
                  if (isHealthStopped) {
                    bonus.calculationFormula = {
                      health: '加入対象外（75歳到達）',
                    };
                  } else if (standardBonusHealth >= 0) {
                    // 年間上限オーバー時（standardBonusHealth = 0）でも計算式を表示
                    // 健康保険の計算式（介護保険料率は含めない）
                    const healthRateTotal =
                      rates.health_employee + rates.health_employer;
                    const healthRatePercent = (healthRateTotal * 100).toFixed(
                      3
                    );
                    bonus.calculationFormula = {
                      health: `標準賞与${standardBonusHealth.toLocaleString()}円×${healthRatePercent}% (50銭ルール適用) /2`,
                    };

                    // 介護保険の計算式
                    if (isCareApplicable && standardBonusHealth > 0) {
                      // 40歳～64歳の場合：計算式を表示
                      const careRateTotal =
                        rates.care_employee + rates.care_employer;
                      const careRatePercent = (careRateTotal * 100).toFixed(3);
                      bonus.calculationFormula = {
                        ...bonus.calculationFormula,
                        care: `標準賞与${standardBonusHealth.toLocaleString()}円×${careRatePercent}% (50銭ルール適用) /2`,
                      };
                    } else if (careType === 'none') {
                      // 40歳未満の場合：対象外を表示
                      bonus.calculationFormula = {
                        ...bonus.calculationFormula,
                        care: '対象外（40歳未満）',
                      };
                    } else if (careType === 'type1') {
                      // 65歳以上の場合：対象外を表示
                      bonus.calculationFormula = {
                        ...bonus.calculationFormula,
                        care: '対象外（65歳以上）',
                      };
                    }
                  }

                  // 厚生年金の計算式
                  // 70歳以上で停止されている場合は「加入対象外」を表示
                  if (isPensionStopped) {
                    bonus.calculationFormula = {
                      ...(bonus.calculationFormula || {}),
                      pension: '加入対象外（70歳到達）',
                    };
                  } else if (standardBonusPension > 0) {
                    const pensionRateTotal =
                      rates.pension_employee + rates.pension_employer;
                    const pensionRatePercent = (pensionRateTotal * 100).toFixed(
                      2
                    );
                    bonus.calculationFormula = {
                      ...(bonus.calculationFormula || {}),
                      pension: `標準賞与${standardBonusPension.toLocaleString()}円×${pensionRatePercent}% (50銭ルール適用) /2`,
                    };
                  }
                }
              }
            } catch (error) {
              // 計算式の生成に失敗しても既存処理には影響しない
              console.warn(
                `賞与の計算式の生成に失敗しました（${emp.id}, ${bonus.payDate}）:`,
                error
              );
            }
          }

          bonusTotal.healthEmployee += recalculatedPremiums.healthEmployee;
          bonusTotal.healthEmployer += recalculatedPremiums.healthEmployer;
          bonusTotal.careEmployee += recalculatedPremiums.careEmployee;
          bonusTotal.careEmployer += recalculatedPremiums.careEmployer;
          bonusTotal.pensionEmployee += recalculatedPremiums.pensionEmployee;
          bonusTotal.pensionEmployer += recalculatedPremiums.pensionEmployer;
        }
      }

      bonusTotal.total =
        bonusTotal.healthEmployee +
        bonusTotal.healthEmployer +
        bonusTotal.careEmployee +
        bonusTotal.careEmployer +
        bonusTotal.pensionEmployee +
        bonusTotal.pensionEmployer;

      // 合計（給与＋賞与）
      const grandTotal = {
        healthEmployee: monthlyTotal.healthEmployee + bonusTotal.healthEmployee,
        healthEmployer: monthlyTotal.healthEmployer + bonusTotal.healthEmployer,
        careEmployee: monthlyTotal.careEmployee + bonusTotal.careEmployee,
        careEmployer: monthlyTotal.careEmployer + bonusTotal.careEmployer,
        pensionEmployee:
          monthlyTotal.pensionEmployee + bonusTotal.pensionEmployee,
        pensionEmployer:
          monthlyTotal.pensionEmployer + bonusTotal.pensionEmployer,
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
    } catch (error) {
      this.errorMessages[emp.id] = [
        `保険料の計算中にエラーが発生しました: ${
          error instanceof Error ? error.message : String(error)
        }`,
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

  /**
   * 免除ラベルを表示用に整形
   */
  getExemptLabel(reason?: string | null): string {
    if (!reason) return '免除中';
    // 産休の判定（「産前産後」または「産休」を含む）
    if (reason.includes('産前産後') || reason.includes('産休')) return '産休中';
    // 育休の判定（「育児休業」または「育休」を含む）
    if (reason.includes('育児休業') || reason.includes('育休')) return '育休中';
    return '免除中';
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

  getInsuranceData(employeeId: string): EmployeeInsuranceData | null {
    return this.insuranceData[employeeId] || null;
  }

  getTableRows(): Array<{
    employee: Employee;
    monthlyPremium: MonthlyPremiumData | null;
    bonusPremium: Bonus | null;
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
  }> {
    return this.cachedTableRows;
  }

  /**
   * テーブル行を計算（内部メソッド）
   */
  private calculateTableRows(): Array<{
    employee: Employee;
    monthlyPremium: MonthlyPremiumData | null;
    bonusPremium: Bonus | null;
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
  }> {
    const rows: Array<{
      employee: Employee;
      monthlyPremium: MonthlyPremiumData | null;
      bonusPremium: Bonus | null;
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
    }> = [];

    for (const emp of this.employees) {
      const data = this.getInsuranceData(emp.id);
      if (!data) continue;

      const filteredMonthly = this.getFilteredMonthlyPremiums(
        data.monthlyPremiums
      );
      const monthlyPremium =
        filteredMonthly.length > 0 ? filteredMonthly[0] : null;
      const bonusPremium = this.getFilteredBonus(emp.id);

      // 月次合計（選択月の1件分、または全月合計）
      const monthlyTotal = monthlyPremium
        ? {
            healthEmployee: monthlyPremium.healthEmployee,
            healthEmployer: monthlyPremium.healthEmployer,
            careEmployee: monthlyPremium.careEmployee,
            careEmployer: monthlyPremium.careEmployer,
            pensionEmployee: monthlyPremium.pensionEmployee,
            pensionEmployer: monthlyPremium.pensionEmployer,
            total: monthlyPremium.total,
          }
        : {
            healthEmployee: 0,
            healthEmployer: 0,
            careEmployee: 0,
            careEmployer: 0,
            pensionEmployee: 0,
            pensionEmployer: 0,
            total: 0,
          };

      // 全月選択時は年間合計を使用
      if (this.selectedMonth === 'all') {
        monthlyTotal.healthEmployee = data.monthlyTotal.healthEmployee;
        monthlyTotal.healthEmployer = data.monthlyTotal.healthEmployer;
        monthlyTotal.careEmployee = data.monthlyTotal.careEmployee;
        monthlyTotal.careEmployer = data.monthlyTotal.careEmployer;
        monthlyTotal.pensionEmployee = data.monthlyTotal.pensionEmployee;
        monthlyTotal.pensionEmployer = data.monthlyTotal.pensionEmployer;
        monthlyTotal.total = data.monthlyTotal.total;
      }

      // 賞与合計
      // 全月選択時は年度内の全賞与の合計を使用、月次選択時は選択月の賞与を使用
      let bonusTotal = {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        total: 0,
      };

      if (this.selectedMonth === 'all') {
        // 全月選択時は年度内の全賞与の合計を使用
        bonusTotal = {
          healthEmployee: data.bonusTotal.healthEmployee || 0,
          healthEmployer: data.bonusTotal.healthEmployer || 0,
          careEmployee: data.bonusTotal.careEmployee || 0,
          careEmployer: data.bonusTotal.careEmployer || 0,
          pensionEmployee: data.bonusTotal.pensionEmployee || 0,
          pensionEmployer: data.bonusTotal.pensionEmployer || 0,
          total: data.bonusTotal.total || 0,
        };
      } else {
        // 月次選択時は選択月の賞与を使用
        // 賞与が免除扱いの場合は表示/計算とも0円で扱う
        const isBonusExempt = !!bonusPremium?.isExempted;

        bonusTotal = bonusPremium
          ? {
              healthEmployee: isBonusExempt
                ? 0
                : bonusPremium.healthEmployee || 0,
              healthEmployer: isBonusExempt
                ? 0
                : bonusPremium.healthEmployer || 0,
              careEmployee: isBonusExempt ? 0 : bonusPremium.careEmployee || 0,
              careEmployer: isBonusExempt ? 0 : bonusPremium.careEmployer || 0,
              pensionEmployee: isBonusExempt
                ? 0
                : bonusPremium.pensionEmployee || 0,
              pensionEmployer: isBonusExempt
                ? 0
                : bonusPremium.pensionEmployer || 0,
              total: isBonusExempt
                ? 0
                : (bonusPremium.healthEmployee || 0) +
                  (bonusPremium.healthEmployer || 0) +
                  (bonusPremium.careEmployee || 0) +
                  (bonusPremium.careEmployer || 0) +
                  (bonusPremium.pensionEmployee || 0) +
                  (bonusPremium.pensionEmployer || 0),
            }
          : {
              healthEmployee: 0,
              healthEmployer: 0,
              careEmployee: 0,
              careEmployer: 0,
              pensionEmployee: 0,
              pensionEmployer: 0,
              total: 0,
            };
      }

      rows.push({
        employee: emp,
        monthlyPremium,
        bonusPremium,
        monthlyTotal,
        bonusTotal,
      });
    }

    return rows;
  }

  /**
   * 指定された月の賞与を取得（全月選択時の月次テーブル用）
   */
  getMonthBonus(employeeId: string, month: number): Bonus | null {
    const bonuses = this.bonusData[employeeId] || [];
    // this.yearを数値に変換（文字列の場合に備えて）
    const selectedYearNum =
      typeof this.year === 'string' ? parseInt(this.year, 10) : this.year;

    const filtered = bonuses.filter((b) => {
      if (!b.payDate) return false;
      // 支給日から年と月を抽出
      const payDateObj = new Date(b.payDate);
      const payYear = payDateObj.getFullYear();
      const payMonth = payDateObj.getMonth() + 1; // getMonth()は0-11なので+1
      // selectedYearとselectedMonthに完全一致する賞与のみ
      return payYear === selectedYearNum && payMonth === month;
    });
    return filtered.length > 0 ? filtered[0] : null;
  }

  hasBonusColumn(): boolean {
    // キャッシュされた賞与列の有無を返す
    return this.cachedHasBonus;
  }

  /**
   * 賞与列の有無を計算
   */
  private calculateHasBonus(): boolean {
    // 月次選択時（selectedMonth !== 'all'）は、選択された月に賞与があるかチェック
    if (this.selectedMonth !== 'all') {
      const month =
        typeof this.selectedMonth === 'string'
          ? Number(this.selectedMonth)
          : this.selectedMonth;
      // this.yearを数値に変換（文字列の場合に備えて）
      const selectedYearNum =
        typeof this.year === 'string' ? parseInt(this.year, 10) : this.year;

      const hasBonus = this.employees.some((emp) => {
        const bonus = this.getFilteredBonus(emp.id);
        // 賞与が存在し、かつ保険料が計算されているかチェック
        return (
          bonus !== null &&
          bonus.amount > 0 &&
          !bonus.isExempted &&
          !bonus.isSalaryInsteadOfBonus &&
          (bonus.healthEmployee !== undefined ||
            bonus.careEmployee !== undefined ||
            bonus.pensionEmployee !== undefined)
        );
      });

      return hasBonus;
    }
    // 全月選択時は、年度内に賞与があるかチェック（保険料が計算されているもの）
    // this.yearを数値に変換（文字列の場合に備えて）
    const selectedYearNum =
      typeof this.year === 'string' ? parseInt(this.year, 10) : this.year;

    const hasBonus = this.employees.some((emp) => {
      const data = this.getInsuranceData(emp.id);
      if (!data) return false;

      // 年度内の全賞与の合計が0より大きい場合、賞与があるとみなす
      return (
        (data.bonusTotal.healthEmployee || 0) +
          (data.bonusTotal.healthEmployer || 0) +
          (data.bonusTotal.careEmployee || 0) +
          (data.bonusTotal.careEmployer || 0) +
          (data.bonusTotal.pensionEmployee || 0) +
          (data.bonusTotal.pensionEmployer || 0) >
        0
      );
    });

    return hasBonus;
  }

  getYearBonuses(employeeId: string): Bonus[] {
    const bonuses = this.bonusData[employeeId] || [];
    // this.yearを数値に変換（文字列の場合に備えて）
    const selectedYearNum =
      typeof this.year === 'string' ? parseInt(this.year, 10) : this.year;
    // 該当年度の賞与を支給月順にソートして返す（賞与額が0のものは除外）
    return bonuses
      .filter((b) => {
        // 賞与額が0の場合は除外（免除中かどうかに関わらず）
        if (b.amount === 0 || !b.amount) {
          return false;
        }

        // bonus.yearフィールドを優先的に使用（賞与入力画面で設定される）
        if (b.year !== undefined && b.year !== null) {
          return b.year === selectedYearNum;
        }
        // フォールバック: payDateから年度を判定
        if (b.payDate) {
          const payDateObj = new Date(b.payDate);
          return payDateObj.getFullYear() === selectedYearNum;
        }
        return false;
      })
      .sort((a, b) => {
        // monthフィールドを優先的に使用
        const monthA =
          a.month || (a.payDate ? new Date(a.payDate).getMonth() + 1 : 0);
        const monthB =
          b.month || (b.payDate ? new Date(b.payDate).getMonth() + 1 : 0);
        return monthA - monthB;
      });
  }
}
