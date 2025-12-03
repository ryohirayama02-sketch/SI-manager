import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeaveAlertUiService } from '../../../../services/leave-alert-ui.service';

export interface MaternityChildcareAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  alertType: '産前産後休業取得者申出書' | '産前産後休業終了届' | '育児休業等取得者申出書（保険料免除開始）' | '育児休業等終了届（免除終了）' | '育児休業等取得者申出書（賞与用）' | '傷病手当金支給申請書の記入依頼' | '育児休業関係の事業主証明書の記入依頼' | '出産手当金支給申請書の記入依頼' | '出産育児一時金支給申請書の記入依頼';
  notificationName: string;
  startDate: Date; // 開始日（産休開始日、育休開始日、産休終了日の翌日、育休終了日の翌日、賞与支給日、申請書記入依頼日）
  submitDeadline: Date; // 提出期限（開始日から5日後、または申請書記入依頼日から1週間後）
  daysUntilDeadline: number; // 提出期限までの日数
  details: string; // 詳細情報
}

@Component({
  selector: 'app-alert-leave-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-leave-tab.component.html',
  styleUrl: './alert-leave-tab.component.css'
})
export class AlertLeaveTabComponent {
  @Input() maternityChildcareAlerts: MaternityChildcareAlert[] = [];
  @Input() selectedMaternityChildcareAlertIds: Set<string> = new Set();
  @Output() alertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  constructor(
    private leaveAlertUiService: LeaveAlertUiService
  ) {}

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    return this.leaveAlertUiService.formatDate(date);
  }

  // 産休育休アラートの選択管理
  toggleMaternityChildcareAlertSelection(alertId: string): void {
    const isSelected = this.selectedMaternityChildcareAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllMaternityChildcareAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isMaternityChildcareAlertSelected(alertId: string): boolean {
    return this.selectedMaternityChildcareAlertIds.has(alertId);
  }

  // 産休育休アラートの削除
  deleteSelectedMaternityChildcareAlerts(): void {
    this.deleteSelected.emit();
  }
}



