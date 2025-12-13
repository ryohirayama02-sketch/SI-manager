import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../../../services/employee.service';
import { StandardRemunerationHistoryService } from '../../../../services/standard-remuneration-history.service';
import { SettingsService } from '../../../../services/settings.service';
import { GradeDeterminationService } from '../../../../services/grade-determination.service';
import { EmployeeLifecycleService } from '../../../../services/employee-lifecycle.service';
import { SalaryCalculationService } from '../../../../services/salary-calculation.service';
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
export class EmployeeHistoryComponent implements OnInit {
  @Input() employeeId: string | null = null;

  standardRemunerationHistories: StandardRemunerationHistory[] = [];
  insuranceStatusHistories: InsuranceStatusHistory[] = [];
  selectedHistoryYear: number = new Date().getFullYear();
  isLoadingHistories: boolean = false;
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

  constructor(
    private employeeService: EmployeeService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService,
    private settingsService: SettingsService,
    private gradeDeterminationService: GradeDeterminationService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private salaryCalculationService: SalaryCalculationService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadHistories();
  }

  async loadHistories(): Promise<void> {
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
      this.joinYear = this.joinDate
        ? new Date(this.joinDate).getFullYear()
        : null;
      this.joinMonth = this.joinDate
        ? new Date(this.joinDate).getMonth() + 1
        : null;

      // 常に最新の履歴を自動生成
      await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(
        this.employeeId,
        employee
      );
      await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(
        this.employeeId,
        employee
      );

      // 標準報酬履歴を読み込み
      this.standardRemunerationHistories =
        await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
          this.employeeId
        );
      
      console.log('[employee-history] 標準報酬履歴読み込み後', {
        employeeId: this.employeeId,
        historiesCount: this.standardRemunerationHistories.length,
        histories: this.standardRemunerationHistories,
        employeeMonthlyWage: employee.monthlyWage,
        joinDate: employee.joinDate,
      });
      
      // 標準報酬履歴が空で、従業員に月額賃金がある場合は、再度生成を試みる
      if (this.standardRemunerationHistories.length === 0 && employee.monthlyWage) {
        console.log('[employee-history] 標準報酬履歴が空のため再生成を試みます');
        await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(
          this.employeeId,
          employee
        );
        this.standardRemunerationHistories =
          await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
            this.employeeId
          );
        console.log('[employee-history] 再生成後の標準報酬履歴', {
          historiesCount: this.standardRemunerationHistories.length,
          histories: this.standardRemunerationHistories,
        });
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
    this.selectedHistoryYear = typeof year === 'string' ? parseInt(year, 10) : year;

