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
    private roomIdService: RoomIdService
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
    // 従業員データにcurrentStandardMonthlyRemunerationがない場合、salaryDataから定時決定を計算して取得
    // empのidが確実に含まれるようにする
    let employeeWithStandard = { ...emp };
    // idが確実に含まれるようにする
    if (!employeeWithStandard.id) {
      employeeWithStandard.id = emp.id;
    }

// // console.log(
//       `[徴収不能チェック] ${emp.name} (${year}年${month}月): employeeWithStandard.id=`,
//       employeeWithStandard.id,
//       `emp.id=`,
//       emp.id,
//       `standardMonthlyRemuneration=`,
//       employeeWithStandard.currentStandardMonthlyRemuneration
//     );

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
// // console.log(
//           `[徴収不能チェック] ${emp.name} (${year}年${month}月): 標準報酬履歴から標準報酬月額を取得: ${historyStandard}円（給与が0円でも保険料を計算）`
//         );
      } else {
        // 標準報酬履歴から取得できない場合、年度全体の給与データから定時決定を計算して標準報酬月額を取得
        // salaryDataが存在しない場合でも、給与データを取得して定時決定を計算する必要があります
        let dataToUse = salaryData;
        if (!dataToUse) {
          const roomId =
            (emp as any).roomId || this.roomIdService.requireRoomId();
          const yearMap: any = {};
          for (let m = 1; m <= 12; m++) {
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

// // console.log(
//             `[徴収不能チェック] ${emp.name} (${year}年${month}月): 定時決定を計算します`,
//             {
//               empSalariesCount: Object.keys(empSalaries).length,
//               empSalariesKeys: Object.keys(empSalaries),
//               currentMonthSalary: dataToUse[month.toString()],
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
// // console.log(
//               `[徴収不能チェック] ${emp.name} (${year}年${month}月): 定時決定から標準報酬月額を取得: ${teijiResult.standardMonthlyRemuneration}円（給与が0円でも保険料を計算）`
//             );
          } else {
// // console.log(
//               `[徴収不能チェック] ${emp.name} (${year}年${month}月): 定時決定の計算結果が取得できませんでした`,
//               {
//                 teijiResult,
//                 empSalariesCount: Object.keys(empSalaries).length,
//                 empSalaries: empSalaries,
//               }
//             );
          }
        } else {
// // console.log(
//             `[徴収不能チェック] ${emp.name} (${year}年${month}月): 給与データが取得できませんでした（年度全体の給与データから定時決定を計算できません）`
//           );
        }
      }
    } else if (
      employeeWithStandard.currentStandardMonthlyRemuneration &&
      employeeWithStandard.currentStandardMonthlyRemuneration > 0
    ) {
// // console.log(
//         `[徴収不能チェック] ${emp.name} (${year}年${month}月): 従業員データから標準報酬月額を取得: ${employeeWithStandard.currentStandardMonthlyRemuneration}円（給与が0円でも保険料を計算）`
//       );
    }

    // 給与データがある場合のみ通常の計算を実行
    // 重要：その月の給与が0円でも、標準報酬月額が確定していれば保険料を計算する必要があるため、
    // salaryDataが存在する場合でも、その月のデータが存在しない場合は給与0円として計算を実行
    // 標準報酬月額が確定していれば、salaryDataが存在しなくても保険料を計算する必要がある
    const monthKeyString = month.toString();
    const monthSalaryData = salaryData ? salaryData[monthKeyString] : undefined;

// // console.log(
//       `[徴収不能チェック] ${emp.name} (${year}年${month}月): salaryData存在チェック`,
//       {
//         salaryDataExists: !!salaryData,
//         monthSalaryDataExists: !!monthSalaryData,
//         monthSalaryData: monthSalaryData,
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
// // console.log(
//         `[徴収不能チェック] ${emp.name} (${year}年${month}月): calculateMonthlyPremiums呼び出し前`,
//         {
//           employeeWithStandardStandardMonthlyRemuneration:
//             employeeWithStandard.currentStandardMonthlyRemuneration,
//           fixedSalary,
//           variableSalary,
//           totalSalary: fixedSalary + variableSalary,
//         }
//       );
      const premiumResult =
        await this.salaryCalculationService.calculateMonthlyPremiums(
          employeeWithStandard, // 標準報酬月額を含む従業員データを使用
          year,
          month,
          fixedSalary,
          variableSalary,
          gradeTable
        );

