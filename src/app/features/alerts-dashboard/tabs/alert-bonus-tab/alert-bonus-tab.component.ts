import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BonusAlertUiService } from '../../../../services/bonus-alert-ui.service';

export interface BonusReportAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  bonusAmount: number;
  payDate: string; // YYYY-MM-DD
  submitDeadline: Date; // 提出期限（支給日から5日後）
  daysUntilDeadline: number; // 提出期限までの日数
}

@Component({
  selector: 'app-alert-bonus-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-bonus-tab.component.html',
  styleUrl: './alert-bonus-tab.component.css'
})
export class AlertBonusTabComponent {
  @Input() bonusReportAlerts: BonusReportAlert[] = [];
  @Input() selectedBonusReportAlertIds: Set<string> = new Set();
  @Output() alertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  constructor(
    private bonusAlertUiService: BonusAlertUiService
  ) {}

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    return this.bonusAlertUiService.formatDate(date);
  }

  /**
   * 支給日をフォーマット
   */
  formatPayDate(payDateStr: string): string {
    return this.bonusAlertUiService.formatPayDate(payDateStr);
  }

  /**
   * 賞与支払届アラートの選択管理
   */
  toggleBonusReportAlertSelection(alertId: string): void {
    const isSelected = this.selectedBonusReportAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllBonusReportAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isBonusReportAlertSelected(alertId: string): boolean {
    return this.selectedBonusReportAlertIds.has(alertId);
  }

  /**
   * 選択した賞与支払届アラートを削除
   */
  deleteSelectedBonusReportAlerts(): void {
    this.deleteSelected.emit();
  }
}



