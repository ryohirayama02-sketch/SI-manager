import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SuijiKouhoResult } from '../../../../services/salary-calculation.service';
import { SuijiAlertUiService } from '../../../../services/suiji-alert-ui.service';
import { formatDate } from '../../../../utils/alerts-helper';

// 前月比差額を含む拡張型
export interface SuijiKouhoResultWithDiff extends SuijiKouhoResult {
  diffPrev?: number | null;
  id?: string; // FirestoreのドキュメントID
  year?: number; // 年度情報
}

@Component({
  selector: 'app-alert-suiji-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-suiji-tab.component.html',
  styleUrl: './alert-suiji-tab.component.css'
})
export class AlertSuijiTabComponent {
  @Input() suijiAlerts: SuijiKouhoResultWithDiff[] = [];
  @Input() selectedSuijiAlertIds: Set<string> = new Set();
  @Input() employees: any[] = [];
  @Output() alertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  constructor(
    private suijiAlertUiService: SuijiAlertUiService
  ) {}

  getEmployeeName(employeeId: string): string {
    const emp = this.employees.find((e: any) => e.id === employeeId);
    return emp?.name || employeeId;
  }

  getStatusText(result: SuijiKouhoResultWithDiff): string {
    return result.isEligible ? '要提出' : '提出不要';
  }

  /**
   * 随時改定の届出提出期日を取得
   */
  getSuijiReportDeadline(alert: SuijiKouhoResultWithDiff): string {
    return this.suijiAlertUiService.getSuijiReportDeadline(alert);
  }

  /**
   * 適用開始月を取得（変動月から再計算）
   */
  getApplyStartMonth(alert: SuijiKouhoResultWithDiff): number {
    if (!alert.changeMonth) {
      return alert.applyStartMonth || 0;
    }
    // 変動月+3ヶ月後が適用開始月
    const applyStartMonthRaw = alert.changeMonth + 3;
    return applyStartMonthRaw > 12 ? applyStartMonthRaw - 12 : applyStartMonthRaw;
  }

  getReasonText(result: SuijiKouhoResultWithDiff): string {
    return result.reasons.join(' / ');
  }

  isLargeChange(diff: number | null | undefined): boolean {
    return this.suijiAlertUiService.isLargeChange(diff);
  }

  getSuijiAlertId(alert: SuijiKouhoResultWithDiff): string {
    return this.suijiAlertUiService.getSuijiAlertId(alert);
  }

  formatDate(date: Date): string {
    return this.suijiAlertUiService.formatSuijiDate(date);
  }

  // 随時改定アラートの選択管理
  toggleSuijiAlertSelection(alertId: string): void {
    const isSelected = this.selectedSuijiAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllSuijiAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isSuijiAlertSelected(alertId: string): boolean {
    return this.selectedSuijiAlertIds.has(alertId);
  }

  // 随時改定アラートの削除
  deleteSelectedSuijiAlerts(): void {
    this.deleteSelected.emit();
  }
}



