import { Injectable } from '@angular/core';
import { MonthlySalaryService } from './monthly-salary.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { RoomIdService } from './room-id.service';
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

/**
 * 年間警告の収集ロジックを担当するサービス
 * 退職月の保険料、年齢停止、産休・育休、データ欠損などの警告を収集
 */
@Injectable({ providedIn: 'root' })
export class AnnualWarningService {
  constructor(
    private monthlySalaryService: MonthlySalaryService,
    private salaryCalculationService: SalaryCalculationService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 年間警告を収集する
   */
  async collectAnnualWarnings(
    employees: Employee[],
    bonuses: Bonus[],
    year: number,
    monthlyPremiumsByEmployee: {
      [employeeId: string]: MonthlyPremiumRow[];
    },
    salaryDataByEmployeeId?: { [employeeId: string]: any }
  ): Promise<string[]> {
    const warnings: string[] = [];
    const warningSet = new Set<string>(); // 重複排除用

    // 年齢キャッシュを事前計算（全従業員の1〜12月の年齢をキャッシュ）
    const ageCacheByEmployee: {
      [employeeId: string]: { [month: number]: number };
    } = {};
    for (const emp of employees) {
      const birthDate = new Date(emp.birthDate);
      ageCacheByEmployee[emp.id] = {};
      for (let m = 1; m <= 12; m++) {
        ageCacheByEmployee[emp.id][m] =
          this.employeeLifecycleService.getAgeAtMonth(birthDate, year, m);
      }
    }

    // 従業員ごとのチェックを1回のループに統合
    for (const emp of employees) {
      const ageCache = ageCacheByEmployee[emp.id];
      const employeeRows = monthlyPremiumsByEmployee[emp.id];
      let salaryData = salaryDataByEmployeeId?.[emp.id];
      if (!salaryData) {
        const roomId = this.roomIdService.requireRoomId();
        const monthMap: any = {};
        for (let m = 1; m <= 12; m++) {
          const monthData = await this.monthlySalaryService
            .getEmployeeSalary(roomId, emp.id, year, m)
            .catch(() => null);
          if (monthData) {
            monthMap[m.toString()] = monthData;
          }
        }
        salaryData = monthMap;
      }

      // 優先度A-1: 退職月なのに保険料が発生している月
      if (emp.retireDate) {
        const retireDate = new Date(emp.retireDate);
        const retireYear = retireDate.getFullYear();
        const retireMonth = retireDate.getMonth() + 1;

        if (retireYear === year && employeeRows) {
          const retireRow = employeeRows.find((r) => r.month === retireMonth);
          if (retireRow) {
            const totalEmployee =
              retireRow.healthEmployee +
              retireRow.careEmployee +
              retireRow.pensionEmployee;
            const totalEmployer =
              retireRow.healthEmployer +
              retireRow.careEmployer +
              retireRow.pensionEmployer;
            const total = totalEmployee + totalEmployer;

            if (total > 0) {
              const msg = `従業員「${emp.name}」の退職月（${retireMonth}月）に保険料が発生しています。資格喪失月の取り扱いを確認してください。`;
              if (!warningSet.has(msg)) {
                warningSet.add(msg);
                warnings.push(msg);
              }
            }
          }
        }
      }

      // 優先度A-2: 70歳・75歳到達後も保険料が発生しているケース
      // 優先度A-3: 産休・育休中なのに本人負担が残っているケース
      if (employeeRows) {
        for (const row of employeeRows) {
          const age = ageCache[row.month];

          // 70歳以上なのに厚生年金保険料が発生
          if (
            age >= 70 &&
            (row.pensionEmployee > 0 || row.pensionEmployer > 0)
          ) {
            const msg = `従業員「${emp.name}」は70歳以上ですが、${row.month}月の厚生年金保険料が発生しています。`;
            if (!warningSet.has(msg)) {
              warningSet.add(msg);
              warnings.push(msg);
            }
          }

          // 75歳以上なのに健康保険・介護保険料が発生
          if (
            age >= 75 &&
            (row.healthEmployee > 0 ||
              row.healthEmployer > 0 ||
              row.careEmployee > 0 ||
              row.careEmployer > 0)
          ) {
            const msg = `従業員「${emp.name}」は75歳以上ですが、${row.month}月の健康保険・介護保険料が発生しています。`;
            if (!warningSet.has(msg)) {
              warningSet.add(msg);
              warnings.push(msg);
            }
          }

          // 産休・育休中なのに本人負担が残っているケース
          const month = row.month;
          const maternityLeave = this.employeeLifecycleService.isMaternityLeave(
            emp,
            year,
            month
          );
          const childcareLeave = this.employeeLifecycleService.isChildcareLeave(
            emp,
            year,
            month
          );

          if (maternityLeave || childcareLeave) {
            const totalEmployee =
              row.healthEmployee + row.careEmployee + row.pensionEmployee;

            if (totalEmployee > 0) {
              const leaveType = maternityLeave ? '産休' : '育休';
              const msg = `従業員「${emp.name}」の${month}月は${leaveType}中ですが、本人負担分の保険料が残っています。`;
              if (!warningSet.has(msg)) {
                warningSet.add(msg);
                warnings.push(msg);
              }
            }
          }
        }
      }

      // 1. 4月〜6月の固定+非固定 ≠ 総支給 の不一致警告（算定基礎届）
      // 6. データ欠損（月の給与データなし）
      // 7. 不正な月（負の金額など）の入力
      if (salaryData) {
        const missingMonths: number[] = [];

        for (let month = 1; month <= 12; month++) {
          // getEmployeeSalaryは { "4": {...}, "5": {...} } 形式を返す
          const monthKeyString = month.toString(); // "4", "5", "6" など
          const monthSalaryData = salaryData[monthKeyString];

          // 産休・育休中の月は給与データがなくても正常なので、データ欠損チェックから除外
          const maternityLeave = this.employeeLifecycleService.isMaternityLeave(
            emp,
            year,
            month
          );
          const childcareLeave = this.employeeLifecycleService.isChildcareLeave(
            emp,
            year,
            month
          );

          // データ欠損チェック（産休・育休中は除外）
          if (!monthSalaryData && !maternityLeave && !childcareLeave) {
            missingMonths.push(month);
            continue;
          }

          // 産休・育休中の場合は給与データチェックをスキップ
          if (maternityLeave || childcareLeave) {
            continue;
          }

          // 4-6月の不一致警告
          if (month >= 4 && month <= 6) {
            const fixed =
              monthSalaryData.fixedTotal ?? monthSalaryData.fixed ?? 0;
            const variable =
              monthSalaryData.variableTotal ?? monthSalaryData.variable ?? 0;
            const total = monthSalaryData.total ?? 0;
            const expectedTotal = fixed + variable;

            if (Math.abs(total - expectedTotal) > 1) {
              // 1円以上の誤差
              const msg = `${
                emp.name
              }の${month}月：固定+非固定(${expectedTotal.toLocaleString()}円) ≠ 総支給(${total.toLocaleString()}円)`;
              if (!warningSet.has(msg)) {
                warningSet.add(msg);
                warnings.push(msg);
              }
            }
          }

          // 負の金額チェック
          const fixed =
            monthSalaryData.fixedTotal ?? monthSalaryData.fixed ?? 0;
          const variable =
            monthSalaryData.variableTotal ?? monthSalaryData.variable ?? 0;
          const total = monthSalaryData.total ?? 0;

          if (fixed < 0 || variable < 0 || total < 0) {
            const msg = `従業員「${emp.name}」の${month}月：負の金額が入力されています`;
            if (!warningSet.has(msg)) {
              warningSet.add(msg);
              warnings.push(msg);
            }
          }
        }

        // データ欠損警告の出力
        if (missingMonths.length > 0) {
          // 4〜6月の欠損チェック
          const missingAprToJun = missingMonths.filter((m) => m >= 4 && m <= 6);
          if (missingAprToJun.length > 0) {
            const msg = `従業員「${emp.name}」の4〜6月のいずれかに給与データがなく、定時決定（算定基礎）の判定が困難です。`;
            if (!warningSet.has(msg)) {
              warningSet.add(msg);
              warnings.push(msg);
            }
          }

          const msg = `従業員「${emp.name}」の${missingMonths.join(
            ','
          )}月に給与データが登録されていません。`;
          if (!warningSet.has(msg)) {
            warningSet.add(msg);
            warnings.push(msg);
          }
        }
      } else {
        // salaryDataがnullの場合もデータ欠損として扱う
        const msg = `従業員「${emp.name}」の給与データが取得できませんでした。`;
        if (!warningSet.has(msg)) {
          warningSet.add(msg);
          warnings.push(msg);
        }
      }
    }

    // 2. 退職月の賞与支給 → エラー
    for (const bonus of bonuses) {
      const bonusEmployee = employees.find((e) => e.id === bonus.employeeId);
      if (bonusEmployee && bonusEmployee.retireDate) {
        const retireDate = new Date(bonusEmployee.retireDate);
        const retireYear = retireDate.getFullYear();
        const retireMonth = retireDate.getMonth() + 1;

        if (retireYear === year && retireMonth === bonus.month) {
          const msg = `${bonusEmployee.name}：退職月(${bonus.month}月)に賞与が支給されています`;
          if (!warningSet.has(msg)) {
            warningSet.add(msg);
            warnings.push(msg);
          }
        }
      }
    }

    // 3. 賞与の上限エラー（150万/573万）
    const bonusTotalsByEmployee: {
      [employeeId: string]: { healthCare: number; pension: number };
    } = {};
    for (const bonus of bonuses) {
      if (!bonusTotalsByEmployee[bonus.employeeId]) {
        bonusTotalsByEmployee[bonus.employeeId] = { healthCare: 0, pension: 0 };
      }

      const standardBonus =
        bonus.standardBonusAmount ??
        Math.floor((bonus.amount || 0) / 1000) * 1000;
      const cappedHealth = bonus.cappedBonusHealth ?? standardBonus;
      const cappedPension =
        bonus.cappedBonusPension ?? Math.min(standardBonus, 1500000);

      bonusTotalsByEmployee[bonus.employeeId].healthCare += cappedHealth;
      bonusTotalsByEmployee[bonus.employeeId].pension += cappedPension;
    }

    for (const employeeId in bonusTotalsByEmployee) {
      const emp = employees.find((e) => e.id === employeeId);
      const totals = bonusTotalsByEmployee[employeeId];

      if (totals.healthCare > 5730000) {
        const msg = `従業員「${
          emp?.name || employeeId
        }」の年度累計賞与額が健保・介保の上限（573万円）を超えています。`;
        if (!warningSet.has(msg)) {
          warningSet.add(msg);
          warnings.push(msg);
        }
      }
      if (totals.pension > 1500000) {
        const msg = `従業員「${
          emp?.name || employeeId
        }」の賞与が厚生年金の上限額（1回150万円）を超えています。`;
        if (!warningSet.has(msg)) {
          warningSet.add(msg);
          warnings.push(msg);
        }
      }
    }

    // 5. 随時改定候補（suijiAlerts）がある場合
    // 注：随時改定候補は monthly-change-alert-page で管理されているため、
    // ここでは簡易的にチェック（実際の実装に応じて調整が必要）
    // 必要に応じて SuijiService を注入して loadAlerts を呼び出す

    return warnings;
  }
}
