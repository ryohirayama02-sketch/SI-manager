import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import { SalaryCalculationService, ShikakuShutokuResult } from './salary-calculation.service';
import { InsuranceCalculationService } from './insurance-calculation.service';
import { NotificationDecisionService } from './notification-decision.service';
import { MonthHelperService } from './month-helper.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { SettingsService } from './settings.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';

export interface MonthlyPremiumRow {
  month: number;
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  exempt: boolean;
  notes: string[];
  isAcquisitionMonth?: boolean;
  acquisitionGrade?: number;
  acquisitionStandard?: number;
  acquisitionReason?: string;
  shikakuReportRequired?: boolean;
  shikakuReportDeadline?: string;
  shikakuReportReason?: string;
}

export interface MonthlyTotal {
  health: number;
  care: number;
  pension: number;
  total: number;
  isPensionStopped?: boolean;
  isHealthStopped?: boolean;
  isMaternityLeave?: boolean;
  isChildcareLeave?: boolean;
  isRetired?: boolean;
}

export interface CompanyMonthlyTotal {
  month: number;
  healthTotal: number;
  careTotal: number;
  pensionTotal: number;
  total: number;
}

export interface BonusAnnualTotal {
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  totalEmployee: number;
  totalEmployer: number;
  total: number;
}

export interface CalculationResult {
  monthlyPremiumsByEmployee: {
    [employeeId: string]: MonthlyPremiumRow[];
  };
  monthlyTotals: {
    [month: number]: MonthlyTotal;
  };
  companyMonthlyTotals: CompanyMonthlyTotal[];
  bonusAnnualTotals: BonusAnnualTotal;
  bonusByMonth: { [month: number]: Bonus[] };
  errorMessages: { [employeeId: string]: string[] };
}

