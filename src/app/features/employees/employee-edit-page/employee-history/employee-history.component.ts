import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../../../services/employee.service';
import { StandardRemunerationHistoryService } from '../../../../services/standard-remuneration-history.service';
import { SettingsService } from '../../../../services/settings.service';
import { GradeDeterminationService } from '../../../../services/grade-determination.service';
import { EmployeeLifecycleService } from '../../../../services/employee-lifecycle.service';
import { SalaryCalculationService } from '../../../../services/salary-calculation.service';
import { MonthlySalaryService } from '../../../../services/monthly-salary.service';
import { RoomIdService } from '../../../../services/room-id.service';
import { Employee } from '../../../../models/employee.model';
import {
  StandardRemunerationHistory,
  InsuranceStatusHistory,
} from '../../../../models/standard-remuneration-history.model';

@Component({
  selector: 'app-employee-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-history.component.html',
  styleUrl: './employee-history.component.css',
})
export class EmployeeHistoryComponent implements OnInit, OnDestroy {
  @Input() employeeId: string | null = null;

  standardRemunerationHistories: StandardRemunerationHistory[] = [];
  insuranceStatusHistories: InsuranceStatusHistory[] = [];
  selectedHistoryYear: number = new Date().getFullYear();
  isLoadingHistories: boolean = false;
  isUpdatingHistory: boolean = false;
  availableHistoryYears: number[] = [];
  joinDate?: string;
  joinYear?: number | null;
  joinMonth?: number | null;
  computedGrades: { [key: string]: number | null } = {};
  employee: Employee | null = null;
  mergedHistories: Array<{
    year: number;
    month: number;
    age: number | null;
    grade: number | null;
    standardMonthlyRemuneration: number | null;
    determinationReason: string | null;
    healthInsurance: string;
    careInsurance: string;
    pensionInsurance: string;
  }> = [];
  private routerSubscription: Subscription | null = null;
  private isGeneratingHistory: boolean = false; // 標準報酬履歴生成中のフラグ
  private isUpdatingMergedHistories: boolean = false; // 統合履歴更新中のフラグ
  private isLoadingHistoriesFlag: boolean = false; // loadHistories実行中のフラグ

