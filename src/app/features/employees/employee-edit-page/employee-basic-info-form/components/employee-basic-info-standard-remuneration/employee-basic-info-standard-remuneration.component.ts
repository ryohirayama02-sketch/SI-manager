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
import { StandardRemunerationHistoryService } from '../../../../../../services/standard-remuneration-history.service';
import { StandardRemunerationHistory } from '../../../../../../models/standard-remuneration-history.model';

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
  currentLatestResult: { type: 'teiji' | 'suiji' | null; teijiResult?: TeijiKetteiResult | null; suijiResult?: any | null } = { type: null }; // 現在採用されている最新の結果
  latestHistory: StandardRemunerationHistory | null = null; // 最新の標準報酬履歴
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
    private roomIdService: RoomIdService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService
  ) {}

  async ngOnInit(): Promise<void> {
    // 決定理由はアプリが自動で設定するため、ユーザーが変更できないようにする
    const determinationReasonControl = this.form.get('determinationReason');
    if (determinationReasonControl) {
      determinationReasonControl.disable();
    }

    await this.loadCalculationResults();
    await this.setStandardFromMonthlyWageIfEmpty();

    // ルーターイベントを購読（画面遷移後に再読み込み）
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(async () => {
        // 従業員編集画面に戻ってきた場合、データを再読み込み
        if (this.employeeId) {
          await this.loadCalculationResults();
          await this.setStandardFromMonthlyWageIfEmpty();
        }
      });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
  }

  /**
   * 決定理由の値を表示用のラベルに変換
   */
  getDeterminationReasonLabel(): string {
    const reason = this.form.get('determinationReason')?.value;
    return this.getDeterminationReasonLabelForHistory(reason);
  }

  /**
   * 決定理由の値を表示用のラベルに変換（履歴用）
   */
  getDeterminationReasonLabelForHistory(reason: string | null | undefined): string {
    if (!reason) return '-';
    switch (reason) {
      case 'teiji':
        return '定時決定';
      case 'suiji':
        return '随時改定';
      case 'acquisition':
      case 'shikaku':
        return '資格取得時決定';
      case 'other':
        return 'その他';
      default:
        return reason;
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    // employeeIdが変更された場合、データを再読み込み
    if (changes['employeeId'] && !changes['employeeId'].firstChange) {
      const newEmployeeId = changes['employeeId'].currentValue;
      const oldEmployeeId = changes['employeeId'].previousValue;

      if (newEmployeeId !== oldEmployeeId) {
        this.previousEmployeeId = oldEmployeeId;
        await this.loadCalculationResults();
        await this.setStandardFromMonthlyWageIfEmpty();
      }
    }
  }

  async loadCalculationResults(): Promise<void> {
    if (!this.employeeId) return;

    this.isLoading = true;
    try {
      // 標準報酬履歴から最新の履歴を取得
      // getStandardRemunerationHistories()は既にソート済みの配列を返すため、再ソートは不要
      const histories = await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
        this.employeeId
      );

      // 最新の履歴を取得（適用開始年月が最新のもの）
      if (histories && histories.length > 0) {
        // 既にソート済みなので、先頭の要素を取得
        this.latestHistory = histories[0];

        // 最新の履歴をフォームに適用
        if (this.latestHistory) {
          const determinationReason = this.latestHistory.determinationReason || 'other';
          this.form.patchValue({
            currentStandardMonthlyRemuneration: this.latestHistory.standardMonthlyRemuneration,
            determinationReason: determinationReason,
          });

          // 表示用の結果を設定
          if (determinationReason === 'teiji') {
            this.currentLatestResult = {
              type: 'teiji',
              teijiResult: {
                standardMonthlyRemuneration: this.latestHistory.standardMonthlyRemuneration,
                grade: this.latestHistory.grade || 0,
                averageSalary: 0,
                excludedMonths: [],
                usedMonths: [],
                reasons: [],
                startApplyYearMonth: {
                  year: this.latestHistory.applyStartYear,
                  month: this.latestHistory.applyStartMonth,
                },
              },
              suijiResult: null,
            };
          } else if (determinationReason === 'suiji') {
            this.currentLatestResult = {
              type: 'suiji',
              teijiResult: null,
              suijiResult: {
                newGrade: this.latestHistory.grade || 0,
                applyStartMonth: this.latestHistory.applyStartMonth,
                applyStartYear: this.latestHistory.applyStartYear,
                changeMonth: (this.latestHistory as any).changeMonth || 0,
              },
            };
          } else {
            this.currentLatestResult = { type: null };
          }
        } else {
          this.currentLatestResult = { type: null };
        }
      } else {
        this.latestHistory = null;
        this.currentLatestResult = { type: null };
      }
    } catch (error) {
      console.error(
        '[EmployeeBasicInfoStandardRemuneration] 履歴の取得エラー:',
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

    // 7月、8月、9月に随時改定の適用開始があるかチェック
    let hasSuijiIn789 = false;

    // 随時改定の適用開始月（変動月+3ヶ月後）を先にチェック
    for (const suiji of this.suijiResults) {
      if (suiji.newGrade && suiji.averageSalary > 0) {
        // 随時改定の年度を取得（アラートに含まれる年度情報を使用）
        const suijiYear = (suiji as any).year || currentYear;
        const gradeTable = await this.settingsService.getStandardTable(
          suijiYear
        );
        const gradeRow = gradeTable.find((r: any) => r.rank === suiji.newGrade);

        if (gradeRow) {
          // 適用開始月を計算（変動月+3ヶ月後）。保存済みのapplyStartMonthに依存せず再計算する。
          const rawApplyMonth = suiji.changeMonth + 3;
          let suijiApplyYear = suijiYear;
          let suijiApplyMonth =
            rawApplyMonth > 12 ? rawApplyMonth - 12 : rawApplyMonth;
          if (rawApplyMonth > 12) {
            suijiApplyYear = suijiYear + 1;
          }

          // 適用開始日を計算
          const suijiApplyDate = new Date(
            suijiApplyYear,
            suijiApplyMonth - 1,
            1
          );

          // 7月、8月、9月に随時改定の適用開始があるかチェック
          if (suijiApplyYear === currentYear && (suijiApplyMonth === 7 || suijiApplyMonth === 8 || suijiApplyMonth === 9)) {
            hasSuijiIn789 = true;
          }

          // 現在の日付より過去または現在の場合は適用対象
          if (suijiApplyDate <= now) {
            const suijiResult: LatestResult = {
              standard: gradeRow.standard,
              reason: 'suiji',
              year: suijiApplyYear,
              month: suijiApplyMonth,
              type: 'suiji',
              suijiChangeMonth: suiji.changeMonth,
            };
            
            if (!latestResult) {
              latestResult = suijiResult;
            } else {
              // latestResultがnullでないことを確認
              const currentLatest: LatestResult = latestResult;
              const latestDate = new Date(
                currentLatest.year,
                currentLatest.month - 1,
                1
              );
              if (suijiApplyDate > latestDate) {
                latestResult = suijiResult;
              }
            }
          }
        }
      }
    }

    // 定時決定の適用開始月（9月）
    // 7月、8月、9月に随時改定の適用開始がある場合、定時決定を実施しない
    if (!hasSuijiIn789 && this.teijiResult && this.teijiResult.standardMonthlyRemuneration > 0) {
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

    // 最新の結果を保持（表示用）
    if (latestResult) {
      if (latestResult.type === 'teiji') {
        this.currentLatestResult = {
          type: 'teiji',
          teijiResult: this.teijiResult,
          suijiResult: null,
        };
      } else if (latestResult.type === 'suiji') {
        // 該当する随時改定結果を探す
        const matchingSuiji = this.suijiResults.find(
          (s) => s.changeMonth === latestResult.suijiChangeMonth
        );
        if (matchingSuiji) {
          // 適用開始月を再計算して設定（変動月+3か月後）
          const rawApplyMonth = matchingSuiji.changeMonth + 3;
          const normalizedApplyMonth =
            rawApplyMonth > 12 ? rawApplyMonth - 12 : rawApplyMonth;
          const suijiYear = (matchingSuiji as any).year || currentYear;
          let applyStartYear = suijiYear;
          if (rawApplyMonth > 12) {
            applyStartYear = suijiYear + 1;
          }
          this.currentLatestResult = {
            type: 'suiji',
            teijiResult: null,
            suijiResult: {
              ...matchingSuiji,
              applyStartMonth: normalizedApplyMonth,
              applyStartYear: applyStartYear,
            },
          };
        } else {
          this.currentLatestResult = {
            type: 'suiji',
            teijiResult: null,
            suijiResult: null,
          };
        }
      }
    } else {
      this.currentLatestResult = { type: null };
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
        // 適用開始月は変動月+3か月後（latestResult.monthに既に計算済み）
        this.form.patchValue({
          currentStandardMonthlyRemuneration: latestResult.standard,
          determinationReason: 'suiji',
          lastSuijiKetteiYear: latestResult.year,
          lastSuijiKetteiMonth: latestResult.month, // 適用開始月（変動月+3か月後）
        });
      }
    }

    await this.setStandardFromMonthlyWageIfEmpty();
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
      // 保存済みのapplyStartMonthに依存せず、変動月+3ヶ月後で再計算
      const rawApplyMonth = suiji.changeMonth + 3;
      const normalizedApplyMonth =
        rawApplyMonth > 12 ? rawApplyMonth - 12 : rawApplyMonth;

      // 変動月+3が12を超える場合は翌年
      let applyYear = suijiYear;
      if (rawApplyMonth > 12) {
        applyYear = suijiYear + 1;
      }

      const applyDate = new Date(applyYear, normalizedApplyMonth - 1, 1);

      // 現在の日付より過去または現在の場合は適用対象
      if (applyDate <= now) {
        if (!latestDate || applyDate > latestDate) {
          latest = {
            ...suiji,
            applyStartMonth: normalizedApplyMonth,
            applyStartYear: applyYear,
          };
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

  /**
   * 月額賃金から標準報酬月額を自動算定（空欄時のみ）
   */
  private async setStandardFromMonthlyWageIfEmpty(): Promise<void> {
    const ctrl = this.form.get('currentStandardMonthlyRemuneration');
    if (!ctrl || ctrl.value) {
      return;
    }

    const wageVal = this.form.get('monthlyWage')?.value;
    if (wageVal === null || wageVal === undefined || wageVal === '') {
      return;
    }

    const rawWage = Number(wageVal);
    if (Number.isNaN(rawWage) || rawWage <= 0) {
      return;
    }

    const joinVal = this.form.get('joinDate')?.value;
    const currentYear = joinVal
      ? new Date(joinVal).getFullYear()
      : new Date().getFullYear();
    const gradeTable =
      (await this.settingsService.getStandardTable(currentYear)) || [];
    const result = this.salaryCalculationService.getStandardMonthlyRemuneration(
      rawWage,
      gradeTable
    );
    const standard = result?.standard ?? rawWage;

    this.form.patchValue(
      {
        currentStandardMonthlyRemuneration: standard,
        determinationReason:
          this.form.get('determinationReason')?.value || 'shikaku',
      },
      { emitEvent: false }
    );
  }
}
