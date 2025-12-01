import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';

@Injectable({ providedIn: 'root' })
export class PaymentSummaryFormatService {
  /**
   * 指定月の賞与情報をツールチップ用の文字列として返す
   * @param month 月（1-12）
   * @param bonusByMonth 月ごとの賞与データ
   * @param employees 従業員リスト
   * @returns ツールチップ用の文字列
   */
  getBonusTooltip(
    month: number,
    bonusByMonth: { [month: number]: Bonus[] },
    employees: Employee[]
  ): string {
    const bonuses = bonusByMonth[month];
    if (!bonuses || bonuses.length === 0) {
      return '';
    }

    const lines: string[] = [];
    for (const bonus of bonuses) {
      const employee = employees.find((e) => e.id === bonus.employeeId);
      const employeeName = employee ? employee.name : bonus.employeeId;

      lines.push(`【${employeeName}】`);
      lines.push(`賞与額: ${(bonus.amount || 0).toLocaleString()}円`);

      if (bonus.standardBonusAmount !== undefined) {
        lines.push(
          `標準賞与額: ${bonus.standardBonusAmount.toLocaleString()}円`
        );
      }

      const healthEmployee = bonus.healthEmployee || 0;
      const healthEmployer = bonus.healthEmployer || 0;
      const careEmployee = bonus.careEmployee || 0;
      const careEmployer = bonus.careEmployer || 0;
      const pensionEmployee = bonus.pensionEmployee || 0;
      const pensionEmployer = bonus.pensionEmployer || 0;

      if (healthEmployee > 0 || healthEmployer > 0) {
        lines.push(
          `健康保険: 本人${healthEmployee.toLocaleString()}円 / 会社${healthEmployer.toLocaleString()}円`
        );
      }
      if (careEmployee > 0 || careEmployer > 0) {
        lines.push(
          `介護保険: 本人${careEmployee.toLocaleString()}円 / 会社${careEmployer.toLocaleString()}円`
        );
      }
      if (pensionEmployee > 0 || pensionEmployer > 0) {
        lines.push(
          `厚生年金: 本人${pensionEmployee.toLocaleString()}円 / 会社${pensionEmployer.toLocaleString()}円`
        );
      }

      if (bonus.isExempted || bonus.isExempt) {
        lines.push(`免除: ${bonus.exemptReason || '産休・育休中'}`);
      } else if (bonus.isSalaryInsteadOfBonus) {
        lines.push(`給与扱い: 年間4回以上支給のため`);
      } else if (bonus.isRetiredNoLastDay) {
        lines.push(`対象外: 月末在籍なし`);
      } else {
        lines.push(`有効`);
      }

      if (bonuses.length > 1 && bonus !== bonuses[bonuses.length - 1]) {
        lines.push(''); // 複数賞与の場合は区切り
      }
    }

    return lines.join('\n');
  }
}









