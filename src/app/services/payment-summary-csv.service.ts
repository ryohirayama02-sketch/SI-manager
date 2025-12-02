import { Injectable } from '@angular/core';
import { PaymentSummaryStateService } from './payment-summary-state.service';
import { MonthlyPremiumRow } from './payment-summary-calculation.service';
import { Bonus } from '../models/bonus.model';

/**
 * PaymentSummaryCsvService
 * 
 * 保険料サマリー画面のCSV出力ロジックを担当するサービス
 * CSV構築とエクスポート処理を提供
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryCsvService {
  constructor(
    private stateService: PaymentSummaryStateService
  ) {}

  /**
   * CSVを構築する
   */
  buildCsv(): string {
    const headers = [
      'month',
      'healthEmployee',
      'healthEmployer',
      'careEmployee',
      'careEmployer',
      'pensionEmployee',
      'pensionEmployer',
      'total'
    ];
    const rows: string[] = [headers.join(',')];

    // 会社全体の月次合計を計算（本人負担・会社負担を分けて）
    const monthlyTotalsByMonth: {
      [month: number]: {
        healthEmployee: number;
        healthEmployer: number;
        careEmployee: number;
        careEmployer: number;
        pensionEmployee: number;
        pensionEmployer: number;
        total: number;
      };
    } = {};

    // 1〜12月を初期化
    for (let month = 1; month <= 12; month++) {
      monthlyTotalsByMonth[month] = {
        healthEmployee: 0,
        healthEmployer: 0,
        careEmployee: 0,
        careEmployer: 0,
        pensionEmployee: 0,
        pensionEmployer: 0,
        total: 0,
      };
    }

    // 全従業員の月次保険料を集計
    for (const emp of this.stateService.employees) {
      const employeeRows = this.stateService.monthlyPremiumsByEmployee[emp.id];
      if (!employeeRows || employeeRows.length === 0) {
        continue;
      }

      for (const row of employeeRows) {
        const month = row.month;
        if (month >= 1 && month <= 12) {
          monthlyTotalsByMonth[month].healthEmployee += row.healthEmployee || 0;
          monthlyTotalsByMonth[month].healthEmployer += row.healthEmployer || 0;
          monthlyTotalsByMonth[month].careEmployee += row.careEmployee || 0;
          monthlyTotalsByMonth[month].careEmployer += row.careEmployer || 0;
          monthlyTotalsByMonth[month].pensionEmployee += row.pensionEmployee || 0;
          monthlyTotalsByMonth[month].pensionEmployer += row.pensionEmployer || 0;
        }
      }
    }

    // 賞与保険料を月次合計に加算（全従業員）
    for (const bonus of this.stateService.currentYearBonuses) {
      const bonusMonth = bonus.month;
      if (bonusMonth >= 1 && bonusMonth <= 12) {
        monthlyTotalsByMonth[bonusMonth].healthEmployee += bonus.healthEmployee || 0;
        monthlyTotalsByMonth[bonusMonth].healthEmployer += bonus.healthEmployer || 0;
        monthlyTotalsByMonth[bonusMonth].careEmployee += bonus.careEmployee || 0;
        monthlyTotalsByMonth[bonusMonth].careEmployer += bonus.careEmployer || 0;
        monthlyTotalsByMonth[bonusMonth].pensionEmployee += bonus.pensionEmployee || 0;
        monthlyTotalsByMonth[bonusMonth].pensionEmployer += bonus.pensionEmployer || 0;
      }
    }

    // CSV行を生成
    for (let month = 1; month <= 12; month++) {
      const monthData = monthlyTotalsByMonth[month];
      const total =
        monthData.healthEmployee +
        monthData.healthEmployer +
        monthData.careEmployee +
        monthData.careEmployer +
        monthData.pensionEmployee +
        monthData.pensionEmployer;

      const row = [
        month.toString(),
        monthData.healthEmployee.toString(),
        monthData.healthEmployer.toString(),
        monthData.careEmployee.toString(),
        monthData.careEmployer.toString(),
        monthData.pensionEmployee.toString(),
        monthData.pensionEmployer.toString(),
        total.toString(),
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * CSVをエクスポートする
   */
  exportCsv(): void {
    const csvContent = this.buildCsv();
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM付きUTF-8
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `社会保険料振込額_${this.stateService.year}年度.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

