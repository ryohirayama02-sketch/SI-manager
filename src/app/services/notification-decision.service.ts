import { Injectable } from '@angular/core';
import { TeijiKetteiResult, SuijiKouhoResult, ShikakuShutokuResult } from './salary-calculation.service';
import { Employee } from '../models/employee.model';

export interface NotificationDecisionResult {
  type: 'teiji' | 'suiji' | 'bonus';
  required: boolean;
  submitUntil?: string;  // yyyy-mm-dd
  reasons: string[];
}

@Injectable({ providedIn: 'root' })
export class NotificationDecisionService {

  /**
   * 定時決定（4〜6月平準）による「算定基礎届提出要否」を判定する
   * @param teijiResult 定時決定の結果
   * @param currentGrade 現行等級
   * @param year 年
   * @returns 届出要否判定結果
   */
  checkTeijiNotification(
    teijiResult: TeijiKetteiResult,
    currentGrade: number,
    year: number
  ): NotificationDecisionResult {
    const reasons: string[] = [];
    
    // 等級が決定されていない場合は提出不要
    if (teijiResult.grade === 0 || teijiResult.standardMonthlyRemuneration === 0) {
      reasons.push('定時決定により等級が決定されていないため、算定基礎届は不要');
      return {
        type: 'teiji',
        required: false,
        reasons
      };
    }
    
    // 現行等級が設定されていない場合は提出要否を判定できない
    if (currentGrade === 0) {
      reasons.push('現行等級が設定されていないため、算定基礎届の提出要否を判定できません');
      return {
        type: 'teiji',
        required: false,
        reasons
      };
    }
    
    // 等級差を計算
    const gradeDiff = Math.abs(teijiResult.grade - currentGrade);
    
    // 2等級以上乖離している場合は提出要
    if (gradeDiff >= 2) {
      reasons.push(`定時決定により等級${currentGrade}から等級${teijiResult.grade}に変更（${gradeDiff}等級差）のため、算定基礎届の提出が必要`);
      // 提出期限：7月10日
      const submitUntil = `${year}-07-10`;
      return {
        type: 'teiji',
        required: true,
        submitUntil,
        reasons
      };
    } else {
      reasons.push(`定時決定により等級${currentGrade}から等級${teijiResult.grade}に変更（${gradeDiff}等級差）のため、算定基礎届は不要`);
      return {
        type: 'teiji',
        required: false,
        reasons
      };
    }
  }

  /**
   * 随時改定（固定的賃金変動）による「月額変更届提出要否」を判定する
   * @param suijiResult 随時改定の結果
   * @param changeMonth 変動月
   * @param year 年
   * @returns 届出要否判定結果
   */
  checkSuijiNotification(
    suijiResult: SuijiKouhoResult,
    changeMonth: number,
    year: number
  ): NotificationDecisionResult {
    const reasons: string[] = [];
    
    // 随時改定が成立していない場合は提出不要
    if (!suijiResult.isEligible) {
      reasons.push('随時改定が成立していないため、月額変更届は不要');
      return {
        type: 'suiji',
        required: false,
        reasons
      };
    }
    
    // 等級差が2等級以上の場合のみ提出要
    if (suijiResult.diff >= 2) {
      reasons.push(`固定的賃金変動により等級${suijiResult.currentGrade}から等級${suijiResult.newGrade}に変更（${suijiResult.diff}等級差）のため、月額変更届の提出が必要`);
      
      // 提出期限：変動月の4ヶ月後の翌月10日（適用開始月の翌月10日）
      const applyYear = suijiResult.applyStartMonth > 12 ? year + 1 : year;
      const applyMonth = suijiResult.applyStartMonth > 12 ? suijiResult.applyStartMonth - 12 : suijiResult.applyStartMonth;
      const submitDate = new Date(applyYear, applyMonth, 10); // 適用開始月の翌月10日
      const submitUntil = submitDate.toISOString().split('T')[0];
      
      reasons.push(`提出期限：${submitUntil}（適用開始月の翌月10日）`);
      
      return {
        type: 'suiji',
        required: true,
        submitUntil,
        reasons
      };
    } else {
      reasons.push(`固定的賃金変動により等級${suijiResult.currentGrade}から等級${suijiResult.newGrade}に変更（${suijiResult.diff}等級差）のため、月額変更届は不要`);
      return {
        type: 'suiji',
        required: false,
        reasons
      };
    }
  }

