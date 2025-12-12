import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../../../services/employee.service';
import { StandardRemunerationHistoryService } from '../../../../services/standard-remuneration-history.service';
import { SettingsService } from '../../../../services/settings.service';
import { GradeDeterminationService } from '../../../../services/grade-determination.service';
import { EmployeeLifecycleService } from '../../../../services/employee-lifecycle.service';
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

  constructor(
    private employeeService: EmployeeService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService,
    private settingsService: SettingsService,
    private gradeDeterminationService: GradeDeterminationService,
    private employeeLifecycleService: EmployeeLifecycleService
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
      await this.computeGradesFromHistories();

      // 社保加入履歴を読み込み
      this.insuranceStatusHistories =
        await this.standardRemunerationHistoryService.getInsuranceStatusHistories(
          this.employeeId
        );
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

  async onHistoryYearChange(): Promise<void> {
    if (!this.employeeId) return;

    // 選択年度の履歴が存在しない場合は自動生成
    const filtered = this.insuranceStatusHistories.filter(
      (h) => h.year === this.selectedHistoryYear
    );
    if (filtered.length === 0) {
      this.isLoadingHistories = true;
      try {
        const employee = await this.employeeService.getEmployeeById(
          this.employeeId
        );
        if (employee) {
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
          await this.computeGradesFromHistories();
        }
      } finally {
        this.isLoadingHistories = false;
      }
    }
  }

  getFilteredInsuranceHistories(): InsuranceStatusHistory[] {
    // 入社日前は表示しない
    const hasJoinYear = this.joinYear !== null && this.joinYear !== undefined;
    const hasJoinMonth = this.joinMonth !== null && this.joinMonth !== undefined;
    if (hasJoinYear) {
      if (this.selectedHistoryYear < (this.joinYear as number)) {
        return [];
      }
    }

    // 選択年度でフィルタリング
    const filtered = this.insuranceStatusHistories.filter(
      (h) => h.year === this.selectedHistoryYear
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
    if (!this.employee) return [];

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
      // 入社月より前の月は除外（入社年のみ）
      const hasJoinYear = this.joinYear !== null && this.joinYear !== undefined;
      const hasJoinMonth = this.joinMonth !== null && this.joinMonth !== undefined;
      if (
        hasJoinYear &&
        hasJoinMonth &&
        this.selectedHistoryYear === (this.joinYear as number) &&
        month < (this.joinMonth as number)
      ) {
        continue;
      }

      // 社保加入履歴から該当月のデータを取得
      const insuranceHistory = insuranceHistories.find(
        (h) => h.year === this.selectedHistoryYear && h.month === month
      );

      // 標準報酬履歴から該当月に適用される履歴を取得
      // 適用開始年月がその月以前で、かつ最も新しいものを取得
      const applicableStandardHistory = this.standardRemunerationHistories
        .filter((h) => {
          if (h.applyStartYear < this.selectedHistoryYear) return true;
          if (
            h.applyStartYear === this.selectedHistoryYear &&
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

      // 年齢を計算
      const age = this.employee.birthDate
        ? this.employeeLifecycleService.getAgeAtMonth(
            this.employee.birthDate,
            this.selectedHistoryYear,
            month
          )
        : null;

      // 標準報酬等級を取得
      let grade: number | null = null;
      if (applicableStandardHistory) {
        const key = this.getHistoryKey(applicableStandardHistory);
        grade = this.computedGrades[key] ?? applicableStandardHistory.grade ?? null;
      }

      result.push({
        year: this.selectedHistoryYear,
        month,
        age,
        grade,
        standardMonthlyRemuneration: applicableStandardHistory
          ? applicableStandardHistory.standardMonthlyRemuneration
          : null,
        determinationReason: applicableStandardHistory
          ? this.getDeterminationReasonLabel(
              applicableStandardHistory.determinationReason
            )
          : null,
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

    return result;
  }
}