    this.isLoadingHistories = true;
    try {
      const employee = await this.employeeService.getEmployeeById(
        this.employeeId
      );
      if (employee) {
        // 従業員情報を更新（最新の情報を取得）
        this.employee = employee;
        this.joinDate = employee.joinDate;
        this.joinYear = this.joinDate
          ? new Date(this.joinDate).getFullYear()
          : null;
        this.joinMonth = this.joinDate
          ? new Date(this.joinDate).getMonth() + 1
          : null;

        // 選択年度の履歴を生成
        await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(
          this.employeeId,
          employee,
          [this.selectedHistoryYear]
        );
        // 標準報酬履歴も再生成（年度変更時）
        await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(
          this.employeeId,
          employee
        );
        // 履歴を再読み込み
        this.insuranceStatusHistories =
          await this.standardRemunerationHistoryService.getInsuranceStatusHistories(
            this.employeeId
          );
        this.standardRemunerationHistories =
          await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
            this.employeeId
          );
        
        console.log('[employee-history] 年度変更後の標準報酬履歴', {
          selectedHistoryYear: this.selectedHistoryYear,
          historiesCount: this.standardRemunerationHistories.length,
          histories: this.standardRemunerationHistories,
          employeeMonthlyWage: employee.monthlyWage,
          joinDate: employee.joinDate,
        });
        
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
    const selectedYear = typeof this.selectedHistoryYear === 'string' 
      ? parseInt(this.selectedHistoryYear, 10) 
      : this.selectedHistoryYear;

    // 入社日前は表示しない
    const hasJoinYear = this.joinYear !== null && this.joinYear !== undefined;
    const hasJoinMonth = this.joinMonth !== null && this.joinMonth !== undefined;
    if (hasJoinYear) {
      if (selectedYear < (this.joinYear as number)) {
        return [];
      }
    }

    // 選択年度でフィルタリング
    const filtered = this.insuranceStatusHistories.filter(
      (h) => h.year === selectedYear
    );

    // 同じ年月の重複を排除（最新のupdatedAtを持つものを優先、なければcreatedAt）
    const uniqueMap = new Map<string, InsuranceStatusHistory>();
    for (const history of filtered) {
      // 入社月より前の月は除外（入社年のみ）
      if (
        hasJoinYear &&
        hasJoinMonth &&
        history.year === (this.joinYear as number) &&
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
      if (a.year !== b.year) {
        return b.year - a.year;
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
    if (!this.employee) {
      this.mergedHistories = [];
      return;
    }

    // selectedHistoryYearを数値として確実に扱う
    const selectedYear = typeof this.selectedHistoryYear === 'string' 
      ? parseInt(this.selectedHistoryYear, 10) 
      : this.selectedHistoryYear;

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

    // 選択年度の12ヶ月分のデータを作成
    for (let month = 12; month >= 1; month--) {
      // 現在の年月より未来の場合はスキップ
      if (selectedYear > currentYear || (selectedYear === currentYear && month > currentMonth)) {
        continue;
      }

      // 入社月より前の月は除外（入社年のみ）
      const hasJoinYear = this.joinYear !== null && this.joinYear !== undefined;
      const hasJoinMonth = this.joinMonth !== null && this.joinMonth !== undefined;
      if (
        hasJoinYear &&
        hasJoinMonth &&
        selectedYear === (this.joinYear as number) &&
        month < (this.joinMonth as number)
      ) {
        continue;
      }

      // 社保加入履歴から該当月のデータを取得
      const insuranceHistory = insuranceHistories.find(
        (h) => h.year === selectedYear && h.month === month
      );

      // 標準報酬履歴から該当月に適用される履歴を取得
      // 適用開始年月がその月以前で、かつ最も新しいものを取得
      const applicableStandardHistory = this.standardRemunerationHistories
        .filter((h) => {
          if (h.applyStartYear < selectedYear) return true;
          if (
            h.applyStartYear === selectedYear &&
            h.applyStartMonth <= month
          )
            return true;
          return false;
        })
        .sort((a, b) => {
          if (a.applyStartYear !== b.applyStartYear) {
            return b.applyStartYear - a.applyStartYear;
          }
          return b.applyStartMonth - a.applyStartMonth;
        })[0];

      // デバッグログ（2024年1月の場合のみ）
      if (selectedYear === 2024 && month === 1) {
        console.log('[employee-history] 2024年1月の標準報酬履歴検索', {
          selectedYear,
          selectedHistoryYear: this.selectedHistoryYear,
          month,
          standardRemunerationHistories: this.standardRemunerationHistories,
          applicableStandardHistory,
          employee: {
            monthlyWage: this.employee.monthlyWage,
            joinDate: this.employee.joinDate,
            joinYear: this.joinYear,
            joinMonth: this.joinMonth,
          },
        });
      }

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

            if (applicableStandardHistory) {
              const key = this.getHistoryKey(applicableStandardHistory);
              grade = this.computedGrades[key] ?? applicableStandardHistory.grade ?? null;
              standardMonthlyRemuneration = applicableStandardHistory.standardMonthlyRemuneration;
              
              // 決定理由は、標準報酬履歴の適用開始月と一致する場合のみ設定
              // それ以外の月はハイフン（-）を表示
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
            } else {
        // 標準報酬履歴が見つからない場合、従業員情報から月額賃金を使って計算
        // 入社年月が選択年度の該当月以前の場合のみ
        const hasJoinYear = this.joinYear !== null && this.joinYear !== undefined;
        const hasJoinMonth = this.joinMonth !== null && this.joinMonth !== undefined;
        const isAfterJoin = !hasJoinYear || !hasJoinMonth ||
          selectedYear > (this.joinYear as number) ||
          (selectedYear === (this.joinYear as number) && month >= (this.joinMonth as number));

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
            const joinMonthHistory = this.standardRemunerationHistories.find(
              (h) =>
                hasJoinYear &&
                hasJoinMonth &&
                h.applyStartYear === (this.joinYear as number) &&
                h.applyStartMonth === (this.joinMonth as number) &&
                h.determinationReason === 'acquisition'
            );
            if (joinMonthHistory) {
              const key = this.getHistoryKey(joinMonthHistory);
              grade = this.computedGrades[key] ?? joinMonthHistory.grade ?? null;
              standardMonthlyRemuneration = joinMonthHistory.standardMonthlyRemuneration;
              determinationReason = this.getDeterminationReasonLabel(
                joinMonthHistory.determinationReason
              );
            }
          } else {
            // monthlyWageから標準報酬月額と等級を計算
            const yearToUse = hasJoinYear && (this.joinYear as number) <= selectedYear
              ? (this.joinYear as number)
              : selectedYear;
            const gradeTable = await this.settingsService.getStandardTable(yearToUse);
            if (gradeTable && gradeTable.length > 0) {
              const result = this.salaryCalculationService.getStandardMonthlyRemuneration(
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
        year: selectedYear,
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