  /**
   * 賞与支払届の提出要否を判定する
   * @param bonusAmount 賞与額
   * @param payDate 支給日
   * @param isRetiredNoLastDay 退職月で月末在籍なしか
   * @param isExempted 産休・育休免除か
   * @param isOverAge75 75歳以上か
   * @param isSalaryInsteadOfBonus 給与扱いか
   * @returns 届出要否判定結果
   */
  checkBonusNotification(
    bonusAmount: number,
    payDate: Date,
    isRetiredNoLastDay: boolean,
    isExempted: boolean,
    isOverAge75: boolean,
    isSalaryInsteadOfBonus: boolean
  ): NotificationDecisionResult {
    const reasons: string[] = [];
    
    // 賞与額が0円の場合は提出不要
    if (bonusAmount <= 0) {
      reasons.push('賞与額が0円のため、賞与支払届は不要');
      return {
        type: 'bonus',
        required: false,
        reasons
      };
    }
    
    // 退職月で月末在籍なしの場合は提出不要
    if (isRetiredNoLastDay) {
      reasons.push('退職月で月末在籍がないため、賞与支払届は不要');
      return {
        type: 'bonus',
        required: false,
        reasons
      };
    }
    
    // 産休・育休免除の場合は提出不要
    if (isExempted) {
      reasons.push('産休・育休中のため、賞与支払届は不要');
      return {
        type: 'bonus',
        required: false,
        reasons
      };
    }
    
    // 75歳以上の場合は提出不要
    if (isOverAge75) {
      reasons.push('75歳以上のため、賞与支払届は不要');
      return {
        type: 'bonus',
        required: false,
        reasons
      };
    }
    
    // 給与扱いの場合は提出不要
    if (isSalaryInsteadOfBonus) {
      reasons.push('給与扱いのため、賞与支払届は不要');
      return {
        type: 'bonus',
        required: false,
        reasons
      };
    }
    
    // 上記の例外に該当しない場合は提出要
    reasons.push('賞与支給があるため、賞与支払届の提出が必要');
    
    // 提出期限：支給日の翌月10日
    const submitDate = new Date(payDate.getFullYear(), payDate.getMonth() + 1, 10);
    const submitUntil = submitDate.toISOString().split('T')[0];
    
    reasons.push(`提出期限：${submitUntil}（支給日の翌月10日）`);
    
    return {
      type: 'bonus',
      required: true,
      submitUntil,
      reasons
    };
  }

  /**
   * 資格取得届の提出要否を判定する
   * @param emp 従業員情報
   * @param shikakuResult 資格取得時決定の結果
   * @returns 資格取得届の提出要否判定結果（nullの場合は判定不可）
   */
  getShikakuShutokuDecision(
    emp: Employee,
    shikakuResult: ShikakuShutokuResult | null
  ): { required: boolean; deadline: string; reason: string } | null {
    // 入社日が存在しない場合は判定不可
    if (!emp.joinDate) {
      return null;
    }

    // 資格取得時決定が行われていない場合は判定不可
    if (!shikakuResult || shikakuResult.grade === 0) {
      return null;
    }

    // 提出期限 = joinDate の翌日から 5 日以内
    const joinDate = new Date(emp.joinDate);
    const nextDay = new Date(joinDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    // 5日後を計算
    const deadline = new Date(nextDay);
    deadline.setDate(deadline.getDate() + 5);
    
    // yyyy-mm-dd形式に変換
    const deadlineStr = deadline.toISOString().split('T')[0];

    return {
      required: true,
      deadline: deadlineStr,
      reason: `資格取得時決定が行われたため、資格取得届の提出が必要（提出期限：${deadlineStr}）`
    };
  }
}

