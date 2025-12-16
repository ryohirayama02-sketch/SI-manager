import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import {
  SalaryCalculationService,
  ShikakuShutokuResult,
} from './salary-calculation.service';
import { NotificationDecisionService } from './notification-decision.service';
import { MonthHelperService } from './month-helper.service';
import { SettingsService } from './settings.service';
import { UncollectedPremiumService } from './uncollected-premium.service';
import { StandardRemunerationHistoryService } from './standard-remuneration-history.service';
import { Employee } from '../models/employee.model';
import { MonthlyPremiumRow } from './payment-summary-types';
import { PremiumStoppingRuleService } from './premium-stopping-rule.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { RoomIdService } from './room-id.service';
import { BonusService } from './bonus.service';

/**
 * MonthlyPremiumCalculationService
 *
 * 月次保険料計算を担当するサービス
 * 従業員ごとの月次給与から保険料を計算し、資格取得時決定の情報を追加
 */
@Injectable({ providedIn: 'root' })
export class MonthlyPremiumCalculationService {
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private salaryCalculationService: SalaryCalculationService,
    private notificationDecisionService: NotificationDecisionService,
    private monthHelper: MonthHelperService,
    private settingsService: SettingsService,
    private uncollectedPremiumService: UncollectedPremiumService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService,
    private premiumStoppingRuleService: PremiumStoppingRuleService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private roomIdService: RoomIdService,
    private bonusService: BonusService
  ) {}

  /**
   * 従業員の月次保険料を計算
   */
  async calculateEmployeeMonthlyPremiums(
    emp: Employee,
    year: number,
    month: number,
    salaryData: any,
    gradeTable: any[],
    rates: any,
    prefecture?: string
  ): Promise<MonthlyPremiumRow> {
    if (!emp) {
      throw new Error('従業員データが指定されていません');
    }
    if (!emp.id) {
      throw new Error('従業員IDが指定されていません');
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      throw new Error(`無効な年が指定されました: ${year}`);
    }
    if (isNaN(month) || month < 1 || month > 12) {
      throw new Error(`無効な月が指定されました: ${month}`);
    }
    // 従業員データにcurrentStandardMonthlyRemunerationがない場合、salaryDataから定時決定を計算して取得
    // empのidが確実に含まれるようにする
    let employeeWithStandard = { ...emp };
    // idが確実に含まれるようにする
    if (!employeeWithStandard.id) {
      employeeWithStandard.id = emp.id;
    }

    // 標準報酬月額が確定していない場合のみ、標準報酬履歴またはsalaryDataから定時決定を計算
    // 重要：標準報酬月額は算定基礎届（定時決定）や随時改定で決定されるため、
    // その月の給与が0円でも標準報酬月額に基づいて保険料を計算する必要があります。
    // 保険料は標準報酬月額×料率で計算するため、その月の給与が0円でも標準報酬月額に基づいて保険料を計算する必要があります。
    // 優先順位：
    // 1. 従業員データの標準報酬月額
    // 2. 標準報酬履歴から取得（指定された年月に適用される標準報酬月額）
    // 3. 年度全体の給与データから定時決定を計算
    if (
      !employeeWithStandard.currentStandardMonthlyRemuneration ||
      employeeWithStandard.currentStandardMonthlyRemuneration <= 0
    ) {
      // まず標準報酬履歴から取得を試みる
      const historyStandard =
        await this.standardRemunerationHistoryService.getStandardRemunerationForMonth(
          emp.id,
          year,
          month
        );

      if (historyStandard && historyStandard > 0) {
        employeeWithStandard.currentStandardMonthlyRemuneration =
          historyStandard;
      } else {
        // 標準報酬履歴から取得できない場合、年度全体の給与データから定時決定を計算して標準報酬月額を取得
        // salaryDataが存在しない場合でも、給与データを取得して定時決定を計算する必要があります
        let dataToUse = salaryData;
        if (!dataToUse) {
          const roomId =
            (emp as any).roomId || this.roomIdService.requireRoomId();
          const yearMap: any = {};
          for (let m = 1; m <= 12; m++) {
            if (!emp.id) {
              continue;
            }
            const md = await this.monthlySalaryService.getEmployeeSalary(
              roomId,
              emp.id,
              year,
              m
            );
            if (md) yearMap[m.toString()] = md;
          }
          dataToUse = Object.keys(yearMap).length > 0 ? yearMap : null;
        }

        if (dataToUse) {
          // 年度の給与データから定時決定を計算（その月の給与が0円でも、年度全体の給与データから標準報酬月額を取得）
          const empSalaries: {
            [key: string]: { total: number; fixed: number; variable: number };
          } = {};
          for (let m = 1; m <= 12; m++) {
            const monthKey = m.toString();
            const monthData = dataToUse[monthKey];
            if (monthData) {
              const key = `${emp.id}_${m}`;
              empSalaries[key] = {
                total: monthData.totalSalary ?? monthData.total ?? 0,
                fixed: monthData.fixedSalary ?? monthData.fixed ?? 0,
                variable: monthData.variableSalary ?? monthData.variable ?? 0,
              };
            }
          }

          //               salaryDataExists: !!salaryData,
          //               dataToUseExists: !!dataToUse,
          //             }
          //           );

          // 定時決定を計算
          const teijiResult =
            this.salaryCalculationService.calculateTeijiKettei(
              emp.id,
              empSalaries,
              gradeTable,
              year,
              emp.currentStandardMonthlyRemuneration ?? undefined,
              emp
            );

          if (teijiResult && teijiResult.standardMonthlyRemuneration > 0) {
            employeeWithStandard.currentStandardMonthlyRemuneration =
              teijiResult.standardMonthlyRemuneration;
          }
        }
      }
    } else if (
      employeeWithStandard.currentStandardMonthlyRemuneration &&
      employeeWithStandard.currentStandardMonthlyRemuneration > 0
    ) {
    }

    // 給与データがある場合のみ通常の計算を実行
    // 重要：その月の給与が0円でも、標準報酬月額が確定していれば保険料を計算する必要があるため、
    // salaryDataが存在する場合でも、その月のデータが存在しない場合は給与0円として計算を実行
    // 標準報酬月額が確定していれば、salaryDataが存在しなくても保険料を計算する必要がある
    const monthKeyString = month.toString();
    const monthSalaryData = salaryData ? salaryData[monthKeyString] : undefined;

    //         employeeWithStandardStandardMonthlyRemuneration:
    //           employeeWithStandard.currentStandardMonthlyRemuneration,
    //       }
    //     );

    const fixedSalary =
      monthSalaryData?.fixedSalary ?? monthSalaryData?.fixed ?? 0;
    const variableSalary =
      monthSalaryData?.variableSalary ?? monthSalaryData?.variable ?? 0;

    // その月の給与が0円でも、標準報酬月額が確定していれば保険料を計算する必要がある
    // 標準報酬月額は算定基礎届（定時決定）や随時改定で決定されるため、その月の給与が0円でも標準報酬月額に基づいて保険料を計算する
    // 標準報酬月額が確定していれば、salaryDataが存在しなくても保険料を計算する必要がある
    if (salaryData || employeeWithStandard.currentStandardMonthlyRemuneration) {
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

      // calculateMonthlyPremiums を呼び出し
      // monthSalaryDataが存在しない場合でも、標準報酬月額が確定していれば保険料を計算する必要がある
      const premiumResult =
        await this.salaryCalculationService.calculateMonthlyPremiums(
          employeeWithStandard, // 標準報酬月額を含む従業員データを使用
          year,
          month,
          fixedSalary,
          variableSalary,
          gradeTable
        );

      //           reasons: premiumResult.reasons,
      //         }
      //       );

      // MonthlyPremiumRow に変換
      const exempt = premiumResult.reasons.some(
        (r) => r.includes('産前産後休業') || r.includes('育児休業')
      );

      if (!emp.birthDate) {
        throw new Error('従業員の生年月日が設定されていません');
      }
      const birthDate = new Date(emp.birthDate);
      if (isNaN(birthDate.getTime())) {
        throw new Error(`無効な生年月日が設定されています: ${emp.birthDate}`);
      }
      const ageForStopping = this.employeeLifecycleService.getAgeAtMonth(
        birthDate,
        year,
        month
      );

      const stopping = this.premiumStoppingRuleService.applyStoppingRules(
        emp,
        year,
        month,
        ageForStopping,
        {
          healthEmployee: premiumResult.health_employee,
          healthEmployer: premiumResult.health_employer,
          careEmployee: premiumResult.care_employee,
          careEmployer: premiumResult.care_employer,
          pensionEmployee: premiumResult.pension_employee,
          pensionEmployer: premiumResult.pension_employer,
        }
      );

      const premiumRow: MonthlyPremiumRow = {
        month,
        healthEmployee: stopping.healthEmployee,
        healthEmployer: stopping.healthEmployer,
        careEmployee: stopping.careEmployee,
        careEmployer: stopping.careEmployer,
        pensionEmployee: stopping.pensionEmployee,
        pensionEmployer: stopping.pensionEmployer,
        exempt,
        notes: premiumResult.reasons,
        isRetired: stopping.isRetired,
        isMaternityLeave: stopping.isMaternityLeave,
        isChildcareLeave: stopping.isChildcareLeave,
        isPensionStopped: stopping.isPensionStopped,
        isHealthStopped: stopping.isHealthStopped,
      };

      // 徴収不能額のチェックと保存
      // 総支給額と本人負担保険料を比較（欠勤控除を引いた総支給額を使用）
      // monthSalaryDataのtotalまたはtotalSalaryは既に欠勤控除を引いた値（calculateSalaryTotalsで計算済み）
      const monthlyTotalSalary =
        monthSalaryData?.totalSalary ??
        monthSalaryData?.total ??
        fixedSalary + variableSalary;

      // 月次給与の本人負担保険料
      let employeeTotalPremium =
        premiumResult.health_employee +
        premiumResult.care_employee +
        premiumResult.pension_employee;

      // その月の賞与の本人負担保険料を加算（同じ月に複数の賞与がある場合は合算）
      const roomIdForBonus = this.roomIdService.requireRoomId();
      const employeeIdForBonus = employeeWithStandard.id || emp.id;
      const bonusesForBonus = await this.bonusService.listBonuses(
        roomIdForBonus,
        employeeIdForBonus,
        year
      );
      const monthBonusesForBonus = bonusesForBonus.filter((bonus) => {
        if (!bonus || !bonus.payDate) return false;
        const payDateObj = new Date(bonus.payDate);
        if (isNaN(payDateObj.getTime())) return false;
        const payYear = payDateObj.getFullYear();
        const payMonth = payDateObj.getMonth() + 1;
        return (
          payYear === year &&
          payMonth === month &&
          !bonus.isExempted &&
          !bonus.isSalaryInsteadOfBonus
        );
      });

      // 月次給与の総支給額に賞与の金額も加算
      let totalSalary = monthlyTotalSalary;
      if (monthBonusesForBonus.length > 0) {
        // 同じ月のすべての賞与の金額を合算
        const totalBonusAmount = monthBonusesForBonus.reduce(
          (sum, b) => sum + (b.amount || 0),
          0
        );
        totalSalary += totalBonusAmount;

        // 同じ月のすべての賞与の保険料を合算
        const totalBonusPremium = monthBonusesForBonus.reduce((sum, bonus) => {
          return (
            sum +
            (bonus.healthEmployee || 0) +
            (bonus.careEmployee || 0) +
            (bonus.pensionEmployee || 0)
          );
        }, 0);
        employeeTotalPremium += totalBonusPremium;
      }

      // 産休・育休中でない場合のみチェック
      if (!stopping.isMaternityLeave && !stopping.isChildcareLeave) {
        const employeeId = employeeWithStandard.id || emp.id;
        if (employeeId) {
          await this.uncollectedPremiumService.saveUncollectedPremium(
            employeeId,
            year,
            month,
            totalSalary,
            employeeTotalPremium
          );
        }
      }

      return premiumRow;
    } else {
      // 給与データがなく、標準報酬月額も設定されていない場合
      // 年度全体の給与データから定時決定を計算して標準報酬月額を取得し、給与0円として保険料計算を実行

      // 給与データがない場合でも、従業員データにcurrentStandardMonthlyRemunerationがない場合は、
      // 給与データを取得して定時決定を計算
      if (
        !employeeWithStandard.currentStandardMonthlyRemuneration ||
        employeeWithStandard.currentStandardMonthlyRemuneration <= 0
      ) {
        const roomId =
          (emp as any).roomId || this.roomIdService.requireRoomId();
        const fetchedSalaryData: any = {};
        for (let m = 1; m <= 12; m++) {
          if (!emp.id) {
            continue;
          }
          const md = await this.monthlySalaryService.getEmployeeSalary(
            roomId,
            emp.id,
            year,
            m
          );
          if (md) {
            fetchedSalaryData[m.toString()] = md;
          }
        }
        if (Object.keys(fetchedSalaryData).length > 0) {
          const empSalaries: {
            [key: string]: { total: number; fixed: number; variable: number };
          } = {};
          for (let m = 1; m <= 12; m++) {
            const monthKey = m.toString();
            const monthData = fetchedSalaryData[monthKey];
            if (monthData) {
              const key = `${emp.id}_${m}`;
              empSalaries[key] = {
                total: monthData.totalSalary ?? monthData.total ?? 0,
                fixed: monthData.fixedSalary ?? monthData.fixed ?? 0,
                variable: monthData.variableSalary ?? monthData.variable ?? 0,
              };
            }
          }

          // 定時決定を計算
          const teijiResult =
            this.salaryCalculationService.calculateTeijiKettei(
              emp.id,
              empSalaries,
              gradeTable,
              year,
              emp.currentStandardMonthlyRemuneration ?? undefined,
              emp
            );

          if (teijiResult && teijiResult.standardMonthlyRemuneration > 0) {
            employeeWithStandard.currentStandardMonthlyRemuneration =
              teijiResult.standardMonthlyRemuneration;
          }
        }
      }

      const premiumResult =
        await this.salaryCalculationService.calculateMonthlyPremiums(
          employeeWithStandard, // 標準報酬月額を含む従業員データを使用
          year,
          month,
          0, // fixedSalary = 0
          0, // variableSalary = 0
          gradeTable
        );

      if (!emp.birthDate) {
        throw new Error('従業員の生年月日が設定されていません');
      }
      const birthDateForStopping = new Date(emp.birthDate);
      if (isNaN(birthDateForStopping.getTime())) {
        throw new Error(`無効な生年月日が設定されています: ${emp.birthDate}`);
      }
      const stopping = this.premiumStoppingRuleService.applyStoppingRules(
        emp,
        year,
        month,
        this.employeeLifecycleService.getAgeAtMonth(
          birthDateForStopping,
          year,
          month
        ),
        {
          healthEmployee: premiumResult.health_employee,
          healthEmployer: premiumResult.health_employer,
          careEmployee: premiumResult.care_employee,
          careEmployer: premiumResult.care_employer,
          pensionEmployee: premiumResult.pension_employee,
          pensionEmployer: premiumResult.pension_employer,
        }
      );

      const premiumRow: MonthlyPremiumRow = {
        month,
        healthEmployee: stopping.healthEmployee,
        healthEmployer: stopping.healthEmployer,
        careEmployee: stopping.careEmployee,
        careEmployer: stopping.careEmployer,
        pensionEmployee: stopping.pensionEmployee,
        pensionEmployer: stopping.pensionEmployer,
        exempt: false,
        notes: premiumResult.reasons,
        isRetired: stopping.isRetired,
        isMaternityLeave: stopping.isMaternityLeave,
        isChildcareLeave: stopping.isChildcareLeave,
        isPensionStopped: stopping.isPensionStopped,
        isHealthStopped: stopping.isHealthStopped,
      };

      // 徴収不能額のチェックと保存（給与0円、標準報酬月額が確定していれば保険料が発生する可能性がある）
      const totalSalary = 0;

      // 月次給与の本人負担保険料
      let employeeTotalPremium =
        premiumResult.health_employee +
        premiumResult.care_employee +
        premiumResult.pension_employee;

      // その月の賞与の本人負担保険料を加算
      const roomIdForBonus = this.roomIdService.requireRoomId();
      const employeeIdForBonus = employeeWithStandard.id || emp.id;
      const bonusesForBonus = await this.bonusService.listBonuses(
        roomIdForBonus,
        employeeIdForBonus,
        year
      );
      const monthBonusForBonus = bonusesForBonus.find((bonus) => {
        if (!bonus || !bonus.payDate) return false;
        const payDateObj = new Date(bonus.payDate);
        if (isNaN(payDateObj.getTime())) return false;
        const payYear = payDateObj.getFullYear();
        const payMonth = payDateObj.getMonth() + 1;
        return payYear === year && payMonth === month;
      });

      if (
        monthBonusForBonus &&
        !monthBonusForBonus.isExempted &&
        !monthBonusForBonus.isSalaryInsteadOfBonus
      ) {
        // 賞与の本人負担保険料を加算
        const bonusPremiumForNoSalary =
          (monthBonusForBonus.healthEmployee || 0) +
          (monthBonusForBonus.careEmployee || 0) +
          (monthBonusForBonus.pensionEmployee || 0);
        employeeTotalPremium += bonusPremiumForNoSalary;
      }

      // 産休・育休中でない場合のみチェック
      if (!stopping.isMaternityLeave && !stopping.isChildcareLeave) {
        const employeeId = employeeWithStandard.id || emp.id;
        //             employeeId,
        //             employeeWithStandardId: employeeWithStandard.id,
        //             empId: emp.id,
        //           }
        //         );
        if (employeeId) {
          await this.uncollectedPremiumService.saveUncollectedPremium(
            employeeId,
            year,
            month,
            totalSalary,
            employeeTotalPremium
          );
        }
      }

      return premiumRow;
    }
  }

  /**
   * 資格取得時決定の情報を追加
   */
  async addAcquisitionInfo(
    emp: Employee,
    year: number,
    salaryData: any,
    gradeTable: any[],
    monthlyPremiumRows: MonthlyPremiumRow[]
  ): Promise<void> {
    if (!emp) {
      return;
    }
    if (!emp.id) {
      return;
    }
    if (!emp.joinDate || !salaryData) {
      return;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      return;
    }
    if (!monthlyPremiumRows || !Array.isArray(monthlyPremiumRows)) {
      return;
    }

    const joinDate = new Date(emp.joinDate);
    if (isNaN(joinDate.getTime())) {
      return;
    }
    const joinYear = this.monthHelper.getPayYear(joinDate);
    const joinMonth = this.monthHelper.getPayMonth(joinDate);

    if (joinYear !== year) {
      return;
    }

    // 給与データをsalaries形式に変換
    const salaries: {
      [key: string]: { total: number; fixed: number; variable: number };
    } = {};
    if (!emp.id) {
      return;
    }
    for (let month = 1; month <= 12; month++) {
      const monthKey = this.salaryCalculationService.getSalaryKey(
        emp.id,
        month
      );
      const monthSalaryData = salaryData[monthKey];
      if (monthSalaryData) {
        salaries[monthKey] = {
          total: monthSalaryData.totalSalary ?? monthSalaryData.total ?? 0,
          fixed: monthSalaryData.fixedSalary ?? monthSalaryData.fixed ?? 0,
          variable:
            monthSalaryData.variableSalary ?? monthSalaryData.variable ?? 0,
        };
      }
    }

    // 資格取得時決定の情報を取得（現仕様ではEmployeeに保持しないため、その場計算のみ）
    let acquisitionGrade: number | null = null;
    let acquisitionStandard: number | null = null;
    let acquisitionMonth: number | null = null;
    let shikakuResult: ShikakuShutokuResult | null = null;

    shikakuResult = await this.salaryCalculationService.calculateShikakuShutoku(
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

    // UI表示用に設定
    if (acquisitionGrade && acquisitionStandard && acquisitionMonth) {
      const acquisitionRow = monthlyPremiumRows.find(
        (r) => r.month === acquisitionMonth
      );
      if (acquisitionRow) {
        acquisitionRow.isAcquisitionMonth = true;
        acquisitionRow.acquisitionGrade = acquisitionGrade;
        acquisitionRow.acquisitionStandard = acquisitionStandard;
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
