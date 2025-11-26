import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Bonus } from '../../../../models/bonus.model';

@Component({
  selector: 'app-company-monthly-total-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './company-monthly-total-table.component.html',
  styleUrl: './company-monthly-total-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompanyMonthlyTotalTableComponent {
  @Input() year: number = new Date().getFullYear();
  @Input() companyMonthlyTotals: {
    month: number;
    healthTotal: number;
    careTotal: number;
    pensionTotal: number;
    total: number;
  }[] = [];
  @Input() bonusByMonth: { [month: number]: Bonus[] } = {};
  @Input() monthlyTotals: {
    [month: number]: {
      health: number;
      care: number;
      pension: number;
      total: number;
      isPensionStopped?: boolean;
      isHealthStopped?: boolean;
      isMaternityLeave?: boolean;
      isChildcareLeave?: boolean;
      isRetired?: boolean;
    };
  } = {};
  @Input() getBonusTooltip: (month: number) => string = () => '';
  @Input() annualTotalHealth: number = 0;
  @Input() annualTotalCare: number = 0;
  @Input() annualTotalPension: number = 0;
  @Input() annualTotal: number = 0;
  @Input() bonusAnnualTotals: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    totalEmployee: number;
    totalEmployer: number;
    total: number;
  } = {
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

  /**
   * 指定月の賞与保険料合計を取得
   */
  getBonusTotalForMonth(month: number, type: 'health' | 'care' | 'pension' | 'total'): number {
    const bonuses = this.bonusByMonth[month] || [];
    let total = 0;

    for (const bonus of bonuses) {
      if (bonus.isExempted || bonus.isSalaryInsteadOfBonus) continue;

      switch (type) {
        case 'health':
          total += (bonus.healthEmployee || 0) + (bonus.healthEmployer || 0);
          break;
        case 'care':
          total += (bonus.careEmployee || 0) + (bonus.careEmployer || 0);
          break;
        case 'pension':
          total += (bonus.pensionEmployee || 0) + (bonus.pensionEmployer || 0);
          break;
        case 'total':
          total += (bonus.healthEmployee || 0) + (bonus.healthEmployer || 0) +
                   (bonus.careEmployee || 0) + (bonus.careEmployer || 0) +
                   (bonus.pensionEmployee || 0) + (bonus.pensionEmployer || 0);
          break;
      }
    }

    return total;
  }
}

