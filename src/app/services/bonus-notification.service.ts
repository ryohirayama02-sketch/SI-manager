import { Injectable } from '@angular/core';
import { BonusService } from './bonus.service';

/**
 * BonusNotificationService
 * 
 * 賞与支払届の要否判定を担当するサービス
 * 届出要否判定と提出期限の計算を提供
 */
@Injectable({ providedIn: 'root' })
export class BonusNotificationService {
  constructor(
    private bonusService: BonusService
  ) {}

  /**
   * 賞与→給与扱いチェック
   */
  async checkSalaryInsteadOfBonus(
    employeeId: string,
    payDate: Date
  ): Promise<{
    isSalaryInsteadOfBonus: boolean;
    reason_bonus_to_salary_text?: string;
    bonusCountLast12Months: number;
    bonusCount: number;
    salaryInsteadReasons: string[];
  }> {
    // 過去12ヶ月（支給日ベース）の賞与を取得（今回の支給日を含む）
    const bonusesLast12Months = await this.bonusService.getBonusesLast12Months(
      employeeId,
      payDate
    );
    const bonusCountLast12Months = bonusesLast12Months.length;
    const bonusCount = bonusCountLast12Months;

    const salaryInsteadReasons: string[] = [];
    let isSalaryInsteadOfBonus = false;
    let reason_bonus_to_salary_text: string | undefined = undefined;

    // 過去12ヶ月の賞与支給回数から判定
    // 3回以内 → 賞与扱い
    // 4回以上 → 給与扱い（賞与保険料なし）
    if (bonusCountLast12Months >= 4) {
      isSalaryInsteadOfBonus = true;
      reason_bonus_to_salary_text = `過去12ヶ月の賞与支給回数が${bonusCountLast12Months}回（4回以上）のため、今回の支給は賞与ではなく給与として扱われます。`;
      salaryInsteadReasons.push(
        `過去12ヶ月の賞与支給回数が${bonusCountLast12Months}回（4回以上）のため給与扱い`
      );
    } else {
      salaryInsteadReasons.push(
        `過去12ヶ月の賞与支給回数が${bonusCountLast12Months}回（3回以内）のため賞与扱い`
      );
    }

    return {
      isSalaryInsteadOfBonus,
      reason_bonus_to_salary_text,
      bonusCountLast12Months,
      bonusCount,
      salaryInsteadReasons,
    };
  }

  /**
   * 賞与支払届の提出要否を判定
   */
  determineReportRequirement(
    isRetiredNoLastDay: boolean,
    isExempted: boolean,
    reason_exempt_maternity: boolean,
    reason_exempt_childcare: boolean,
    isOverAge75: boolean,
    reason_bonus_to_salary: boolean,
    payDate: Date
  ): {
    requireReport: boolean;
    reportReason: string;
    reportDeadline: string | null;
  } {
    let requireReport = true;
    let reportReason = '';
    let reportDeadline: string | null = null;

    if (isRetiredNoLastDay) {
      requireReport = false;
      reportReason = '退職月の月末在籍が無いため賞与支払届は不要です';
    } else if (isExempted) {
      requireReport = false;
      if (reason_exempt_maternity) {
        reportReason =
          '産前産後休業中の賞与は免除対象のため賞与支払届は不要です';
      } else if (reason_exempt_childcare) {
        reportReason = '育児休業中の賞与は免除対象のため賞与支払届は不要です';
      } else {
        reportReason = '産休/育休中の賞与は免除対象のため賞与支払届は不要です';
      }
    } else if (isOverAge75) {
      requireReport = false;
      reportReason =
        '75歳到達月で健康保険・介護保険の資格喪失のため賞与支払届は不要です';
    } else if (reason_bonus_to_salary) {
      requireReport = false;
      reportReason =
        '年度内4回目以降の賞与は給与扱いとなるため賞与支払届は不要です';
    } else {
      requireReport = true;
      reportReason =
        '支給された賞与は社会保険の対象となるため、賞与支払届が必要です';

      const deadlineDate = new Date(payDate);
      deadlineDate.setDate(deadlineDate.getDate() + 5);
      reportDeadline = deadlineDate.toISOString().split('T')[0];
    }

    return { requireReport, reportReason, reportDeadline };
  }

  /**
   * 賞与支払届の要否を判定する（簡易版）
   */
  checkReportRequired(
    standardBonus: number,
    isRetiredNoLastDay: boolean
  ): boolean {
    // 標準賞与額が1,000円未満 → false
    if (standardBonus < 1000) {
      return false;
    }

    // 支給月の月末在籍がfalse → false
    if (isRetiredNoLastDay) {
      return false;
    }

    // 上記以外 → true（育休・産休免除でも提出必要）
    return true;
  }
}



