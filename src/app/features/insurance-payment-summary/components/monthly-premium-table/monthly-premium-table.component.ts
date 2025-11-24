import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models/employee.model';

@Component({
  selector: 'app-monthly-premium-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './monthly-premium-table.component.html',
  styleUrl: './monthly-premium-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthlyPremiumTableComponent {
  @Input() employee: Employee | null = null;
  @Input() year: number = new Date().getFullYear();
  @Input() monthlyPremiumRows: {
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
  }[] = [];
  @Input() hasNotes: boolean = false;
  
  isExpanded: boolean = true;

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }
}