// // console.log(
//         `[徴収不能チェック] ${emp.name} (${year}年${month}月): calculateMonthlyPremiums結果`,
//         {
//           health_employee: premiumResult.health_employee,
//           care_employee: premiumResult.care_employee,
//           pension_employee: premiumResult.pension_employee,
//           reasons: premiumResult.reasons,
//         }
//       );

      // MonthlyPremiumRow に変換
      const exempt = premiumResult.reasons.some(
        (r) => r.includes('産前産後休業') || r.includes('育児休業')
      );

      const ageForStopping = this.employeeLifecycleService.getAgeAtMonth(
        new Date(emp.birthDate),
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
      const totalSalary =
        monthSalaryData?.totalSalary ??
        monthSalaryData?.total ??
        fixedSalary + variableSalary;
      const employeeTotalPremium =
        premiumResult.health_employee +
        premiumResult.care_employee +
        premiumResult.pension_employee;

// // console.log(`[徴収不能チェック] ${emp.name} (${year}年${month}月):`, {
//         totalSalary,
//         employeeTotalPremium,
//         health_employee: premiumResult.health_employee,
//         care_employee: premiumResult.care_employee,
//         pension_employee: premiumResult.pension_employee,
//         exempt,
//         monthSalaryData: monthSalaryData
//           ? {
//               totalSalary: monthSalaryData.totalSalary,
//               total: monthSalaryData.total,
//               fixed: monthSalaryData.fixed,
//               variable: monthSalaryData.variable,
//             }
//           : null,
//         fixedSalary,
//         variableSalary,
//       });

      // 産休・育休中でない場合のみチェック
      if (!stopping.isMaternityLeave && !stopping.isChildcareLeave) {
        const employeeId = employeeWithStandard.id || emp.id;
// // console.log(
//           `[徴収不能チェック] ${emp.name} (${year}年${month}月): 産休・育休ではないためチェック実行`,
//           {
//             employeeId,
//             employeeWithStandardId: employeeWithStandard.id,
//             empId: emp.id,
//           }
//         );
        if (!employeeId) {
          console.error(
            `[徴収不能チェック] ${emp.name} (${year}年${month}月): employeeIdが取得できません`
          );
        } else {
          await this.uncollectedPremiumService.saveUncollectedPremium(
            employeeId,
            year,
            month,
            totalSalary,
            employeeTotalPremium
          );
        }
      } else {
// // console.log(
//           `[徴収不能チェック] ${emp.name} (${year}年${month}月): 産休・育休中のためスキップ`
//         );
      }

      return premiumRow;
    } else {
      // 給与データがなく、標準報酬月額も設定されていない場合
      // 年度全体の給与データから定時決定を計算して標準報酬月額を取得し、給与0円として保険料計算を実行
// // console.log(
//         `[徴収不能チェック] ${emp.name} (${year}年${month}月): 給与データなし、給与0円として保険料計算を実行`
//       );

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
// // console.log(
//               `[徴収不能チェック] ${emp.name} (${year}年${month}月): 給与データ取得後、定時決定から標準報酬月額を取得: ${teijiResult.standardMonthlyRemuneration}円`
//             );
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

      const stopping = this.premiumStoppingRuleService.applyStoppingRules(
        emp,
        year,
        month,
        this.employeeLifecycleService.getAgeAtMonth(
          new Date(emp.birthDate),
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

// // console.log(
//         `[徴収不能チェック] ${emp.name} (${year}年${month}月): 保険料計算結果`,
//         {
//           health_employee: premiumResult.health_employee,
//           care_employee: premiumResult.care_employee,
//           pension_employee: premiumResult.pension_employee,
//           reasons: premiumResult.reasons,
//         }
//       );

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
      const employeeTotalPremium =
        premiumResult.health_employee +
        premiumResult.care_employee +
        premiumResult.pension_employee;

// // console.log(
//         `[徴収不能チェック] ${emp.name} (${year}年${month}月): 給与データなしの場合`,
//         {
//           totalSalary,
//           employeeTotalPremium,
//           isExempt: stopping.isMaternityLeave || stopping.isChildcareLeave,
//         }
//       );

      // 産休・育休中でない場合のみチェック
      if (!stopping.isMaternityLeave && !stopping.isChildcareLeave) {
        const employeeId = employeeWithStandard.id || emp.id;
// // console.log(
//           `[徴収不能チェック] ${emp.name} (${year}年${month}月): 産休・育休ではないためチェック実行（給与データなし）`,
//           {
//             employeeId,
//             employeeWithStandardId: employeeWithStandard.id,
//             empId: emp.id,
//           }
//         );
        if (!employeeId) {
          console.error(
            `[徴収不能チェック] ${emp.name} (${year}年${month}月): employeeIdが取得できません（給与データなし）`
          );
        } else {
          await this.uncollectedPremiumService.saveUncollectedPremium(
            employeeId,
            year,
            month,
            totalSalary,
            employeeTotalPremium
          );
        }
      } else {
// // console.log(
//           `[徴収不能チェック] ${emp.name} (${year}年${month}月): 産休・育休中のためスキップ（給与データなし）`
//         );
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
    if (!emp.joinDate || !salaryData) {
      return;
    }

    const joinDate = new Date(emp.joinDate);
    const joinYear = this.monthHelper.getPayYear(joinDate);
    const joinMonth = this.monthHelper.getPayMonth(joinDate);

    if (joinYear !== year) {
      return;
    }

    // 給与データをsalaries形式に変換
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
