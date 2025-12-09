import {
  Component,
  OnInit,
  OnChanges,
  SimpleChanges,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { MonthlySalaryService } from '../../../../../../services/monthly-salary.service';
import {
  SalaryCalculationService,
  TeijiKetteiResult,
  SalaryData,
} from '../../../../../../services/salary-calculation.service';
import { SettingsService } from '../../../../../../services/settings.service';
import { EmployeeService } from '../../../../../../services/employee.service';
import { SuijiService } from '../../../../../../services/suiji.service';
import { SalaryAggregationService } from '../../../../../../services/salary-aggregation.service';
import { RoomIdService } from '../../../../../../services/room-id.service';

@Component({
  selector: 'app-employee-basic-info-standard-remuneration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-basic-info-standard-remuneration.component.html',
  styleUrl: './employee-basic-info-standard-remuneration.component.css',
})
export class EmployeeBasicInfoStandardRemunerationComponent
  implements OnInit, OnChanges
{
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;

  teijiResult: TeijiKetteiResult | null = null;
  suijiResults: any[] = [];
  latestSuijiResult: any | null = null; // 最新の随時改定結果
  currentYear: number = new Date().getFullYear();
  isLoading: boolean = false;
  private routerSubscription: Subscription | null = null;
  private previousEmployeeId: string | null = null;

  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private salaryCalculationService: SalaryCalculationService,
    private settingsService: SettingsService,
    private employeeService: EmployeeService,
    private suijiService: SuijiService,
    private salaryAggregationService: SalaryAggregationService,
    private router: Router,
    private roomIdService: RoomIdService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadCalculationResults();
    await this.applyLatestResult();

    // ルーターイベントを購読（画面遷移後に再読み込み）
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(async () => {
        // 従業員編集画面に戻ってきた場合、データを再読み込み
        if (this.employeeId) {
          await this.loadCalculationResults();
          await this.applyLatestResult();
        }
      });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    // employeeIdが変更された場合、データを再読み込み
    if (changes['employeeId'] && !changes['employeeId'].firstChange) {
      const newEmployeeId = changes['employeeId'].currentValue;
      const oldEmployeeId = changes['employeeId'].previousValue;

      if (newEmployeeId !== oldEmployeeId) {
        this.previousEmployeeId = oldEmployeeId;
        await this.loadCalculationResults();
        await this.applyLatestResult();
      }
    }
  }

  async loadCalculationResults(): Promise<void> {
    if (!this.employeeId) return;

    this.isLoading = true;
    try {
      const currentYear = new Date().getFullYear();
      const roomId = this.roomIdService.requireRoomId();

      // 給与項目マスタを取得（欠勤控除を取得するため）
      const salaryItems = await this.settingsService.loadSalaryItems(
        currentYear
      );

      // 給与データを変換（月次報酬入力画面と同じ形式に変換）
      // SalaryAggregationServiceを使用して、月次報酬入力画面と同じロジックで取得
      const salaries: { [key: string]: SalaryData } = {};
      for (let month = 1; month <= 12; month++) {
        const monthData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          this.employeeId,
          currentYear,
          month
        );
        const key = `${this.employeeId}_${month}`;

        if (monthData) {
          // SalaryAggregationServiceと同じロジックで取得
          const fixed = this.salaryAggregationService.getFixedSalaryPublic(
            monthData as SalaryData
          );
          const variable =
            this.salaryAggregationService.getVariableSalaryPublic(
              monthData as SalaryData
            );
          const total = this.salaryAggregationService.getTotalSalaryPublic(
            monthData as SalaryData
          );

          // 欠勤控除を取得（給与項目マスタから）
          let deductionTotal = 0;
          if (monthData.salaryItems && monthData.salaryItems.length > 0) {
            const deductionItems = salaryItems.filter(
              (item) => item.type === 'deduction'
            );
            for (const entry of monthData.salaryItems) {
              const deductionItem = deductionItems.find(
                (item) => item.id === entry.itemId
              );
              if (deductionItem) {
                deductionTotal += entry.amount || 0;
              }
            }
          }

          salaries[key] = {
            total: total,
            fixed: fixed,
            variable: variable,
            workingDays: monthData.workingDays,
            deductionTotal: deductionTotal,
          } as SalaryData;
        } else {
          // データがない月は0で初期化（定時決定の計算で必要）
          salaries[key] = {
            total: 0,
            fixed: 0,
            variable: 0,
            deductionTotal: 0,
          } as SalaryData;
        }
      }

      // 等級表を取得
      const gradeTable = await this.settingsService.getStandardTable(
        currentYear
      );

      // 従業員情報を取得（現在の標準報酬月額を取得するため）
      const employee = await this.employeeService.getEmployeeById(
        this.employeeId
      );
      const currentStandard =
        employee?.standardMonthlyRemuneration ||
        employee?.acquisitionStandard ||
        null;

      // 定時決定を計算
      this.teijiResult = this.salaryCalculationService.calculateTeijiKettei(
        this.employeeId,
        salaries,
        gradeTable,
        currentYear,
        currentStandard || undefined,
        employee || undefined
      );

      // 随時改定アラートを取得（複数年度を考慮）
      const yearsToCheck = [currentYear - 1, currentYear, currentYear + 1]; // 前年、当年、翌年
      const allSuijiAlerts = await this.suijiService.loadAllAlerts(
        yearsToCheck
      );
      const filteredSuijiAlerts = allSuijiAlerts
        .filter(
          (alert) => alert.employeeId === this.employeeId && alert.isEligible
        )
        .map((alert) => ({ ...alert, year: alert.year || currentYear })); // 年度情報を保持

      // 最新の随時改定を1つだけ取得（適用開始年月が最新のもの）
      this.latestSuijiResult = this.getLatestSuijiResult(
        filteredSuijiAlerts,
        currentYear
      );
      this.suijiResults = filteredSuijiAlerts; // 後方互換性のため残す
    } catch (error) {
      console.error(
        '[EmployeeBasicInfoStandardRemuneration] 計算結果の取得エラー:',
        error
      );
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 最新の標準報酬月額を自動適用（定時決定と随時改定のうち、現時点から近い方を採用）
   */
  async applyLatestResult(): Promise<void> {
    if (!this.employeeId) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // 定時決定と随時改定の適用開始日を比較
    type LatestResult = {
      standard: number;
      reason: string;
      year: number;
      month: number;
      type: 'teiji' | 'suiji';
      suijiChangeMonth?: number;
    };
    let latestResult: LatestResult | null = null;

    // 定時決定の適用開始月（9月）
    if (this.teijiResult && this.teijiResult.standardMonthlyRemuneration > 0) {
      const teijiApplyYear =
        this.teijiResult.startApplyYearMonth?.year || currentYear;
      const teijiApplyMonth = this.teijiResult.startApplyYearMonth?.month || 9;

      // 適用開始日を計算
      const teijiApplyDate = new Date(teijiApplyYear, teijiApplyMonth - 1, 1);

      // 現在の日付より過去または現在の場合は適用対象
      if (teijiApplyDate <= now) {
        if (!latestResult) {
          latestResult = {
            standard: this.teijiResult.standardMonthlyRemuneration,
            reason: 'teiji',
            year: teijiApplyYear,
            month: teijiApplyMonth,
            type: 'teiji',
          };
        } else {
          // latestResultがnullでないことを確認
          const currentLatest: LatestResult = latestResult;
          const latestDate = new Date(
            currentLatest.year,
            currentLatest.month - 1,
            1
          );
          if (teijiApplyDate > latestDate) {
            latestResult = {
              standard: this.teijiResult.standardMonthlyRemuneration,
              reason: 'teiji',
              year: teijiApplyYear,
              month: teijiApplyMonth,
              type: 'teiji',
            };
          }
        }
      }
    }

    // 随時改定の適用開始月（変動月+4ヶ月後）
    for (const suiji of this.suijiResults) {
      if (suiji.newGrade && suiji.averageSalary > 0) {
        // 随時改定の年度を取得（アラートに含まれる年度情報を使用）
        const suijiYear = (suiji as any).year || currentYear;
        const gradeTable = await this.settingsService.getStandardTable(
          suijiYear
        );
        const gradeRow = gradeTable.find((r: any) => r.rank === suiji.newGrade);

        if (gradeRow) {
          // 適用開始月を計算（変動月+4ヶ月後）
          // suiji.applyStartMonthは既に正規化されている（1-12）
          let suijiApplyYear = suijiYear;
          let suijiApplyMonth = suiji.applyStartMonth;

          // 変動月+4が12を超える場合は翌年
          // ただし、suiji.applyStartMonthは既に正規化されているので、
          // 変動月から直接計算する
          const rawApplyMonth = suiji.changeMonth + 4;
          if (rawApplyMonth > 12) {
            suijiApplyYear = suijiYear + 1;
            // suiji.applyStartMonthは既に正規化されているので、そのまま使用
          }

          // 適用開始日を計算
          const suijiApplyDate = new Date(
            suijiApplyYear,
            suijiApplyMonth - 1,
            1
          );

          // 現在の日付より過去または現在の場合は適用対象
          if (suijiApplyDate <= now) {
            if (!latestResult) {
              latestResult = {
                standard: gradeRow.standard,
                reason: 'suiji',
                year: suijiApplyYear,
                month: suijiApplyMonth,
                type: 'suiji',
                suijiChangeMonth: suiji.changeMonth,
              };
            } else {
              // latestResultがnullでないことを確認
              const currentLatest: LatestResult = latestResult;
              const latestDate = new Date(
                currentLatest.year,
                currentLatest.month - 1,
                1
              );
              if (suijiApplyDate > latestDate) {
                latestResult = {
                  standard: gradeRow.standard,
                  reason: 'suiji',
                  year: suijiApplyYear,
                  month: suijiApplyMonth,
                  type: 'suiji',
                  suijiChangeMonth: suiji.changeMonth,
                };
              }
            }
          }
        }
      }
    }

    // 最新の結果を自動適用
    if (latestResult) {
      if (latestResult.type === 'teiji') {
        this.form.patchValue({
          currentStandardMonthlyRemuneration: latestResult.standard,
          determinationReason: 'teiji',
          lastTeijiKetteiYear: latestResult.year,
          lastTeijiKetteiMonth: latestResult.month,
        });
      } else if (
        latestResult.type === 'suiji' &&
        latestResult.suijiChangeMonth
      ) {
        this.form.patchValue({
          currentStandardMonthlyRemuneration: latestResult.standard,
          determinationReason: 'suiji',
          lastSuijiKetteiYear: latestResult.year,
          lastSuijiKetteiMonth: latestResult.suijiChangeMonth,
        });
      }
    }
  }

  /**
   * 最新の随時改定結果を取得（適用開始年月が最新のもの）
   */
  private getLatestSuijiResult(
    suijiAlerts: any[],
    currentYear: number
  ): any | null {
    if (suijiAlerts.length === 0) return null;

    const now = new Date();
    let latest: any | null = null;
    let latestDate: Date | null = null;

    for (const suiji of suijiAlerts) {
      const suijiYear = suiji.year || currentYear;
      const applyStartMonth =
        suiji.applyStartMonth ||
        (suiji.changeMonth + 4 > 12
          ? suiji.changeMonth + 4 - 12
          : suiji.changeMonth + 4);

      // 変動月+4が12を超える場合は翌年
      let applyYear = suijiYear;
      const rawApplyMonth = suiji.changeMonth + 4;
      if (rawApplyMonth > 12) {
        applyYear = suijiYear + 1;
      }

      const applyDate = new Date(applyYear, applyStartMonth - 1, 1);

      // 現在の日付より過去または現在の場合は適用対象
      if (applyDate <= now) {
        if (!latestDate || applyDate > latestDate) {
          latest = suiji;
          latestDate = applyDate;
        }
      }
    }

    return latest;
  }

  /**
   * 随時改定の年度を取得（ヘルパーメソッド）
   */
  getSuijiYear(suiji: any): number {
    return suiji.year || this.currentYear;
  }
}
