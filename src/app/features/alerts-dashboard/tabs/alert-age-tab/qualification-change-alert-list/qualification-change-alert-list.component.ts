import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QualificationChangeAlert } from '../alert-age-tab.component';
import { formatDate as formatDateHelper } from '../../../../../utils/alerts-helper';

@Component({
  selector: 'app-qualification-change-alert-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './qualification-change-alert-list.component.html',
  styleUrl: './qualification-change-alert-list.component.css'
})
export class QualificationChangeAlertListComponent {
  @Input() qualificationChangeAlerts: QualificationChangeAlert[] = [];
  @Input() selectedQualificationChangeAlertIds: Set<string> = new Set();
  @Output() alertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  formatDate(date: Date): string {
    return formatDateHelper(date);
  }

  toggleQualificationChangeAlertSelection(alertId: string): void {
    const isSelected = this.selectedQualificationChangeAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllQualificationChangeAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isQualificationChangeAlertSelected(alertId: string): boolean {
    return this.selectedQualificationChangeAlertIds.has(alertId);
  }

  deleteSelectedQualificationChangeAlerts(): void {
    this.deleteSelected.emit();
  }
}