  constructor(
    private employeeService: EmployeeService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService,
    private settingsService: SettingsService,
    private gradeDeterminationService: GradeDeterminationService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private salaryCalculationService: SalaryCalculationService,
    private monthlySalaryService: MonthlySalaryService,
    private roomIdService: RoomIdService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    // 利用可能な年度リストを生成（2020年から2030年まで）
    this.availableHistoryYears = [];
    for (let year = 2020; year <= 2030; year++) {
      this.availableHistoryYears.push(year);
    }

    await this.loadHistories();

    // ルーターイベントを購読（画面遷移後に再読み込み）
    // 注意：標準報酬履歴の再生成は行わず、既存の履歴を読み込むのみ
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(async () => {
        // 従業員編集画面に戻ってきた場合、データを再読み込み
        // ただし、標準報酬履歴の再生成は行わない（重複実行を防ぐ）
        if (this.employeeId && !this.isLoadingHistories) {
          // 標準報酬履歴を再生成せず、既存の履歴を読み込むのみ
          this.standardRemunerationHistories =
            await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
              this.employeeId
            );
          this.insuranceStatusHistories =
            await this.standardRemunerationHistoryService.getInsuranceStatusHistories(
              this.employeeId
            );
          await this.computeGradesFromHistories();
          await this.updateMergedHistories();
        }
      });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
  }

  /**
   * 標準報酬履歴を再生成せず、既存の履歴を読み込む
   * 基本情報が保存されたときに呼ばれる
   */
  async reloadHistoriesWithoutRegeneration(): Promise<void> {
    if (!this.employeeId) return;

    this.isLoadingHistories = true;

    try {
      // 従業員情報を取得
      const employee = await this.employeeService.getEmployeeById(
        this.employeeId
      );
      if (!employee) return;
      this.employee = employee;
      this.joinDate = employee.joinDate;
      if (this.joinDate) {
        const joinDateObj = new Date(this.joinDate);
        if (!isNaN(joinDateObj.getTime())) {
          this.joinYear = joinDateObj.getFullYear();
          this.joinMonth = joinDateObj.getMonth() + 1;
        } else {
          this.joinYear = null;
          this.joinMonth = null;
        }
      } else {
        this.joinYear = null;
        this.joinMonth = null;
      }

      // 標準報酬履歴を再生成せず、既存の履歴を読み込むのみ
      this.standardRemunerationHistories =
        await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
          this.employeeId
        );

      await this.computeGradesFromHistories();

      // 社保加入履歴を読み込み
      this.insuranceStatusHistories =
        await this.standardRemunerationHistoryService.getInsuranceStatusHistories(
          this.employeeId
        );

      // 統合履歴を更新
      await this.updateMergedHistories();
    } finally {
      this.isLoadingHistories = false;
    }
  }

  async loadHistories(): Promise<void> {
    if (!this.employeeId) return;

    // 既に読み込み中の場合はスキップ（重複実行を防ぐ）
    if (this.isLoadingHistoriesFlag) {
      return;
    }

    this.isLoadingHistoriesFlag = true;
    this.isLoadingHistories = true;

    try {
      // 従業員情報を取得
      const employee = await this.employeeService.getEmployeeById(
        this.employeeId
      );
      if (!employee) return;
      this.employee = employee;
      this.joinDate = employee.joinDate;
      if (this.joinDate) {
        const joinDateObj = new Date(this.joinDate);
        if (!isNaN(joinDateObj.getTime())) {
          this.joinYear = joinDateObj.getFullYear();
          this.joinMonth = joinDateObj.getMonth() + 1;
        } else {
          this.joinYear = null;
          this.joinMonth = null;
        }
      } else {
        this.joinYear = null;
        this.joinMonth = null;
      }

      // 標準報酬履歴の生成中でない場合のみ生成（重複実行を防ぐ）
      if (!this.isGeneratingHistory) {
        this.isGeneratingHistory = true;
        try {
          // 常に最新の履歴を自動生成
          await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(
            this.employeeId,
            employee
          );
          await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(
            this.employeeId,
            employee
          );
        } finally {
          this.isGeneratingHistory = false;
        }
      }

      // 標準報酬履歴を読み込み
      this.standardRemunerationHistories =
        await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
          this.employeeId
        );

      // 標準報酬履歴が空で、従業員に月額賃金がある場合は、再度生成を試みる
      if (
        this.standardRemunerationHistories.length === 0 &&
        employee.monthlyWage
      ) {
        await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(
          this.employeeId,
          employee
        );
        this.standardRemunerationHistories =
          await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
            this.employeeId
          );
      }

      await this.computeGradesFromHistories();

      // 社保加入履歴を読み込み
      this.insuranceStatusHistories =
        await this.standardRemunerationHistoryService.getInsuranceStatusHistories(
          this.employeeId
        );

      // 統合履歴を更新
      await this.updateMergedHistories();
    } finally {
      this.isLoadingHistories = false;
      this.isLoadingHistoriesFlag = false;
    }
  }

  async generateHistories(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.employeeId) return;

    const employee = await this.employeeService.getEmployeeById(
      this.employeeId
    );
    if (!employee) return;

    // 標準報酬履歴を自動生成
    await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(
      this.employeeId,
      employee
    );

    // 社保加入履歴を自動生成
    await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(
      this.employeeId,
      employee
    );

    await this.loadHistories();
    alert('履歴を自動生成しました');
  }

  async updateHistory(): Promise<void> {
    if (!this.employeeId || this.isUpdatingHistory) {
      return;
    }

    this.isUpdatingHistory = true;

    try {
      // 従業員情報を取得
      const employee = await this.employeeService.getEmployeeById(
        this.employeeId
      );
      if (!employee) {
        alert('従業員情報を取得できませんでした');
        return;
      }

      // 入社日を確認
      if (!employee.joinDate) {
        alert('入社日が設定されていません');
        return;
      }

      const joinDate = new Date(employee.joinDate);
      if (isNaN(joinDate.getTime())) {
        alert('入社日が無効です');
        return;
      }

      const joinYear: number = joinDate.getFullYear();
      const joinMonth: number = joinDate.getMonth() + 1;

      // 現在の年月を取得
      const currentDate = new Date();
      const currentYear: number = currentDate.getFullYear();
      const currentMonth: number = currentDate.getMonth() + 1;

      // 入社年から現在年まで処理（入社日から現在までの最新の月次入力情報を確認）
      // オプショナルパラメータを明示的に渡す
      const fromYear: number = joinYear;
      const toYear: number = currentYear;
      // TypeScriptの型チェックを回避するため、明示的に型を指定
      await (
        this.standardRemunerationHistoryService
          .generateStandardRemunerationHistory as (
          employeeId: string,
          employee: Employee,
          fromYear?: number,
          toYear?: number
        ) => Promise<void>
      )(this.employeeId, employee, fromYear, toYear);

      // 社保加入履歴も更新（入社年から現在年まで）
      const years: number[] = [];
      for (let y = joinYear; y <= currentYear; y++) {
        if (y >= 1900 && y <= 2100) {
          years.push(y);
        }
      }
      await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(
        this.employeeId,
        employee,
        years
      );

      // 履歴を再読み込み（loadHistories内でgenerateStandardRemunerationHistoryが呼ばれるため、直接履歴を取得）
      // 標準報酬履歴を読み込み
      this.standardRemunerationHistories =
        await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
          this.employeeId
        );

      await this.computeGradesFromHistories();

      // 社保加入履歴を読み込み
      this.insuranceStatusHistories =
        await this.standardRemunerationHistoryService.getInsuranceStatusHistories(
          this.employeeId
        );

      // 統合履歴を更新
      await this.updateMergedHistories();

      alert('標準報酬履歴・社保加入履歴を更新しました');
    } catch (error) {
      alert('履歴の更新に失敗しました');
    } finally {
      this.isUpdatingHistory = false;
    }
  }

  getDeterminationReasonLabel(reason: string): string {
    switch (reason) {
      case 'acquisition':
        return '資格取得時決定';
      case 'teiji':
        return '定時決定';
      case 'suiji':
        return '随時改定';
      default:
        return reason;
    }
  }

  getInsuranceStatusLabel(
    status: string,
    insuranceType?: 'health' | 'care' | 'pension'
  ): string {
    switch (status) {
      case 'joined':
        return '加入';
      case 'lost':
        // 介護保険の場合のみ「喪失」→「未加入」に変更
        if (insuranceType === 'care') {
          return '未加入';
        }
        return '喪失';
      case 'exempt_maternity':
        return '免除（産休）';
      case 'exempt_childcare':
        return '免除（育休）';
      case 'type1':
        return '第1号被保険者';
      default:
        return status;
    }
  }

  async onHistoryYearChange(year: number | string): Promise<void> {
    if (!this.employeeId) return;

    // 年度を数値に変換
    const parsedYear = typeof year === 'string' ? parseInt(year, 10) : year;
    if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
      return;
    }
    this.selectedHistoryYear = parsedYear;

    this.isLoadingHistories = true;
    try {
      const employee = await this.employeeService.getEmployeeById(
        this.employeeId
      );
      if (employee) {
        // 従業員情報を更新（最新の情報を取得）
        this.employee = employee;
        this.joinDate = employee.joinDate;
        if (this.joinDate) {
          const joinDateObj = new Date(this.joinDate);
          if (!isNaN(joinDateObj.getTime())) {
            this.joinYear = joinDateObj.getFullYear();
            this.joinMonth = joinDateObj.getMonth() + 1;
          } else {
            this.joinYear = null;
            this.joinMonth = null;
          }
        } else {
          this.joinYear = null;
          this.joinMonth = null;
        }

        // 選択年度の社保加入履歴を生成
        await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(
          this.employeeId,
          employee,
          [this.selectedHistoryYear]
        );
        // 標準報酬履歴は再生成しない（loadHistoriesで既に生成済みのため、重複を避ける）
        // 履歴を再読み込み
        this.insuranceStatusHistories =
          await this.standardRemunerationHistoryService.getInsuranceStatusHistories(
            this.employeeId
          );
        this.standardRemunerationHistories =
          await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
            this.employeeId
          );

        await this.computeGradesFromHistories();
        // 統合履歴を更新
        await this.updateMergedHistories();
      }
    } finally {
      this.isLoadingHistories = false;
    }
  }

  getFilteredInsuranceHistories(): InsuranceStatusHistory[] {
    // selectedHistoryYearを数値として確実に扱う
    // 注意: selectedHistoryYearは「年」（1月〜12月）を表す
    const selectedYear =
      typeof this.selectedHistoryYear === 'string'
        ? parseInt(this.selectedHistoryYear, 10)
        : this.selectedHistoryYear;

    if (isNaN(selectedYear) || selectedYear < 1900 || selectedYear > 2100) {
      return [];
    }

    // 入社日前は表示しない
    const hasJoinYear = this.joinYear !== null && this.joinYear !== undefined;
    const hasJoinMonth =
      this.joinMonth !== null && this.joinMonth !== undefined;
    if (hasJoinYear) {
      if (selectedYear < (this.joinYear as number)) {
        return [];
      }
    }

    // 選択年に該当する月のデータをフィルタリング
    // 注意: insuranceStatusHistoriesのyearフィールドは年度を表す可能性があるため、
    // 年度と月から実際の年を計算して比較する
    const filtered = this.insuranceStatusHistories.filter((h) => {
      // 年度と月から実際の年を計算（3月開始の年度）
      const historyCalendarYear = h.month >= 3 ? h.year : h.year + 1;
      return historyCalendarYear === selectedYear;
    });

    // 同じ年月の重複を排除（最新のupdatedAtを持つものを優先、なければcreatedAt）
    const uniqueMap = new Map<string, InsuranceStatusHistory>();
    for (const history of filtered) {
      // 入社月より前の月は除外（入社年のみ）
      const historyCalendarYear = history.month >= 3 ? history.year : history.year + 1;
      if (
        hasJoinYear &&
        hasJoinMonth &&
        historyCalendarYear === (this.joinYear as number) &&
        history.month < (this.joinMonth as number)
      ) {
        continue;
      }

      const key = `${history.year}_${history.month}`;
      const existing = uniqueMap.get(key);

      if (!existing) {
        uniqueMap.set(key, history);
      } else {
        // より新しい更新日時を持つものを採用
        const existingTime =
          existing.updatedAt || existing.createdAt || new Date(0);
        const currentTime =
          history.updatedAt || history.createdAt || new Date(0);
        if (currentTime > existingTime) {
          uniqueMap.set(key, history);
        }
      }
    }

    // Mapから配列に変換してソート（年月で降順）
    return Array.from(uniqueMap.values()).sort((a, b) => {
      // 年度と月から実際の年を計算して比較
      const aCalendarYear = a.month >= 3 ? a.year : a.year + 1;
      const bCalendarYear = b.month >= 3 ? b.year : b.year + 1;
      if (aCalendarYear !== bCalendarYear) {
        return bCalendarYear - aCalendarYear;
      }
      return b.month - a.month;
    });
  }

  getGradeDisplay(history: StandardRemunerationHistory): string {
    const key = this.getHistoryKey(history);
    const computed = this.computedGrades[key];
    const grade = computed ?? history.grade ?? null;
    return grade ? `${grade}等級` : '-';
  }

  private async computeGradesFromHistories(): Promise<void> {
    const cache = new Map<number, any[]>();
    this.computedGrades = {};

    for (const history of this.standardRemunerationHistories) {
      const year = history.applyStartYear;
      if (!cache.has(year)) {
        const table = (await this.settingsService.getStandardTable(year)) || [];
        cache.set(year, table);
      }

      const table = cache.get(year) || [];
      const result = this.gradeDeterminationService.findGrade(
        table,
        history.standardMonthlyRemuneration
      );
      const key = this.getHistoryKey(history);
      this.computedGrades[key] = result ? result.grade : null;
    }
  }

  private getHistoryKey(history: StandardRemunerationHistory): string {
    return (
      history.id ||
      `${history.applyStartYear}-${history.applyStartMonth}-${history.standardMonthlyRemuneration}`
    );
  }

  /**
   * 統合された履歴データを更新
   */
  private async updateMergedHistories(): Promise<void> {
    if (!this.employee || !this.employeeId) {
      this.mergedHistories = [];
      return;
    }

    // 既に更新中の場合はスキップ（重複実行を防ぐ）
    if (this.isUpdatingMergedHistories) {
      return;
    }

    this.isUpdatingMergedHistories = true;

    try {
      // selectedHistoryYearを数値として確実に扱う
      // 注意: selectedHistoryYearは「年」（1月〜12月）を表す
      const selectedYear =
        typeof this.selectedHistoryYear === 'string'
          ? parseInt(this.selectedHistoryYear, 10)
          : this.selectedHistoryYear;

      if (isNaN(selectedYear) || selectedYear < 1900 || selectedYear > 2100) {
        this.mergedHistories = [];
        return;
      }

      // 現在の年月を取得
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      const insuranceHistories = this.getFilteredInsuranceHistories();
      const result: Array<{
        year: number;
        month: number;
        age: number | null;
        grade: number | null;
        standardMonthlyRemuneration: number | null;
        determinationReason: string | null;
        healthInsurance: string;
        careInsurance: string;
        pensionInsurance: string;
      }> = [];

      // 選択年の12ヶ月分のデータを作成
      for (let month = 12; month >= 1; month--) {
        // 現在の年月より未来の場合はスキップ
        if (
          selectedYear > currentYear ||
          (selectedYear === currentYear && month > currentMonth)
        ) {
          continue;
        }

        // 入社月より前の月は除外（入社年のみ）
        const hasJoinYear = this.joinYear !== null && this.joinYear !== undefined;
        const hasJoinMonth =
          this.joinMonth !== null && this.joinMonth !== undefined;
        if (
          hasJoinYear &&
          hasJoinMonth &&
          selectedYear === (this.joinYear as number) &&
          month < (this.joinMonth as number)
        ) {
          continue;
        }

        // 社保加入履歴から該当月のデータを取得
        // 注意: insuranceStatusHistoriesのyearフィールドは年度を表す可能性があるため、
        // 年度と月から実際の年を計算して比較する必要がある
        const insuranceHistory = insuranceHistories.find((h) => {
          // 年度と月から実際の年を計算（3月開始の年度）
          const historyCalendarYear = h.month >= 3 ? h.year : h.year + 1;
          return historyCalendarYear === selectedYear && h.month === month;
        });

        // 標準報酬履歴から該当月に適用される履歴を取得
        // 適用開始年月がその月以前で、かつ最も新しいものを取得
        // applyStartYearは実際の年として記録されているので、直接比較する
        // 同じ適用開始年月の標準報酬履歴が複数存在する場合、随時改定を優先する
        const applicableStandardHistory = this.standardRemunerationHistories
          .filter((h) => {
            // 適用開始年が選択年より前の場合
            if (h.applyStartYear < selectedYear) return true;
            // 適用開始年が選択年と同じで、適用開始月がその月以前の場合
            if (h.applyStartYear === selectedYear && h.applyStartMonth <= month)
              return true;
            return false;
          })
          .sort((a, b) => {
            // 適用開始年で降順ソート
            if (a.applyStartYear !== b.applyStartYear) {
              return b.applyStartYear - a.applyStartYear;
            }
            // 適用開始月で降順ソート
            if (a.applyStartMonth !== b.applyStartMonth) {
              return b.applyStartMonth - a.applyStartMonth;
            }
            // 同じ適用開始年月の場合、随時改定を優先（'suiji' > 'teiji' > 'acquisition'）
            const priorityMap: { [key: string]: number } = {
              suiji: 3,
              teiji: 2,
              acquisition: 1,
            };
            const aPriority = priorityMap[a.determinationReason] || 0;
            const bPriority = priorityMap[b.determinationReason] || 0;
            return bPriority - aPriority;
          })[0];

        // 年齢を計算
        const age = this.employee.birthDate
          ? this.employeeLifecycleService.getAgeAtMonth(
              this.employee.birthDate,
              selectedYear,
              month
            )
          : null;

        // 標準報酬等級を取得
        let grade: number | null = null;
        let standardMonthlyRemuneration: number | null = null;
        let determinationReason: string | null = null;

        // 標準報酬履歴を優先表示（その年月に適用されていた標準報酬月額）
        if (applicableStandardHistory) {
          const key = this.getHistoryKey(applicableStandardHistory);
          grade =
            this.computedGrades[key] ?? applicableStandardHistory.grade ?? null;
          standardMonthlyRemuneration =
            applicableStandardHistory.standardMonthlyRemuneration;

          // 決定理由は、標準報酬履歴の適用開始月と一致する場合のみ設定
          // それ以外の月はハイフン（-）を表示
          // applyStartYearは実際の年として記録されているので、直接比較する
          if (
            applicableStandardHistory.applyStartYear === selectedYear &&
            applicableStandardHistory.applyStartMonth === month
          ) {
            determinationReason = this.getDeterminationReasonLabel(
              applicableStandardHistory.determinationReason
            );
          } else {
            determinationReason = null; // ハイフンを表示
          }
        }

        // 標準報酬履歴がない場合のみ、従業員情報から月額賃金を使って計算
        // 注意：標準報酬履歴が正しく生成されていれば、この処理は実行されない
        if (standardMonthlyRemuneration === null) {
          // 標準報酬履歴が見つからない場合、従業員情報から月額賃金を使って計算
          // 入社年月が選択年の該当月以前の場合のみ
          const hasJoinYear =
            this.joinYear !== null && this.joinYear !== undefined;
          const hasJoinMonth =
            this.joinMonth !== null && this.joinMonth !== undefined;
          const isAfterJoin =
            !hasJoinYear ||
            !hasJoinMonth ||
            selectedYear > (this.joinYear as number) ||
            (selectedYear === (this.joinYear as number) &&
              month >= (this.joinMonth as number));

          if (isAfterJoin) {
            // まず従業員情報のmonthlyWageを確認
            let wage: number | null = null;
            if (this.employee.monthlyWage) {
              wage = Number(this.employee.monthlyWage);
              if (Number.isNaN(wage) || wage <= 0) {
                wage = null;
              }
            }

            // monthlyWageがない場合、標準報酬履歴から入社月の履歴を探す
            if (!wage) {
              // 入社年月の年度を計算（3月開始の年度）
              const joinFiscalYear = hasJoinYear && hasJoinMonth
                ? ((this.joinMonth as number) >= 3 ? (this.joinYear as number) : (this.joinYear as number) - 1)
                : null;
              
              const joinMonthHistory = this.standardRemunerationHistories.find(
                (h) =>
                  hasJoinYear &&
                  hasJoinMonth &&
                  joinFiscalYear !== null &&
                  h.applyStartYear === joinFiscalYear &&
                  h.applyStartMonth === (this.joinMonth as number) &&
                  h.determinationReason === 'acquisition'
              );
              if (joinMonthHistory) {
                const key = this.getHistoryKey(joinMonthHistory);
                grade =
                  this.computedGrades[key] ?? joinMonthHistory.grade ?? null;
                standardMonthlyRemuneration =
                  joinMonthHistory.standardMonthlyRemuneration;
                determinationReason = this.getDeterminationReasonLabel(
                  joinMonthHistory.determinationReason
                );
              }
            } else {
              // monthlyWageから標準報酬月額と等級を計算
              // 年度ベースで標準報酬等級表を取得（3月開始の年度）
              const fiscalYear = month >= 3 ? selectedYear : selectedYear - 1;
              const gradeTable = await this.settingsService.getStandardTable(
                fiscalYear
              );
              if (gradeTable && gradeTable.length > 0) {
                const result =
                  this.salaryCalculationService.getStandardMonthlyRemuneration(
                    wage,
                    gradeTable
                  );
                if (result) {
                  standardMonthlyRemuneration = result.standard;
                  grade = result.rank || null;
                  // 入社年月と一致する場合は資格取得時決定
                  if (
                    hasJoinYear &&
                    hasJoinMonth &&
                    selectedYear === (this.joinYear as number) &&
                    month === (this.joinMonth as number)
                  ) {
                    determinationReason = '資格取得時決定';
                  } else {
                    // 入社月以外の場合は決定理由を設定しない（ハイフンを表示）
                    determinationReason = null;
                  }
                }
              }
            }
          }
        }

        result.push({
          year: selectedYear, // 選択年を表示
          month,
          age,
          grade,
          standardMonthlyRemuneration,
          determinationReason,
          healthInsurance: insuranceHistory
            ? this.getInsuranceStatusLabel(
                insuranceHistory.healthInsuranceStatus,
                'health'
              )
            : '-',
          careInsurance: insuranceHistory
            ? this.getInsuranceStatusLabel(
                insuranceHistory.careInsuranceStatus,
                'care'
              )
            : '-',
          pensionInsurance: insuranceHistory
            ? this.getInsuranceStatusLabel(
                insuranceHistory.pensionInsuranceStatus,
                'pension'
              )
            : '-',
        });
      }

      this.mergedHistories = result;
    } finally {
      this.isUpdatingMergedHistories = false;
    }
  }

  /**
   * 統合された履歴データを取得（年月、年齢、標準報酬等級、標準報酬月額、決定理由、健康保険、介護保険、厚生年金）
   */
  getMergedHistories(): Array<{
    year: number;
    month: number;
    age: number | null;
    grade: number | null;
    standardMonthlyRemuneration: number | null;
    determinationReason: string | null;
    healthInsurance: string;
    careInsurance: string;
    pensionInsurance: string;
  }> {
    return this.mergedHistories;
  }
}
