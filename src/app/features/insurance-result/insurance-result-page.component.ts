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
    private roomIdService: RoomIdService
  ) {
    // 年度選択用の年度リストを生成（現在年度±2年）
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      this.availableYears.push(y);
    }
  }

  ngOnInit(): void {
    // 加入区分の変更を購読（先に設定してUIブロックを防ぐ）
    this.eligibilitySubscription = this.employeeEligibilityService
      .observeEligibility()
      .subscribe(() => {
        // 加入区分変更時は、既に表示されているデータがあれば再読み込み
        if (this.selectedEmployeeIds.size > 0) {
          this.loadSelectedEmployeesData();
        }
      });

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
   */
  async onShowResults(): Promise<void> {
    if (this.selectedEmployeeIds.size === 0) {
      alert('従業員を選択してください');
      return;
    }
    await this.loadSelectedEmployeesData();
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
      // 標準報酬月額テーブルを取得
      const gradeTable = await this.settingsService.getStandardTable(this.year);

      // 選択された従業員だけを取得
      const selectedEmployees = this.sortedEmployees.filter((emp) =>
        this.selectedEmployeeIds.has(emp.id)
      );

      // 選択された従業員をバッチ処理（一度に2人ずつ処理してUIの応答性を保つ）
      const batchSize = 2;
      for (let i = 0; i < selectedEmployees.length; i += batchSize) {
        const batch = selectedEmployees.slice(i, i + batchSize);

        // バッチ内の従業員を並列処理
        await Promise.all(
          batch.map((emp) => this.processEmployeeInsuranceData(emp, gradeTable))
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
    this.errorMessages = {};
    this.warningMessages = {};
    this.cachedTableRows = [];
    this.cachedHasBonus = false;
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
              new Date(b.payDate).getTime() - new Date(a.payDate).getTime()
          )[0]
        : null;
    }
    // 特定月選択時は支給日ベースで該当月の賞与を表示
    const month =
      typeof this.selectedMonth === 'string'
        ? Number(this.selectedMonth)
        : this.selectedMonth;
    const filtered = bonuses.filter((b) => {
      if (!b.payDate) return false;
      // 支給日から年と月を抽出
      const payDateObj = new Date(b.payDate);
      const payYear = payDateObj.getFullYear();
      const payMonth = payDateObj.getMonth() + 1; // getMonth()は0-11なので+1
      // selectedYearとselectedMonthに完全一致する賞与のみ
      return payYear === this.year && payMonth === month;
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
    gradeTable: any[]
  ): Promise<void> {
    try {
      const roomId = this.roomIdService.getCurrentRoomId();
      if (!roomId) {
        console.warn(
          '[insurance-result] roomId is not set. skip processEmployeeInsuranceData.'
        );
        return;
      }
      this.errorMessages[emp.id] = [];
      this.warningMessages[emp.id] = [];

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

        // 重要：標準報酬月額が確定している場合は、給与が0円でも保険料を計算する
        // 標準報酬月額は、従業員データのcurrentStandardMonthlyRemunerationから取得される
        const hasStandardRemuneration =
          !!emp.currentStandardMonthlyRemuneration &&
          emp.currentStandardMonthlyRemuneration > 0;

        console.log(
          `[insurance-result-page] ${emp.name} (${this.year}年${month}月): ループ処理開始`,
          {
            month,
            monthKey,
            monthDataExists: !!monthData,
            fixedSalary,
            variableSalary,
            hasStandardRemuneration,
            employeeCurrentStandardMonthlyRemuneration:
              emp.currentStandardMonthlyRemuneration,
            willCalculate:
              fixedSalary > 0 || variableSalary > 0 || hasStandardRemuneration,
          }
        );

        // 給与がある場合、または標準報酬月額が確定している場合は保険料を計算
        if (fixedSalary > 0 || variableSalary > 0 || hasStandardRemuneration) {
          console.log(
            `[insurance-result-page] ${emp.name} (${this.year}年${month}月): ✅ 保険料計算を実行`
          );
          const premiumResult =
            await this.salaryCalculationService.calculateMonthlyPremiums(
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

          // 給与がある場合はgradeTableから等級を検索
          if (totalSalary > 0) {
            const gradeRow = gradeTable.find(
              (r: any) => totalSalary >= r.lower && totalSalary < r.upper
            );
            if (gradeRow) {
              grade = gradeRow.rank;
              standardMonthlyRemuneration = gradeRow.standard;
            }
          } else if (hasStandardRemuneration) {
            // 給与が0円でも標準報酬月額が確定している場合は、標準報酬月額から等級を逆引き
            const standard = emp.currentStandardMonthlyRemuneration || 0;
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
          const exemptReason = isExempt ? '免除中' : '';

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
            total:
              premiumResult.health_employee +
              premiumResult.health_employer +
              premiumResult.care_employee +
              premiumResult.care_employer +
              premiumResult.pension_employee +
              premiumResult.pension_employer,
            isExempt,
            exemptReason,
            reasons: [],
          };

          monthlyPremiums.push(monthlyPremium);

          // 月次合計に加算
          monthlyTotal.healthEmployee += premiumResult.health_employee;
          monthlyTotal.healthEmployer += premiumResult.health_employer;
          monthlyTotal.careEmployee += premiumResult.care_employee;
          monthlyTotal.careEmployer += premiumResult.care_employer;
          monthlyTotal.pensionEmployee += premiumResult.pension_employee;
          monthlyTotal.pensionEmployer += premiumResult.pension_employer;
        } else {
          console.log(
            `[insurance-result-page] ${emp.name} (${this.year}年${month}月): ❌ 条件を満たさないためスキップ`,
            {
              fixedSalary,
              variableSalary,
              hasStandardRemuneration,
              condition:
                fixedSalary > 0 ||
                variableSalary > 0 ||
                hasStandardRemuneration,
            }
          );
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
      const bonuses = await this.bonusService.getBonusesForResult(
        emp.id,
        this.year
      );
      this.bonusData[emp.id] = bonuses || [];
      const latestBonus =
        bonuses && bonuses.length > 0
          ? bonuses.sort(
              (a, b) =>
                new Date(b.payDate || '').getTime() -
                new Date(a.payDate || '').getTime()
            )[0]
          : null;

      // 賞与の年間合計を計算（賞与額が0のものは除外）
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
          bonusTotal.healthEmployee += bonus.healthEmployee || 0;
          bonusTotal.healthEmployer += bonus.healthEmployer || 0;
          bonusTotal.careEmployee += bonus.careEmployee || 0;
          bonusTotal.careEmployer += bonus.careEmployer || 0;
          bonusTotal.pensionEmployee += bonus.pensionEmployee || 0;
          bonusTotal.pensionEmployer += bonus.pensionEmployer || 0;
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
      const bonusTotal = bonusPremium
        ? {
            healthEmployee: bonusPremium.healthEmployee || 0,
            healthEmployer: bonusPremium.healthEmployer || 0,
            careEmployee: bonusPremium.careEmployee || 0,
            careEmployer: bonusPremium.careEmployer || 0,
            pensionEmployee: bonusPremium.pensionEmployee || 0,
            pensionEmployer: bonusPremium.pensionEmployer || 0,
            total:
              (bonusPremium.healthEmployee || 0) +
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

  hasBonusColumn(): boolean {
    return this.cachedHasBonus;
  }

  /**
   * 賞与列の有無を計算
   */
  private calculateHasBonus(): boolean {
    return this.employees.some((emp) => {
      const bonus = this.getFilteredBonus(emp.id);
      return bonus !== null;
    });
  }

  getYearBonuses(employeeId: string): Bonus[] {
    const bonuses = this.bonusData[employeeId] || [];
    // 該当年度の賞与を支給月順にソートして返す（賞与額が0のものは除外）
    return bonuses
      .filter((b) => {
        // 賞与額が0の場合は除外（免除中かどうかに関わらず）
        if (b.amount === 0 || !b.amount) {
          return false;
        }

        // bonus.yearフィールドを優先的に使用（賞与入力画面で設定される）
        if (b.year !== undefined && b.year !== null) {
          return b.year === this.year;
        }
        // フォールバック: payDateから年度を判定
        if (b.payDate) {
          const payDateObj = new Date(b.payDate);
          return payDateObj.getFullYear() === this.year;
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
