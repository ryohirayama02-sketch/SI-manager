import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SupportAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  familyMemberId: string;
  familyMemberName: string;
  relationship: string; // 続柄（配偶者、子、父母など）
  alertType: '配偶者20歳到達' | '配偶者60歳到達' | '配偶者収入増加' | '配偶者別居' | '配偶者75歳到達' | 
             '子18歳到達' | '子20歳到達' | '子22歳到達' | '子別居' | '子収入増加' | '子死亡結婚' |
             '親収入見直し' | '親別居' | '親75歳到達' | '親死亡';
  notificationName: string;
  alertDate: Date; // アラート対象日（到達日、変更日など）
  submitDeadline?: Date; // 提出期限（該当する場合）
  daysUntilDeadline?: number; // 提出期限までの日数
  details: string; // 詳細情報
}

@Component({
  selector: 'app-alert-family-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-family-tab.component.html',
  styleUrl: './alert-family-tab.component.css'
})
export class AlertFamilyTabComponent {
  @Input() supportAlerts: SupportAlert[] = [];
  @Input() selectedSupportAlertIds: Set<string> = new Set();
  @Output() alertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }

  // 扶養アラートの選択管理
  toggleSupportAlertSelection(alertId: string): void {
    const isSelected = this.selectedSupportAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllSupportAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isSupportAlertSelected(alertId: string): boolean {
    return this.selectedSupportAlertIds.has(alertId);
  }

  // 扶養アラートの削除
  deleteSelectedSupportAlerts(): void {
    this.deleteSelected.emit();
  }
}

