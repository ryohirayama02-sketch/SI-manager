import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Bonus } from '../../../../models/bonus.model';

@Component({
  selector: 'app-annual-bonus-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './annual-bonus-summary.component.html',
  styleUrl: './annual-bonus-summary.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnnualBonusSummaryComponent {
  @Input() year: number = new Date().getFullYear();
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
  @Input() annualTotalHealth: number = 0;
  @Input() annualTotalCare: number = 0;
  @Input() annualTotalPension: number = 0;
  @Input() annualTotal: number = 0;
}

