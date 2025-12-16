import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { ExemptionDeterminationService } from './exemption-determination.service';
import { GradeDeterminationService } from './grade-determination.service';
import { SalaryAggregationService } from './salary-aggregation.service';
import { MonthHelperService } from './month-helper.service';
import { SettingsService } from './settings.service';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { EmployeeEligibilityService } from './employee-eligibility.service';
import { EmployeeWorkCategoryService } from './employee-work-category.service';
import { SuijiService } from './suiji.service';
import { SuijiKouhoResult } from './salary-calculation.service';

export interface MonthlyPremiums {
  health_employee: number;
  health_employer: number;
  care_employee: number;
  care_employer: number;
  pension_employee: number;
  pension_employer: number;
}

@Injectable({ providedIn: 'root' })
export class PremiumCalculationService {
  constructor(
    private exemptionDeterminationService: ExemptionDeterminationService,
    private gradeDeterminationService: GradeDeterminationService,
    private salaryAggregationService: SalaryAggregationService,
    private monthHelper: MonthHelperService,
    private settingsService: SettingsService,
    private employeeLifecycleService: EmployeeLifecycleService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService,
    private suijiService: SuijiService
  ) {}

  /**
   * 月次給与の保険料を計算（産休・育休免除・年齢到達・標準報酬月額を統合）
   * @param employee 従業員情報
   * @param year 年
   * @param month 月（1〜12）
   * @param fixedSalary 固定的賃金
   * @param variableSalary 非固定的賃金
   * @param gradeTable 標準報酬月額テーブル
   * @param suijiAlerts 随時改定アラート（オプション）
   * @returns 月次保険料
   */
  async calculateMonthlyPremiumsCore(
    employee: Employee,
    year: number,
    month: number,
    fixedSalary: number,
    variableSalary: number,
    gradeTable: any[],
    suijiAlerts?: SuijiKouhoResult[]
  ): Promise<MonthlyPremiums & { reasons: string[] }> {
    const reasons: string[] = [];

    // ① 退職月の次の月以降の判定（最優先）
    // 退職日が属する月の次の月以降は全保険料を0円にする
    if (employee.retireDate) {
      const retireDate = new Date(employee.retireDate);
      const retireYear = retireDate.getFullYear();
      const retireMonth = retireDate.getMonth() + 1;

      // 退職日が属する月の次の月以降を判定
      const targetMonthKey = year * 12 + (month - 1);
      const retireMonthKey = retireYear * 12 + (retireMonth - 1);

      // 退職月の次の月以降（退職月より後）は全保険料0円
      if (targetMonthKey > retireMonthKey) {
        reasons.push(`${month}月は退職月の次の月以降のため、全保険料は0円です`);
        return {
          health_employee: 0,
          health_employer: 0,
          care_employee: 0,
          care_employer: 0,
          pension_employee: 0,
          pension_employer: 0,
          reasons,
        };
      }
    }

    // ② 月末在籍の健保判定
    const isLastDayEligible = this.employeeLifecycleService.isLastDayEligible(
      employee,
      year,
      month
    );

    if (!isLastDayEligible) {
      // 月末在籍がない場合、健康保険・介護保険の保険料は0円
      reasons.push(
        `${month}月は退職月で月末在籍がないため、健康保険・介護保険の保険料は0円です`
      );
      // 厚生年金は月単位加入のため、退職月でも月末在籍がなくても発生する可能性があるが、
      // ここでは健康保険・介護保険のみ0円とする
      // 厚生年金の処理は後続のロジックで処理される
    }

    // 勤務区分（社会保険非加入かどうか）
    const isNonInsured =
      this.employeeWorkCategoryService.isNonInsured(employee);

    // ② 産休・育休免除判定（月単位：1日でも含まれれば免除）
    // フルタイムのみ産休を取得可能
    const isMaternityLeavePeriod =
      this.employeeLifecycleService.isMaternityLeave(employee, year, month);
    const isChildcareLeavePeriod =
      this.employeeLifecycleService.isChildcareLeave(employee, year, month);
    const canTakeMaternityLeave =
      this.employeeWorkCategoryService.canTakeMaternityLeave(employee);
    const isExemptFromPremiums =
      this.employeeWorkCategoryService.isExemptFromPremiumsDuringMaternityLeave(
        employee
      );

    // 産休期間中で、かつフルタイムの場合のみ免除
    const isMaternityLeave =
      isMaternityLeavePeriod && canTakeMaternityLeave && isExemptFromPremiums;
    // 育休期間中で、かつ保険加入者の場合のみ免除
    const isChildcareLeave = isChildcareLeavePeriod && isExemptFromPremiums;
    const isExempt = isMaternityLeave || isChildcareLeave;

    if (isExempt) {
      // 産休・育休中は本人分・事業主負担ともに0円
      const reason = isMaternityLeave
        ? '産前産後休業中（健康保険・厚生年金本人分免除）'
        : '育児休業中（健康保険・厚生年金本人分免除）';
      reasons.push(reason);
      return {
        health_employee: 0,
        health_employer: 0,
        care_employee: 0,
        care_employer: 0,
        pension_employee: 0,
        pension_employer: 0,
        reasons,
      };
    }

    // 保険未加入者の場合、産休・育休期間中でも保険料は0円（免除の概念がない）
    if (
      (isMaternityLeavePeriod || isChildcareLeavePeriod) &&
      this.employeeWorkCategoryService.isNonInsured(employee)
    ) {
      reasons.push('保険未加入者のため、産休・育休期間中でも社会保険料は0円');
      return {
        health_employee: 0,
        health_employer: 0,
        care_employee: 0,
        care_employer: 0,
        pension_employee: 0,
        pension_employer: 0,
        reasons,
      };
    }

    // 勤務区分が社会保険未加入の場合は全保険料を0円にする
    if (isNonInsured) {
      reasons.push('勤務区分が「社会保険未加入」のため保険料は0円');
      return {
        health_employee: 0,
        health_employer: 0,
        care_employee: 0,
        care_employer: 0,
        pension_employee: 0,
        pension_employer: 0,
        reasons,
      };
    }

    // ② 標準報酬月額の取得
    // 優先順位：
    // 1. 随時改定で確定した標準報酬月額（適用開始月以降）
    // 2. 従業員データの標準報酬月額（定時決定で確定したもの）
    // 3. 資格取得時決定の標準報酬月額
    // 4. その月の給与額から等級を判定（標準報酬月額が確定していない場合のみ）
    //
    // 重要：標準報酬月額が確定している場合（1-3のいずれかで確定）は、
    // その月の給与が0円でも標準報酬月額に基づいて保険料を計算する必要がある。
    // 給与が0円でも保険料は発生する（標準報酬月額に基づく）。

    const totalSalary = fixedSalary + variableSalary;

    // 随時改定の適用開始月をチェック
    let appliedSuiji: SuijiKouhoResult | null = null;
    if (suijiAlerts && suijiAlerts.length > 0) {
      // 該当従業員の随時改定を検索
      const employeeSuiji = suijiAlerts.filter(
        (alert) => alert.employeeId === employee.id && alert.isEligible
      );

      // 適用開始月が現在の月以降のものを検索（最も早い適用開始月）
      const applicableSuiji = employeeSuiji
        .filter((alert) => {
          // 適用開始月の判定（変動月+3ヶ月後、変動月が1か月目として4か月目が適用開始）
          const applyStartMonth = alert.applyStartMonth;
          // 適用開始月が現在の月以降の場合に適用
          return applyStartMonth <= month;
        })
        .sort((a, b) => {
          // 適用開始月が早い順にソート
          return a.applyStartMonth - b.applyStartMonth;
        });

      if (applicableSuiji.length > 0) {
        appliedSuiji = applicableSuiji[0];
      }
    }

    // 標準報酬月額の取得
    let gradeResult: { grade: number; remuneration: number } | null = null;
    let standardMonthlyRemuneration: number | null = null;

    // 1. 随時改定が適用されている場合は新しい等級を使用
    if (appliedSuiji) {
      const newGradeRow = gradeTable.find(
        (r: any) => r.rank === appliedSuiji!.newGrade
      );
      if (newGradeRow && newGradeRow.standard) {
        const suijiStandard = newGradeRow.standard;
        gradeResult = {
          grade: appliedSuiji.newGrade,
          remuneration: suijiStandard,
        };
        standardMonthlyRemuneration = suijiStandard;
        reasons.push(
          `随時改定適用（変動月: ${appliedSuiji.changeMonth}月、適用開始: ${
            appliedSuiji.applyStartMonth
          }月）により等級${
            appliedSuiji.newGrade
          }（標準報酬月額${suijiStandard.toLocaleString()}円）を使用`
        );
      }
    }

    // 2. 随時改定が適用されていない場合、従業員データの標準報酬月額を確認
    if (
      !standardMonthlyRemuneration &&
      employee.currentStandardMonthlyRemuneration &&
      employee.currentStandardMonthlyRemuneration > 0
    ) {
      // 定時決定で確定した標準報酬月額を使用
      const teijiStandard = employee.currentStandardMonthlyRemuneration;
      standardMonthlyRemuneration = teijiStandard;
      // 標準報酬月額から等級を逆引き
      gradeResult = this.gradeDeterminationService.findGrade(
        gradeTable,
        teijiStandard
      );
      if (gradeResult) {
        reasons.push(
          `定時決定で確定した標準報酬月額（等級${
            gradeResult.grade
          }、${teijiStandard.toLocaleString()}円）を使用`
        );
      } else {
        // 等級が見つからない場合は標準報酬月額のみを使用
        reasons.push(
          `定時決定で確定した標準報酬月額（${teijiStandard.toLocaleString()}円）を使用（等級テーブルに該当なし）`
        );
      }
    }

    // 3. 標準報酬月額が確定していない場合、その月の給与額から等級を判定
    // 重要：標準報酬月額は算定基礎届（定時決定）や随時改定で決定されるため、
    // その月の給与から毎月計算するものではありません。
    // しかし、標準報酬月額が確定していない場合（新規入社など）は、
    // その月の給与から一時的に等級を判定して標準報酬月額を取得します。
    if (!standardMonthlyRemuneration) {
      const totalSalary = fixedSalary + variableSalary;
      if (totalSalary > 0 && gradeTable.length > 0) {
        const gradeResult = this.gradeDeterminationService.findGrade(
          gradeTable,
          totalSalary
        );
        if (gradeResult) {
          standardMonthlyRemuneration = gradeResult.remuneration;
          reasons.push(
            `その月の給与（${totalSalary.toLocaleString()}円）から等級${
              gradeResult.grade
            }（標準報酬月額${gradeResult.remuneration.toLocaleString()}円）を一時的に使用（標準報酬月額が確定していないため）`
          );
        } else {
          reasons.push(
            '標準報酬月額が確定していません（年度全体の給与データから定時決定を計算して標準報酬月額を取得する必要があります）'
          );
        }
      } else {
        reasons.push(
          '標準報酬月額が確定していません（年度全体の給与データから定時決定を計算して標準報酬月額を取得する必要があります）'
        );
      }
    }

    // standardMonthlyRemunerationが確定していることを確認
    // 重要：標準報酬月額は算定基礎届（定時決定）や随時改定で決定されるため、
    // その月の給与が0円でも標準報酬月額に基づいて保険料を計算する必要があります。
    // 標準報酬月額が取得できない場合は、monthly-premium-calculation.service.ts で
    // 年度全体の給与データから定時決定を計算して標準報酬月額を取得しているはずです。
    // そのため、ここで早期リターンしないようにします。
    if (!standardMonthlyRemuneration || standardMonthlyRemuneration <= 0) {
      // 標準報酬月額が取得できない場合でも、その月の給与が0円の場合は
      // monthly-premium-calculation.service.ts で年度全体の給与データから定時決定を計算して標準報酬月額を取得しているはずです。
      // そのため、ここで早期リターンしないようにします。
      reasons.push(
        '標準報酬月額が取得できません（年度全体の給与データから定時決定を計算して標準報酬月額を取得する必要があります）'
      );
      // 早期リターンしない（monthly-premium-calculation.service.ts で標準報酬月額を取得しているはず）
      // ただし、標準報酬月額が取得できない場合は保険料を0円とする
      return {
        health_employee: 0,
        health_employer: 0,
        care_employee: 0,
        care_employer: 0,
        pension_employee: 0,
        pension_employer: 0,
        reasons,
      };
    }

    // ③ 資格取得月の判定（同月得喪）
    let isAcquisitionMonth = false;
    let isAcquisitionMonthForPension = false;
    // yearを数値に変換（文字列の場合があるため）
    const yearNumForAcquisition =
      typeof year === 'string' ? parseInt(year, 10) : year;
    if (employee.joinDate) {
      const joinDate = new Date(employee.joinDate);
      const joinYear = this.monthHelper.getPayYear(joinDate);
      const joinMonth = this.monthHelper.getPayMonth(joinDate);

      // 健康保険：資格取得月から保険料発生
      if (joinYear === yearNumForAcquisition && joinMonth === month) {
        isAcquisitionMonth = true;
        reasons.push(
          `${month}月は資格取得月のため健康保険・介護保険の保険料が発生します`
        );
      }

      // 厚生年金：資格取得月の翌月から保険料発生
      if (joinYear === yearNumForAcquisition && joinMonth === month - 1) {
        isAcquisitionMonthForPension = true;
        reasons.push(
          `${month}月は資格取得月の翌月のため厚生年金の保険料が発生します`
        );
      } else if (joinYear === yearNumForAcquisition && joinMonth === month) {
        reasons.push(
          `${month}月は資格取得月のため厚生年金の保険料は発生しません（翌月から発生）`
        );
      }
    }

    // ④ 年齢到達のチェック（40/65/70/75）
    // 年齢到達月の判定：誕生日の月で判定（到達月から適用）
    const birthDate = new Date(employee.birthDate);
    const birthYear = birthDate.getFullYear();
    const birthMonth = birthDate.getMonth() + 1;

    // その月の1日時点の年齢を計算（到達月の判定用）
    const checkDate = new Date(year, month - 1, 1);
    let age = year - birthYear;
    if (
      month < birthMonth ||
      (month === birthMonth && 1 < birthDate.getDate())
    ) {
      age--;
    }

    // 年齢到達月の判定（到達月から適用）
    // 40歳到達月：介護保険料徴収開始（到達月から）
    // 65歳到達月：介護保険料徴収終了（到達月から第1号へ移行）
    // 70歳到達月：厚生年金保険料徴収停止（到達月から）
    // 75歳到達月：健康保険・介護保険料徴収停止（到達月から）
    const isAge40Reached = age >= 40;
    const isAge65Reached = age >= 65;
    const isAge70Reached = age >= 70;
    const isAge75Reached = age >= 75;

    // 到達月の判定（誕生日の月・日で判定）
    // 40歳到達月の判定（誕生日の前日が属する月から）
    // 8/1生まれ → 40歳の誕生日は8/1、前日は7/31 → 7月から発生
    // 8/2生まれ → 40歳の誕生日は8/2、前日は8/1 → 8月から発生
    const birthDay = birthDate.getDate();
    let isAge40Month: boolean;
    if (birthDay === 1) {
      // 誕生日が月の1日の場合、前月から発生
      if (birthMonth === 1) {
        // 1月1日生まれの場合、前年12月から発生
        isAge40Month =
          (year === birthYear + 39 && month === 12) ||
          (year === birthYear + 40 && month >= birthMonth) ||
          year > birthYear + 40;
      } else {
        // 2月以降の場合、前月から発生
        isAge40Month =
          (year === birthYear + 40 && month >= birthMonth - 1) ||
          year > birthYear + 40;
      }
    } else {
      // 誕生日が月の2日以降の場合、誕生月から発生
      isAge40Month =
        (year === birthYear + 40 && month >= birthMonth) ||
        year > birthYear + 40;
    }
    // 65歳到達月の判定（誕生日の前日が属する月から）
    // 8/1生まれ → 65歳の誕生日は8/1、前日は7/31 → 7月から終了
    // 8/2生まれ → 65歳の誕生日は8/2、前日は8/1 → 8月から終了
    let isAge65Month: boolean;
    if (birthDay === 1) {
      // 誕生日が月の1日の場合、前月から終了
      if (birthMonth === 1) {
        // 1月1日生まれの場合、前年12月から終了
        isAge65Month =
          (year === birthYear + 64 && month === 12) ||
          (year === birthYear + 65 && month >= birthMonth) ||
          year > birthYear + 65;
      } else {
        // 2月以降の場合、前月から終了
        isAge65Month =
          (year === birthYear + 65 && month >= birthMonth - 1) ||
          year > birthYear + 65;
      }
    } else {
      // 誕生日が月の2日以降の場合、誕生月から終了
      isAge65Month =
        (year === birthYear + 65 && month >= birthMonth) ||
        year > birthYear + 65;
    }
    // 70歳到達月の判定（誕生日の前日が属する月から）
    // 3/1生まれ → 70歳の誕生日は3/1、前日は2/28 → 2月から終了
    // 3/2生まれ → 70歳の誕生日は3/2、前日は3/1 → 3月から終了
    let isAge70Month: boolean;
    if (birthDay === 1) {
      // 誕生日が月の1日の場合、前月から終了
      if (birthMonth === 1) {
        // 1月1日生まれの場合、前年12月から終了
        isAge70Month =
          (year === birthYear + 69 && month === 12) ||
          (year === birthYear + 70 && month >= birthMonth) ||
          year > birthYear + 70;
      } else {
        // 2月以降の場合、前月から終了
        isAge70Month =
          (year === birthYear + 70 && month >= birthMonth - 1) ||
          year > birthYear + 70;
      }
    } else {
      // 誕生日が月の2日以降の場合、誕生月から終了
      isAge70Month =
        (year === birthYear + 70 && month >= birthMonth) ||
        year > birthYear + 70;
    }
    // 75歳到達月の判定（誕生日が属する月から）
    // 3/1に75歳になる → 3月から健康保険ゼロ。2月は健康保険あり
    // 3/2に75歳になる → 3月から健康保険ゼロ。2月は健康保険あり
    const isAge75Month =
      (year === birthYear + 75 && month >= birthMonth) || year > birthYear + 75;

    const eligibilityResult = this.employeeEligibilityService.checkEligibility(
      employee,
      checkDate
    );
    const ageFlags = eligibilityResult.ageFlags;

    // 年齢到達による停止理由を追加
    if (isAge75Reached) {
      if (isAge75Month && month === birthMonth) {
        reasons.push(
          `${month}月は75歳到達月のため健康保険・介護保険は停止（到達月から適用）`
        );
      } else {
        reasons.push('75歳以上のため健康保険・介護保険は停止');
      }
    }
    if (isAge70Reached) {
      if (isAge70Month) {
        reasons.push(
          `${month}月は70歳到達月のため厚生年金は停止（到達月から適用）`
        );
      } else {
        reasons.push('70歳以上のため厚生年金は停止');
      }
    }
    // 介護保険区分の判定（Service統一ロジックを使用）
    const careType = this.exemptionDeterminationService.getCareInsuranceType(
      employee.birthDate,
      year,
      month
    );
    if (careType === 'type1') {
      // 65歳到達月の判定（誕生日の前日が属する月から）
      // 8/1生まれ → 7月から終了、8/2生まれ → 8月から終了
      if (isAge65Month) {
        reasons.push(
          `${month}月は65歳到達月のため介護保険は第1号被保険者（健保から除外、到達月から適用）`
        );
      } else {
        reasons.push('65歳以上のため介護保険は第1号被保険者（健保から除外）');
      }
    } else if (careType === 'type2') {
      if (isAge40Month && month === birthMonth) {
        reasons.push(
          `${month}月は40歳到達月のため介護保険料が発生します（到達月から適用）`
        );
      }
    }

    // ⑤ 通常の保険料計算（年齢到達・同月得喪を考慮）
    const prefecture = (employee as any).prefecture || 'tokyo';
    const ratesResult = await this.settingsService.getRates(
      year.toString(),
      prefecture,
      month.toString()
    );
    if (!ratesResult) {
      reasons.push(
        `保険料率の取得に失敗しました（年度: ${year}, 都道府県: ${prefecture}, 月: ${month}）。設定画面で料率を設定してください。`
      );
      return {
        health_employee: 0,
        health_employer: 0,
        care_employee: 0,
        care_employer: 0,
        pension_employee: 0,
        pension_employer: 0,
        reasons,
      };
    }
    const r = ratesResult;

    // 健康保険（75歳以上は0円、資格取得月から発生、月末在籍が必要）
    // 資格取得月より前の場合は0円、資格取得月以降は標準報酬月額を使用
    // 月末在籍がない場合は0円
    let healthBase = 0;
    let joinYear: number | null = null;
    let joinMonth: number | null = null;
    if (!isLastDayEligible) {
      // 月末在籍がない場合は0円
      healthBase = 0;
    } else if (employee.joinDate) {
      const joinDate = new Date(employee.joinDate);
      joinYear = this.monthHelper.getPayYear(joinDate);
      joinMonth = this.monthHelper.getPayMonth(joinDate);
      // yearを数値に変換（文字列の場合があるため）
      const yearNum = typeof year === 'string' ? parseInt(year, 10) : year;
      // 資格取得月以降の場合のみ標準報酬月額を使用
      if (joinYear < yearNum || (joinYear === yearNum && joinMonth <= month)) {
        healthBase = ageFlags.isNoHealth ? 0 : standardMonthlyRemuneration;
      }
    } else {
      // 入社日が未設定の場合は通常通り計算
      healthBase = ageFlags.isNoHealth ? 0 : standardMonthlyRemuneration;
    }
    // 介護保険（Service統一ロジックを使用）
    // careTypeは既に1330行目で宣言済み
    const isCareApplicable = careType === 'type2';
    let careBase = 0;
    // yearを数値に変換（文字列の場合があるため）
    const yearNum = typeof year === 'string' ? parseInt(year, 10) : year;
    if (!isLastDayEligible) {
      // 月末在籍がない場合は0円
      careBase = 0;
    } else if (isCareApplicable) {
      if (employee.joinDate) {
        const joinDate = new Date(employee.joinDate);
        const joinYear = this.monthHelper.getPayYear(joinDate);
        const joinMonth = this.monthHelper.getPayMonth(joinDate);
        // 資格取得月以降の場合のみ標準報酬月額を使用
        if (
          joinYear < yearNum ||
          (joinYear === yearNum && joinMonth <= month)
        ) {
          careBase = standardMonthlyRemuneration;
        }
      } else {
        // 入社日が未設定の場合は通常通り計算
        careBase = standardMonthlyRemuneration;
      }
    }

    // 健康保険の計算方法変更：
    // 介護保険に加入していない場合：標準報酬月額×健保保険料率
    // 介護保険に加入している場合（40歳～64歳）：標準報酬月額×（健康保険料率＋介護保険料率）
    // 50銭未満切り捨て、50銭超切り上げ
    const healthRateEmployee =
      isCareApplicable && careBase > 0
        ? r.health_employee + r.care_employee
        : r.health_employee;
    const healthRateEmployer =
      isCareApplicable && careBase > 0
        ? r.health_employer + r.care_employer
        : r.health_employer;

    // 健康保険：総額を計算 → 折半 → それぞれ50銭ルールで丸める
    const healthTotal = healthBase * (healthRateEmployee + healthRateEmployer);
    const healthHalf = healthTotal / 2;
    const health_employee = this.roundWith50SenRule(healthHalf);
    const health_employer = this.roundWith50SenRule(healthHalf);

    // 介護保険は健康保険に含まれるため、個別の値は0とする（後方互換性のため残す）
    const care_employee = 0;
    const care_employer = 0;

    // 厚生年金（70歳以上は0円）も月末在籍ルールに合わせる
    // 同月得喪でも月末在籍があれば当月発生させる
    let pensionBase = 0;
    const yearNumForPension =
      typeof year === 'string' ? parseInt(year, 10) : year;

    if (!isLastDayEligible) {
      // 月末在籍なし → 厚生年金も0円
      pensionBase = 0;
    } else if (employee.joinDate) {
      const joinDate = new Date(employee.joinDate);
      const joinYear = this.monthHelper.getPayYear(joinDate);
      const joinMonth = this.monthHelper.getPayMonth(joinDate);

      // 資格取得月以降（同月得喪も含む）であれば発生させる
      if (
        joinYear < yearNumForPension ||
        (joinYear === yearNumForPension && joinMonth <= month)
      ) {
        if (ageFlags.isNoPension) {
          pensionBase = 0;
        } else {
          pensionBase = this.adjustPensionStandardMonthlyRemuneration(
            standardMonthlyRemuneration
          );
        }
      } else {
        // 資格取得月より前
        pensionBase = 0;
      }
    } else {
      // 入社日が未設定の場合は通常通り計算
      if (ageFlags.isNoPension) {
        pensionBase = 0;
      } else {
        pensionBase = this.adjustPensionStandardMonthlyRemuneration(
          standardMonthlyRemuneration
        );
      }
    }
    // 厚生年金：個人分を計算 → 50銭ルールで丸める → 会社分 = 総額 - 個人分
    const pensionTotal =
      pensionBase * (r.pension_employee + r.pension_employer);
    const pensionHalf = pensionTotal / 2;
    const pension_employee = this.roundWith50SenRule(pensionHalf); // 個人分：50銭ルールで丸める
    const pension_employer = pensionTotal - pension_employee; // 会社分 = 総額 - 個人分

    const result = {
      health_employee,
      health_employer,
      care_employee,
      care_employer,
      pension_employee,
      pension_employer,
      reasons,
    };

    const totalPremium =
      health_employee +
      health_employer +
      care_employee +
      care_employer +
      pension_employee +
      pension_employer;

    return result;
  }