/**
 * 年間サマリー（payment-summary）の計算ロジックを担当するサービス
 * 月次保険料計算、年間合計、賞与反映、年齢停止、産休・育休免除などを統合的に処理
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryCalculationService {
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private salaryCalculationService: SalaryCalculationService,
    private insuranceCalculationService: InsuranceCalculationService,
    private notificationDecisionService: NotificationDecisionService,
    private monthHelper: MonthHelperService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private settingsService: SettingsService
  ) {}

  async calculateMonthlyTotals(
    employees: Employee[],
    bonuses: Bonus[],
    year: number,
    gradeTable: any[],
    rates: any,
    salaryDataByEmployeeId?: { [employeeId: string]: any },
    prefecture?: string
  ): Promise<CalculationResult> {
    // 賞与保険料の年間合計を初期化
    const bonusAnnualTotals: BonusAnnualTotal = {
      healthEmployee: 0,
      healthEmployer: 0,
      careEmployee: 0,
      careEmployer: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      totalEmployee: 0,
      totalEmployer: 0,
      total: 0,
    };

    // 月ごとの賞与データを初期化
    const bonusByMonth: { [month: number]: Bonus[] } = {};
    for (const bonus of bonuses) {
      const month = bonus.month;
      if (month >= 1 && month <= 12) {
        if (!bonusByMonth[month]) {
          bonusByMonth[month] = [];
        }
        bonusByMonth[month].push(bonus);
      }
    }

    // 賞与データを従業員ごとにグループ化
    const bonusesByEmployee: { [employeeId: string]: Bonus[] } = {};
    for (const bonus of bonuses) {
      if (!bonusesByEmployee[bonus.employeeId]) {
        bonusesByEmployee[bonus.employeeId] = [];
      }
      bonusesByEmployee[bonus.employeeId].push(bonus);
    }

    // 月ごとの集計を初期化
    const allMonthlyTotals: {
      [month: number]: MonthlyTotal;
    } = {};

    for (let month = 1; month <= 12; month++) {
      allMonthlyTotals[month] = {
        health: 0,
        care: 0,
        pension: 0,
        total: 0,
        isPensionStopped: false,
        isHealthStopped: false,
        isMaternityLeave: false,
        isChildcareLeave: false,
        isRetired: false,
      };
    }

    const errorMessages: { [employeeId: string]: string[] } = {};

    if (!employees || employees.length === 0) {
      return {
        monthlyPremiumsByEmployee: {},
        monthlyTotals: allMonthlyTotals,
        companyMonthlyTotals: [],
        bonusAnnualTotals,
        bonusByMonth,
        errorMessages,
      };
    }

    const monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    } = {};

    // 年齢キャッシュを事前計算（従業員ごとに1〜12月の年齢をキャッシュ）
    const ageCacheByEmployee: { [employeeId: string]: { [month: number]: number } } = {};
    for (const emp of employees) {
      const birthDate = new Date(emp.birthDate);
      ageCacheByEmployee[emp.id] = {};
      for (let m = 1; m <= 12; m++) {
        ageCacheByEmployee[emp.id][m] = 
          this.employeeLifecycleService.getAgeAtMonth(birthDate, year, m);
      }
    }

    // 全従業員をループ
    for (const emp of employees) {
      const ageCache = ageCacheByEmployee[emp.id];
      // A. 月次給与の保険料を取得（キャッシュから取得、なければ読み込み）
      const salaryData = salaryDataByEmployeeId?.[emp.id] || 
        await this.monthlySalaryService.getEmployeeSalary(emp.id, year);
      let monthlyPremiums: {
        [month: number]: {
          healthEmployee: number;
          healthEmployer: number;
          careEmployee: number;
          careEmployer: number;
          pensionEmployee: number;
          pensionEmployer: number;
        };
      } = {};

      // 月次保険料一覧を計算（初期化を確実に行う）
      const monthlyPremiumRows: MonthlyPremiumRow[] = [];

      if (salaryData) {
        // 1〜12月分の月次保険料を計算
        for (let month = 1; month <= 12; month++) {
          const monthKey = this.salaryCalculationService.getSalaryKey(
            emp.id,
            month
          );
          const monthSalaryData = salaryData[monthKey];
          const fixedSalary =
            monthSalaryData?.fixedSalary ?? monthSalaryData?.fixed ?? 0;
          const variableSalary =
            monthSalaryData?.variableSalary ?? monthSalaryData?.variable ?? 0;

          // 年度料率の改定月ロジック：月ごとに料率を取得
          let monthRates = rates;
          if (prefecture) {
            const monthRatesResult = await this.settingsService.getRates(
              year.toString(),
              prefecture,
              month.toString()
            );
            if (monthRatesResult) {
              monthRates = monthRatesResult;
            }
          }

          // calculateMonthlyPremiums を呼び出し（戻り値: MonthlyPremiums & { reasons: string[] }）
          const premiumResult =
            await this.salaryCalculationService.calculateMonthlyPremiums(
              emp,
              year,
              month,
              fixedSalary,
              variableSalary,
              gradeTable
            );

          // MonthlyPremiumRow に変換（サービス側の戻り値型に完全一致）
          const exempt = premiumResult.reasons.some(
            (r) => r.includes('産前産後休業') || r.includes('育児休業')
          );

          monthlyPremiumRows.push({
            month,
            healthEmployee: premiumResult.health_employee,
            healthEmployer: premiumResult.health_employer,
            careEmployee: premiumResult.care_employee,
            careEmployer: premiumResult.care_employer,
            pensionEmployee: premiumResult.pension_employee,
            pensionEmployer: premiumResult.pension_employer,
            exempt,
            notes: premiumResult.reasons,
          });

          // 既存の monthlyPremiums 形式にも変換（後方互換性）
          monthlyPremiums[month] = {
            healthEmployee: premiumResult.health_employee,
            healthEmployer: premiumResult.health_employer,
            careEmployee: premiumResult.care_employee,
            careEmployer: premiumResult.care_employer,
            pensionEmployee: premiumResult.pension_employee,
            pensionEmployer: premiumResult.pension_employer,
          };
        }

        // 年齢関連の矛盾チェック
        this.validateAgeRelatedErrors(emp, monthlyPremiums, errorMessages, year, ageCache);
      }

      // 追加：資格取得時決定 資格取得月の情報を追加
      if (emp.joinDate && salaryData) {
        const joinDate = new Date(emp.joinDate);
        const joinYear = this.monthHelper.getPayYear(joinDate);
        const joinMonth = this.monthHelper.getPayMonth(joinDate);

        if (joinYear === year) {
          const salaries: {
            [key: string]: { total: number; fixed: number; variable: number };
          } = {};
          for (let month = 1; month <= 12; month++) {
            const monthKey = this.salaryCalculationService.getSalaryKey(
              emp.id,
              month
            );
            const monthSalaryData = salaryData[monthKey];
            if (monthSalaryData) {
              salaries[monthKey] = {
                total:
                  monthSalaryData.totalSalary ?? monthSalaryData.total ?? 0,
                fixed:
                  monthSalaryData.fixedSalary ?? monthSalaryData.fixed ?? 0,
                variable:
                  monthSalaryData.variableSalary ??
                  monthSalaryData.variable ??
                  0,
              };
            }
          }

          // 追加：資格取得時決定 employeeの既存情報を優先
          let acquisitionGrade = emp.acquisitionGrade;
          let acquisitionStandard = emp.acquisitionStandard;
          let acquisitionMonth = emp.acquisitionMonth;
          let shikakuResult: ShikakuShutokuResult | null = null;

          // 既存情報がない場合のみ計算
          if (!acquisitionGrade || !acquisitionStandard || !acquisitionMonth) {
            shikakuResult =
              await this.salaryCalculationService.calculateShikakuShutoku(
                emp,
                year,
                salaries,
                gradeTable
              );

            if (shikakuResult && shikakuResult.grade > 0) {
              acquisitionGrade = shikakuResult.grade;
              acquisitionStandard = shikakuResult.standardMonthlyRemuneration;
              acquisitionMonth = shikakuResult.usedMonth;
            }
          } else {
            // 既存情報がある場合はそのまま使用（計算は呼ばない）
            // 既存情報からShikakuShutokuResultを構築（資格取得届判定用）
            shikakuResult = {
              baseSalary: acquisitionStandard,
              grade: acquisitionGrade,
              standardMonthlyRemuneration: acquisitionStandard,
              usedMonth: acquisitionMonth,
              reasons: [],
            };
          }

          // UI表示用に設定
          if (acquisitionGrade && acquisitionStandard && acquisitionMonth) {
            const acquisitionRow = monthlyPremiumRows.find(
              (r) => r.month === acquisitionMonth
            );
            if (acquisitionRow) {
              acquisitionRow.isAcquisitionMonth = true;
              acquisitionRow.acquisitionGrade = acquisitionGrade;
              acquisitionRow.acquisitionStandard = acquisitionStandard;
              // 理由文を生成
              acquisitionRow.acquisitionReason = `標準報酬月額：${acquisitionStandard.toLocaleString()}円（1,000円単位に四捨五入済み）\n標準報酬等級：${acquisitionGrade}等級\n資格取得月のため、随時改定対象外`;

              // 資格取得届の要否判定
              const shikakuDecision =
                this.notificationDecisionService.getShikakuShutokuDecision(
                  emp,
                  shikakuResult
                );
              if (shikakuDecision) {
                acquisitionRow.shikakuReportRequired = shikakuDecision.required;
                acquisitionRow.shikakuReportDeadline = shikakuDecision.deadline;
                acquisitionRow.shikakuReportReason = shikakuDecision.reason;
              }
            }
          }
        }
      }

      // B. 賞与の保険料を取得（読み込んだ賞与データから該当従業員分を抽出）
      const employeeBonuses = bonusesByEmployee[emp.id] || [];

      // 賞与保険料を月次給与の保険料に加算（停止判定を適用）
      for (const bonus of employeeBonuses) {
        const bonusMonth = bonus.month;

        // 停止判定（優先順位：退職 > 産休/育休 > 年齢停止）
        const age = ageCache[bonusMonth];
        const pensionStopped = age >= 70;
        const healthStopped = age >= 75;
        const maternityLeave = this.employeeLifecycleService.isMaternityLeave(emp, year, bonusMonth);
        const childcareLeave = this.employeeLifecycleService.isChildcareLeave(emp, year, bonusMonth);
        const retired = this.employeeLifecycleService.isRetiredInMonth(emp, year, bonusMonth);

        let bonusHealthEmployee = bonus.healthEmployee || 0;
        let bonusHealthEmployer = bonus.healthEmployer || 0;
        let bonusCareEmployee = bonus.careEmployee || 0;
        let bonusCareEmployer = bonus.careEmployer || 0;
        let bonusPensionEmployee = bonus.pensionEmployee || 0;
        let bonusPensionEmployer = bonus.pensionEmployer || 0;

        // 退職月判定（最優先：本人・会社とも保険料ゼロ）
        if (retired) {
          bonusHealthEmployee = 0;
          bonusHealthEmployer = 0;
          bonusCareEmployee = 0;
          bonusCareEmployer = 0;
          bonusPensionEmployee = 0;
          bonusPensionEmployer = 0;
        } else {
          // 産休・育休による本人負担免除処理（事業主負担は維持）
          if (maternityLeave || childcareLeave) {
            bonusHealthEmployee = 0;
            bonusCareEmployee = 0;
            bonusPensionEmployee = 0;
          }

          // 年齢による停止処理
          if (pensionStopped) {
            bonusPensionEmployee = 0;
            bonusPensionEmployer = 0;
          }
          if (healthStopped) {
            bonusHealthEmployee = 0;
            bonusHealthEmployer = 0;
            bonusCareEmployee = 0;
            bonusCareEmployer = 0;
          }
        }

        // 賞与保険料の年間合計に加算（停止判定後の値）
        bonusAnnualTotals.healthEmployee += bonusHealthEmployee;
        bonusAnnualTotals.healthEmployer += bonusHealthEmployer;
        bonusAnnualTotals.careEmployee += bonusCareEmployee;
        bonusAnnualTotals.careEmployer += bonusCareEmployer;
        bonusAnnualTotals.pensionEmployee += bonusPensionEmployee;
        bonusAnnualTotals.pensionEmployer += bonusPensionEmployer;

        // 月次給与の保険料に賞与分を加算（該当月の保険料に加算）
        if (monthlyPremiums[bonusMonth]) {
          monthlyPremiums[bonusMonth].healthEmployee += bonusHealthEmployee;
          monthlyPremiums[bonusMonth].healthEmployer += bonusHealthEmployer;
          monthlyPremiums[bonusMonth].careEmployee += bonusCareEmployee;
          monthlyPremiums[bonusMonth].careEmployer += bonusCareEmployer;
          monthlyPremiums[bonusMonth].pensionEmployee += bonusPensionEmployee;
          monthlyPremiums[bonusMonth].pensionEmployer += bonusPensionEmployer;
        }

        // 月次保険料一覧にも加算
        const premiumRow = monthlyPremiumRows.find(
          (r) => r.month === bonusMonth
        );
        if (premiumRow) {
          premiumRow.healthEmployee += bonusHealthEmployee;
          premiumRow.healthEmployer += bonusHealthEmployer;
          premiumRow.careEmployee += bonusCareEmployee;
          premiumRow.careEmployer += bonusCareEmployer;
          premiumRow.pensionEmployee += bonusPensionEmployee;
          premiumRow.pensionEmployer += bonusPensionEmployer;
        }
      }

      // 月次保険料一覧を保存（salaryDataがない場合でも空配列を設定）
      monthlyPremiumsByEmployee[emp.id] = monthlyPremiumRows;

      // サービスを使用して月次会社負担を計算
      const employeeMonthlyTotals =
        this.insuranceCalculationService.getMonthlyCompanyBurden(
          emp,
          monthlyPremiums,
          employeeBonuses
        );

      // 全従業員分を合計（退職判定、産休・育休判定、年齢による停止判定を適用）
      // 優先順位：退職 ＞ 産休/育休 ＞ 年齢停止
      for (let month = 1; month <= 12; month++) {
        const age = ageCache[month];
        const pensionStopped = age >= 70;
        const healthStopped = age >= 75;
        const maternityLeave = this.employeeLifecycleService.isMaternityLeave(emp, year, month);
        const childcareLeave = this.employeeLifecycleService.isChildcareLeave(emp, year, month);
        const retired = this.employeeLifecycleService.isRetiredInMonth(emp, year, month);

        let healthAmount = employeeMonthlyTotals[month]?.health || 0;
        let careAmount = employeeMonthlyTotals[month]?.care || 0;
        let pensionAmount = employeeMonthlyTotals[month]?.pension || 0;

        // 退職月判定（最優先：本人・会社とも保険料ゼロ）
        if (retired) {
          healthAmount = 0;
          careAmount = 0;
          pensionAmount = 0;
          allMonthlyTotals[month].isRetired = true;
        } else {
          // 産休・育休による本人負担免除処理
          // employee負担を0にするが、employer負担は維持
          if (maternityLeave || childcareLeave) {
            const premiums = monthlyPremiums[month];
            if (premiums) {
              // employee負担分を差し引く（employer負担は維持）
              const employeeHealth = premiums.healthEmployee || 0;
              const employeeCare = premiums.careEmployee || 0;
              const employeePension = premiums.pensionEmployee || 0;

              healthAmount -= employeeHealth;
              careAmount -= employeeCare;
              pensionAmount -= employeePension;

              if (maternityLeave) {
                allMonthlyTotals[month].isMaternityLeave = true;
              }
              if (childcareLeave) {
                allMonthlyTotals[month].isChildcareLeave = true;
              }
            }
          }

          // 年齢による停止処理
          if (pensionStopped) {
            pensionAmount = 0;
            allMonthlyTotals[month].isPensionStopped = true;
          }
          if (healthStopped) {
            healthAmount = 0;
            careAmount = 0;
            allMonthlyTotals[month].isHealthStopped = true;
          }
        }

        allMonthlyTotals[month].health += healthAmount;
        allMonthlyTotals[month].care += careAmount;
        allMonthlyTotals[month].pension += pensionAmount;
        allMonthlyTotals[month].total +=
          healthAmount + careAmount + pensionAmount;
      }
    }

    // 賞与保険料を支給月の月別合計に加算（年齢による停止判定を適用）
    for (const bonus of bonuses) {
      const bonusMonth = bonus.month;
      if (bonusMonth >= 1 && bonusMonth <= 12) {
        // 該当月のオブジェクトが存在することを確認（初期化済み）
        if (!allMonthlyTotals[bonusMonth]) {
          allMonthlyTotals[bonusMonth] = {
            health: 0,
            care: 0,
            pension: 0,
            total: 0,
            isPensionStopped: false,
            isHealthStopped: false,
            isMaternityLeave: false,
            isChildcareLeave: false,
            isRetired: false,
          };
        }

        // 賞与支給者の年齢と退職日を確認
        const bonusEmployee = employees.find(
          (e) => e.id === bonus.employeeId
        );
        if (bonusEmployee) {
          // 退職月判定（最優先）
          const retired = this.employeeLifecycleService.isRetiredInMonth(
            bonusEmployee,
            year,
            bonusMonth
          );

          if (retired) {
            // 退職月の場合は賞与保険料を加算しない
            allMonthlyTotals[bonusMonth].isRetired = true;
            continue;
          }

          const bonusAgeCache = ageCacheByEmployee[bonusEmployee.id];
          const age = bonusAgeCache[bonusMonth];
          const pensionStopped = age >= 70;
          const healthStopped = age >= 75;

          let bonusHealthEmployee = bonus.healthEmployee || 0;
          let bonusHealthEmployer = bonus.healthEmployer || 0;
          let bonusCareEmployee = bonus.careEmployee || 0;
          let bonusCareEmployer = bonus.careEmployer || 0;
          let bonusPensionEmployee = bonus.pensionEmployee || 0;
          let bonusPensionEmployer = bonus.pensionEmployer || 0;

          // 年齢による停止処理
          if (pensionStopped) {
            bonusPensionEmployee = 0;
            bonusPensionEmployer = 0;
            allMonthlyTotals[bonusMonth].isPensionStopped = true;
          }
          if (healthStopped) {
            bonusHealthEmployee = 0;
            bonusHealthEmployer = 0;
            bonusCareEmployee = 0;
            bonusCareEmployer = 0;
            allMonthlyTotals[bonusMonth].isHealthStopped = true;
          }

          // 賞与保険料を月別合計に加算
          allMonthlyTotals[bonusMonth].health +=
            bonusHealthEmployee + bonusHealthEmployer;
          allMonthlyTotals[bonusMonth].care +=
            bonusCareEmployee + bonusCareEmployer;
          allMonthlyTotals[bonusMonth].pension +=
            bonusPensionEmployee + bonusPensionEmployer;
          allMonthlyTotals[bonusMonth].total +=
            bonusHealthEmployee +
            bonusHealthEmployer +
            (bonusCareEmployee + bonusCareEmployer) +
            (bonusPensionEmployee + bonusPensionEmployer);
        }
      }
    }

    // 賞与保険料の年間合計を計算
    bonusAnnualTotals.totalEmployee =
      bonusAnnualTotals.healthEmployee +
      bonusAnnualTotals.careEmployee +
      bonusAnnualTotals.pensionEmployee;
    bonusAnnualTotals.totalEmployer =
      bonusAnnualTotals.healthEmployer +
      bonusAnnualTotals.careEmployer +
      bonusAnnualTotals.pensionEmployer;
    bonusAnnualTotals.total =
      bonusAnnualTotals.totalEmployee + bonusAnnualTotals.totalEmployer;

    // 会社全体の月次保険料合計を計算
    const companyMonthlyTotals = this.calculateCompanyMonthlyTotals(
      employees,
      monthlyPremiumsByEmployee
    );

    return {
      monthlyPremiumsByEmployee,
      monthlyTotals: allMonthlyTotals,
      companyMonthlyTotals,
      bonusAnnualTotals,
      bonusByMonth,
      errorMessages,
    };
  }

  /**
   * 年齢関連の矛盾をチェックする
   */
  private validateAgeRelatedErrors(
    emp: Employee,
    monthlyPremiums: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
      };
    },
    errorMessages: { [employeeId: string]: string[] },
    year: number,
    ageCache: { [month: number]: number }
  ): void {
    // 70歳以上なのに厚生年金の保険料が計算されている
    for (let month = 1; month <= 12; month++) {
      const premiums = monthlyPremiums[month];
      const age = ageCache[month];
      
      if (premiums && age >= 70 && premiums.pensionEmployee > 0) {
        if (!errorMessages[emp.id]) errorMessages[emp.id] = [];
        errorMessages[emp.id].push(
          `${month}月：70歳以上は厚生年金保険料は発生しません`
        );
      }

      // 75歳以上なのに健康保険・介護保険が計算されている
      if (
        premiums &&
        age >= 75 &&
        (premiums.healthEmployee > 0 || premiums.careEmployee > 0)
      ) {
        if (!errorMessages[emp.id]) errorMessages[emp.id] = [];
        errorMessages[emp.id].push(
          `${month}月：75歳以上は健康保険・介護保険は発生しません`
        );
      }
    }
  }

  /**
   * monthlyPremiumsByEmployee を元に会社全体の月次合計を計算
   * 事業主が支払うべき総額（本人負担 + 会社負担）を月ごとに集計する
   */
  calculateCompanyMonthlyTotals(
    employees: Employee[],
    monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    }
  ): CompanyMonthlyTotal[] {
    const totals: {
      [month: number]: {
        healthTotal: number;
        careTotal: number;
        pensionTotal: number;
        total: number;
      };
    } = {};

    // 1〜12月を初期化
    for (let month = 1; month <= 12; month++) {
      totals[month] = {
        healthTotal: 0,
        careTotal: 0,
        pensionTotal: 0,
        total: 0,
      };
    }

    // 全従業員分を合算
    for (const emp of employees) {
      const employeeRows = monthlyPremiumsByEmployee[emp.id];
      if (!employeeRows || employeeRows.length === 0) {
        continue;
      }

      for (const row of employeeRows) {
        const month = row.month;
        // exempt の月はそのまま 0 として扱う（既に 0 になっている）
        // 事業主が支払うべき総額 = 本人負担 + 会社負担
        const healthSum = row.healthEmployee + row.healthEmployer;
        const careSum = row.careEmployee + row.careEmployer;
        const pensionSum = row.pensionEmployee + row.pensionEmployer;

        totals[month].healthTotal += healthSum;
        totals[month].careTotal += careSum;
        totals[month].pensionTotal += pensionSum;
      }
    }

    // 配列形式に変換（total は healthTotal + careTotal + pensionTotal として計算）
    const companyMonthlyTotals: CompanyMonthlyTotal[] = [];
    for (let month = 1; month <= 12; month++) {
      const healthTotal = totals[month].healthTotal;
      const careTotal = totals[month].careTotal;
      const pensionTotal = totals[month].pensionTotal;
      const total = healthTotal + careTotal + pensionTotal;

      companyMonthlyTotals.push({
        month,
        healthTotal,
        careTotal,
        pensionTotal,
        total,
      });
    }

    return companyMonthlyTotals;
  }

  /**
   * 会社全体の年間保険料合計を計算する
   * @param companyMonthlyTotals 会社全体の月次保険料合計
   * @returns 年間合計（健康保険、介護保険、厚生年金、総額）
   */
  calculateAnnualTotals(companyMonthlyTotals: CompanyMonthlyTotal[]): {
    health: number;
    care: number;
    pension: number;
    total: number;
  } {
    let health = 0;
    let care = 0;
    let pension = 0;
    let total = 0;

    for (const monthlyTotal of companyMonthlyTotals) {
      health += monthlyTotal.healthTotal;
      care += monthlyTotal.careTotal;
      pension += monthlyTotal.pensionTotal;
      total += monthlyTotal.total;
    }

    return { health, care, pension, total };
  }

  /**
   * 従業員に備考（notes）があるかどうかを判定する
   * @param employeeId 従業員ID
   * @param monthlyPremiumsByEmployee 月次保険料一覧（従業員ごと）
   * @returns 備考がある場合 true
   */
  hasNotesForEmployee(
    employeeId: string,
    monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    }
  ): boolean {
    const rows = monthlyPremiumsByEmployee[employeeId];
    if (!rows || rows.length === 0) {
      return false;
    }
    return rows.some((r) => r.notes && r.notes.length > 0);
  }

}

