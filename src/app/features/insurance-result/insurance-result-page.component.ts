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
import { StandardRemunerationHistoryService } from '../../services/standard-remuneration-history.service';
import { BonusCalculationService } from '../../services/bonus-calculation.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';
import { RoomIdService } from '../../services/room-id.service';

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
    private bonusCalculationService: BonusCalculationService
  ) {
    // 年度選択用の年度リストを生成（現在年度±2年）
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      this.availableYears.push(y);
    }
  }

  ngOnInit(): void {
    // 従業員情報の変更を直接購読（observeEmployeesを使用）
    this.employeeSubscription = this.employeeService
      .observeEmployees()
      .subscribe(() => {
        // 従業員情報が変更されたときは、既に表示されているデータがあれば再読み込み
        // loadSelectedEmployeesData内で最新の従業員情報を取得する
        if (this.selectedEmployeeIds.size > 0) {
          this.loadSelectedEmployeesData();
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
        for (const bonus of bonuses) {
          if (
            bonus.amount > 0 &&
            !bonus.isExempted &&
            !bonus.isSalaryInsteadOfBonus &&
            bonus.payDate
          ) {
            try {
              // 最新の従業員情報で賞与を再計算
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
              monthsToCalc
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
    targetMonths: number[]
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

          // 資格取得時決定の履歴を探す（入社年月以前で最も新しいもの）
          if (emp.joinDate) {
            const joinDate = new Date(emp.joinDate);
            const joinYear = joinDate.getFullYear();
            const joinMonth = joinDate.getMonth() + 1;

            // 選択年度が入社年以降の場合、資格取得時決定の履歴を使用
            // this.yearを数値に変換（文字列の場合に備えて）
            const selectedYearNum =
              typeof this.year === 'string'
                ? parseInt(this.year, 10)
                : this.year;

            if (selectedYearNum >= joinYear) {
              const acquisitionHistory = allHistories.find(
                (h) =>
                  h.determinationReason === 'acquisition' &&
                  h.applyStartYear === joinYear &&
                  h.applyStartMonth === joinMonth
              );

              if (acquisitionHistory) {
                // 選択年度の該当月が入社月以降の場合、資格取得時決定の標準報酬月額を使用
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
                  // 入社年の標準報酬等級表を取得
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
              gradeTable
            );

          // 標準報酬等級を取得（gradeTableから直接検索）
          const totalSalary = fixedSalary + variableSalary;
          let grade: number | null = null;
          let standardMonthlyRemuneration = 0;

          // 給与がある場合はgradeTableから等級を検索
          if (totalSalary > 0 && gradeTable) {
            const gradeRow = gradeTable.find(
              (r: any) => totalSalary >= r.lower && totalSalary < r.upper
            );
            if (gradeRow) {
              grade = gradeRow.rank;
              standardMonthlyRemuneration = gradeRow.standard;
            }
          } else if (hasStandardRemuneration && gradeTable) {
            // 給与が0円でも標準報酬月額が確定している場合は、標準報酬月額から等級を逆引き
            // effectiveStandardを使用（従業員データと履歴から取得した値）
            const standard = effectiveStandard || 0;
            const gradeRow = gradeTable.find(
              (r: any) => r.standard === standard
            );
            if (gradeRow) {
              grade = gradeRow.rank;
              standardMonthlyRemuneration = gradeRow.standard;
            } else {
              // 等級が見つからない場合は標準報酬月額のみを使用
              standardMonthlyRemuneration = standard;
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
              }
            } catch (error) {
              console.error(
                `[insurance-result-page] 賞与の再計算エラー: ${emp.name} (${bonus.payDate})`,
                error
              );
              // エラーが発生した場合は、既存の値をそのまま使用
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
