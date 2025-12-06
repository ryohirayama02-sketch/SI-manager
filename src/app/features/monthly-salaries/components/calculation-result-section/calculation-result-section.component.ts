import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models/employee.model';
import {
  TeijiKetteiResult,
  SuijiCandidate,
  ExcludedSuijiReason,
  SuijiKouhoResult,
} from '../../../../services/salary-calculation.service';

@Component({
  selector: 'app-calculation-result-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calculation-result-section.component.html',
  styleUrl: './calculation-result-section.component.css'
})
export class CalculationResultSectionComponent {
  @Input() employees: Employee[] = [];
  @Input() results: { [employeeId: string]: TeijiKetteiResult } = {};
  @Input() infoByEmployee: {
    [employeeId: string]: {
      avg: number | null;
      standard: number | null;
      rank: number | null;
      premiums: any;
    };
  } = {};
  @Input() suijiCandidates: SuijiCandidate[] = [];
  @Input() excludedSuijiReasons: ExcludedSuijiReason[] = [];
  @Input() rehabSuijiCandidates: SuijiKouhoResult[] = [];
  @Input() suijiAlerts: SuijiKouhoResult[] = [];
  @Input() showSuijiDialog: boolean = false;

  @Output() closeSuijiDialog = new EventEmitter<void>();
  @Output() navigateToSuijiAlert = new EventEmitter<void>();

  getCalculatedInfo(emp: Employee) {
    return this.infoByEmployee[emp.id] || null;
  }

  getEmployeeName(employeeId: string): string {
    const emp = this.employees.find((e) => e.id === employeeId);
    return emp?.name || employeeId;
  }

  onCloseSuijiDialog(): void {
    this.closeSuijiDialog.emit();
  }

  onNavigateToSuijiAlert(): void {
    this.navigateToSuijiAlert.emit();
  }
}