  /**
   * 月次保険料を計算（簡易版）
   * @param standard 標準報酬月額
   * @param birthDate 生年月日（YYYY-MM-DD形式）
   * @param year 年度
   * @param month 月（1-12）
   * @param rates 料率データ
   * @returns 保険料データ
   */
  calculateInsurancePremiumsCore(
    standard: number,
    birthDate: string,
    year: number,
    month: number,
    rates: any
  ): {
    health_employee: number;
    health_employer: number;
    care_employee: number;
    care_employer: number;
    pension_employee: number;
    pension_employer: number;
  } | null {
    if (!rates) return null;
    const r = rates;
    // 介護保険判定（Service統一ロジックを使用）
    const careType = this.exemptionDeterminationService.getCareInsuranceType(
      birthDate,
      year,
      month
    );
    const isCareApplicable = careType === 'type2';

    const pension_employee = r.pension_employee;
    const pension_employer = r.pension_employer;

    // 健康保険の計算方法変更：
    // 介護保険に加入していない場合：標準報酬月額×健保保険料率
    // 介護保険に加入している場合（40歳～64歳）：標準報酬月額×（健康保険料率＋介護保険料率）
    // 50銭未満切り捨て、50銭超切り上げ
    const healthRateEmployee = isCareApplicable
      ? r.health_employee + r.care_employee
      : r.health_employee;
    const healthRateEmployer = isCareApplicable
      ? r.health_employer + r.care_employer
      : r.health_employer;

    // 健康保険：総額を計算 → 折半 → それぞれ50銭ルールで丸める
    const healthTotal = standard * (healthRateEmployee + healthRateEmployer);
    const healthHalf = healthTotal / 2;
    const health_employee_result = this.roundWith50SenRule(healthHalf);
    const health_employer_result = this.roundWith50SenRule(healthHalf);

    // 介護保険は健康保険に含まれるため、個別の値は0とする（後方互換性のため残す）
    const care_employee_result = 0;
    const care_employer_result = 0;

    // 厚生年金：標準報酬月額を補正してから計算
    const adjustedStandard =
      this.adjustPensionStandardMonthlyRemuneration(standard);
    // 厚生年金：個人分を計算 → 50銭ルールで丸める → 会社分 = 総額 - 個人分
    const pensionTotal =
      adjustedStandard * (pension_employee + pension_employer);
    const pensionHalf = pensionTotal / 2;
    const pension_employee_result = this.roundWith50SenRule(pensionHalf); // 個人分：50銭ルールで丸める
    const pension_employer_result = pensionTotal - pension_employee_result; // 会社分 = 総額 - 個人分

    return {
      health_employee: health_employee_result,
      health_employer: health_employer_result,
      care_employee: care_employee_result,
      care_employer: care_employer_result,
      pension_employee: pension_employee_result,
      pension_employer: pension_employer_result,
    };
  }

  /**
   * 厚生年金用の標準報酬月額を補正
   * - 93,000円未満の場合 → 88,000円
   * - 635,000円以上の場合 → 650,000円
   * - それ以外はそのまま
   * @param standardMonthlyRemuneration 標準報酬月額（健康保険・介護保険用）
   * @returns 補正後の標準報酬月額（厚生年金用）
   */
  private adjustPensionStandardMonthlyRemuneration(
    standardMonthlyRemuneration: number
  ): number {
    if (standardMonthlyRemuneration < 93000) {
      return 88000;
    }
    if (standardMonthlyRemuneration >= 635000) {
      return 650000;
    }
    return standardMonthlyRemuneration;
  }

  /**
   * 1円未満を50銭ルールで丸める
   * - 0.50以下 → 切り捨て
   * - 0.50より大きい → 切り上げ
   * @param amount 丸める金額
   * @returns 丸め後の金額
   */
  private roundWith50SenRule(amount: number): number {
    const floor = Math.floor(amount);
    const diff = amount - floor;

    if (diff > 0.5 + 1e-9) {
      return floor + 1;
    }
    return floor;
  }
}
