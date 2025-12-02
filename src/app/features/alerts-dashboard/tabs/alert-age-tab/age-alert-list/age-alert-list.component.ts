import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgeAlert } from '../alert-age-tab.component';
import { formatDate as formatDateHelper } from '../../../../../utils/alerts-helper';

@Component({
  selector: 'app-age-alert-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './age-alert-list.component.html',
  styleUrl: './age-alert-list.component.css'
})
export class AgeAlertListComponent {
  @Input() ageAlerts: AgeAlert[] = [];
  @Input() selectedAgeAlertIds: Set<string> = new Set();
  @Output() alertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  formatDate(date: Date): string {
    return formatDateHelper(date);
  }

  formatBirthDate(birthDateString: string): string {
    const date = new Date(birthDateString);
    return formatDateHelper(date);
  }

  toggleAgeAlertSelection(alertId: string): void {
    const isSelected = this.selectedAgeAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllAgeAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isAgeAlertSelected(alertId: string): boolean {
    return this.selectedAgeAlertIds.has(alertId);
  }

  deleteSelectedAgeAlerts(): void {
    this.deleteSelected.emit();
  }
}

