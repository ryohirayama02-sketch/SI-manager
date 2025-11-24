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
}

