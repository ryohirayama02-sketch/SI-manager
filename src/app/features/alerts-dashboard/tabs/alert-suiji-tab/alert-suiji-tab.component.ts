import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SuijiKouhoResult } from '../../../../services/salary-calculation.service';

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

  /**
   * 日本時間（JST）の現在日時を取得
   */
  private getJSTDate(): Date {
    const now = new Date();
    // UTC+9時間（日本時間）に変換
    const jstOffset = 9 * 60; // 分単位
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const jst = new Date(utc + (jstOffset * 60000));
    return jst;
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }

  getEmployeeName(employeeId: string): string {
    const emp = this.employees.find((e: any) => e.id === employeeId);
    return emp?.name || employeeId;
  }

  getStatusText(result: SuijiKouhoResultWithDiff): string {
    return result.isEligible ? '要提出' : '提出不要';
  }

  /**
   * 随時改定の届出提出期日を取得
   * 適用開始月の前月の月末が提出期日
   * 例：適用開始月が8月の場合、提出期日は7月31日
   */
  getSuijiReportDeadline(alert: SuijiKouhoResultWithDiff): string {
    if (!alert.applyStartMonth) {
      return '-';
    }
    
    const year = alert.year || this.getJSTDate().getFullYear();
    const applyStartMonth = alert.applyStartMonth;
    
    // 適用開始月の前月を計算
    let deadlineMonth = applyStartMonth - 1;
    let deadlineYear = year;
    
    // 1月の場合は前年の12月
    if (deadlineMonth < 1) {
      deadlineMonth = 12;
      deadlineYear = year - 1;
    }
    
    // 前月の月末日を取得
    const deadlineDate = new Date(deadlineYear, deadlineMonth, 0); // 0日目 = 前月の最終日
    
    return this.formatDate(deadlineDate);
  }

  getReasonText(result: SuijiKouhoResultWithDiff): string {
    return result.reasons.join(' / ');
  }

  isLargeChange(diff: number | null | undefined): boolean {
    if (diff == null) return false;
    return Math.abs(diff) >= 2;
  }

  getSuijiAlertId(alert: SuijiKouhoResultWithDiff): string {
    // FirestoreのドキュメントIDがあればそれを使用、なければ生成
    if (alert.id) {
      return alert.id;
    }
    return `${alert.employeeId}_${alert.changeMonth}_${alert.applyStartMonth}`;
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



