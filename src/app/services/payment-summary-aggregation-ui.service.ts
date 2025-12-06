import { Injectable } from '@angular/core';
import { PaymentSummaryStateService } from './payment-summary-state.service';

/**
 * PaymentSummaryAggregationUiService
 * 
 * 保険料サマリー画面の集計ロジックを担当するサービス
 * 月次報酬分、賞与保険料、最終総計の集計を提供
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryAggregationUiService {
  constructor(
    private stateService: PaymentSummaryStateService
  ) {}

  /**
   * 指定月の月次報酬分の集計を取得
   */
  getMonthlyTotals(year: number, month: number | 'all' | string): {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    totalEmployee: number;
    totalEmployer: number;
    total: number;
  } {
    let healthEmployee = 0;
    let healthEmployer = 0;
    let careEmployee = 0;
    let careEmployer = 0;
    let pensionEmployee = 0;
    let pensionEmployer = 0;

    if (month === 'all') {
      // 全月の場合は年間合計を使用（全従業員）
      for (const emp of this.stateService.employees) {
        const rows = this.stateService.monthlyPremiumsByEmployee[emp.id] || [];
        for (const row of rows) {
          healthEmployee += row.healthEmployee || 0;
          healthEmployer += row.healthEmployer || 0;
          careEmployee += row.careEmployee || 0;
          careEmployer += row.careEmployer || 0;
          pensionEmployee += row.pensionEmployee || 0;
          pensionEmployer += row.pensionEmployer || 0;
        }
      }
    } else {
      // 特定月の集計（全従業員）
      const monthNum = typeof month === 'string' ? Number(month) : (month as number);
      for (const emp of this.stateService.employees) {
        const rows = this.stateService.monthlyPremiumsByEmployee[emp.id] || [];
        const monthRow = rows.find(r => r.month === monthNum);
        if (monthRow) {
          healthEmployee += monthRow.healthEmployee || 0;
          healthEmployer += monthRow.healthEmployer || 0;
          careEmployee += monthRow.careEmployee || 0;
          careEmployer += monthRow.careEmployer || 0;
          pensionEmployee += monthRow.pensionEmployee || 0;
          pensionEmployer += monthRow.pensionEmployer || 0;
        }
      }
    }

    const totalEmployee = healthEmployee + careEmployee + pensionEmployee;
    const totalEmployer = healthEmployer + careEmployer + pensionEmployer;
    const total = totalEmployee + totalEmployer;

    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      totalEmployee,
      totalEmployer,
      total,
    };
  }

  /**
   * 指定月の賞与保険料の集計を取得
   */
  getBonusTotals(year: number, month: number | 'all' | string): {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    totalEmployee: number;
    totalEmployer: number;
    total: number;
  } {
    let healthEmployee = 0;
    let healthEmployer = 0;
    let careEmployee = 0;
    let careEmployer = 0;
    let pensionEmployee = 0;
    let pensionEmployer = 0;

    if (month === 'all') {
      // 全月の場合は年間の賞与合計を使用（全従業員）
      for (const bonus of this.stateService.currentYearBonuses) {
        if (!bonus.isExempted && !bonus.isSalaryInsteadOfBonus) {
          healthEmployee += bonus.healthEmployee || 0;
          healthEmployer += bonus.healthEmployer || 0;
          careEmployee += bonus.careEmployee || 0;
          careEmployer += bonus.careEmployer || 0;
          pensionEmployee += bonus.pensionEmployee || 0;
          pensionEmployer += bonus.pensionEmployer || 0;
        }
      }
    } else {
      // 特定月の賞与を集計（全従業員）
      const monthNum = typeof month === 'string' ? Number(month) : (month as number);
      
      // bonusByMonthから該当月の賞与を取得（既に月ごとにグループ化済み）
      const monthBonuses = this.stateService.bonusByMonth[monthNum] || [];
      
      for (const bonus of monthBonuses) {
        if (bonus.isExempted || bonus.isSalaryInsteadOfBonus) {
          continue;
        }
        
        healthEmployee += bonus.healthEmployee || 0;
        healthEmployer += bonus.healthEmployer || 0;
        careEmployee += bonus.careEmployee || 0;
        careEmployer += bonus.careEmployer || 0;
        pensionEmployee += bonus.pensionEmployee || 0;
        pensionEmployer += bonus.pensionEmployer || 0;
      }
      
      // bonusByMonthにデータがない場合、currentYearBonusesから直接フィルタリング（フォールバック）
      if (monthBonuses.length === 0) {
        for (const bonus of this.stateService.currentYearBonuses) {
          if (bonus.isExempted || bonus.isSalaryInsteadOfBonus) continue;
          
          // 支給日から月を抽出（bonus.monthも確認）
          let bonusMonth: number | null = null;
          let bonusYear: number | null = null;
          
          // bonus.monthフィールドを優先的に使用
          if (bonus.month) {
            bonusMonth = bonus.month;
            bonusYear = bonus.year || year;
          } else if (bonus.payDate) {
            // payDateから抽出
            const payDateObj = new Date(bonus.payDate);
            bonusYear = payDateObj.getFullYear();
            bonusMonth = payDateObj.getMonth() + 1;
          } else {
            continue;
          }
          
          if (bonusMonth && bonusYear === year && bonusMonth === monthNum) {
            healthEmployee += bonus.healthEmployee || 0;
            healthEmployer += bonus.healthEmployer || 0;
            careEmployee += bonus.careEmployee || 0;
            careEmployer += bonus.careEmployer || 0;
            pensionEmployee += bonus.pensionEmployee || 0;
            pensionEmployer += bonus.pensionEmployer || 0;
          }
        }
      }
    }

    const totalEmployee = healthEmployee + careEmployee + pensionEmployee;
    const totalEmployer = healthEmployer + careEmployer + pensionEmployer;
    const total = totalEmployee + totalEmployer;

    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      totalEmployee,
      totalEmployer,
      total,
    };
  }

  /**
   * 最終総計を取得
   */
  getFinalTotals(): {
    companyTotal: number;
    employeeTotal: number;
    grandTotal: number;
  } {
    const monthlyTotals = this.getMonthlyTotals(this.stateService.year, this.stateService.selectedMonth);
    const bonusTotals = this.getBonusTotals(this.stateService.year, this.stateService.selectedMonth);

    const companyTotal = monthlyTotals.totalEmployer + bonusTotals.totalEmployer;
    const employeeTotal = monthlyTotals.totalEmployee + bonusTotals.totalEmployee;
    const grandTotal = companyTotal + employeeTotal;

    return {
      companyTotal,
      employeeTotal,
      grandTotal,
    };
  }
}






