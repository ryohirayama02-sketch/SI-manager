import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgeAlertListComponent } from './age-alert-list/age-alert-list.component';
import { QualificationChangeAlertListComponent } from './qualification-change-alert-list/qualification-change-alert-list.component';

export interface AgeAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  alertType: '70歳到達' | '75歳到達';
  notificationName: string; // 届出名前
  birthDate: string;
  reachDate: Date; // 到達日（資格喪失日）
  submitDeadline: Date; // 提出期限
  daysUntilDeadline: number; // 提出期限までの日数
}

export interface QualificationChangeAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  changeType: '氏名変更' | '住所変更' | '生年月日訂正' | '性別変更' | '所属事業所変更' | '適用区分変更';
  notificationNames: string[]; // 届出名前のリスト
  changeDate: Date; // 変更があった日
  submitDeadline: Date; // 提出期限（変更があった日から5日後）
  daysUntilDeadline: number; // 提出期限までの日数
  details: string; // 変更詳細（例：「田中太郎 → 佐藤太郎」）
}

@Component({
  selector: 'app-alert-age-tab',
  standalone: true,
  imports: [CommonModule, AgeAlertListComponent, QualificationChangeAlertListComponent],
  templateUrl: './alert-age-tab.component.html',
  styleUrl: './alert-age-tab.component.css'
})
export class AlertAgeTabComponent {
  @Input() ageAlerts: AgeAlert[] = [];
  @Input() selectedAgeAlertIds: Set<string> = new Set();
  @Input() qualificationChangeAlerts: QualificationChangeAlert[] = [];
  @Input() selectedQualificationChangeAlertIds: Set<string> = new Set();
  @Output() ageAlertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
  @Output() ageSelectAllChange = new EventEmitter<boolean>();
  @Output() ageDeleteSelected = new EventEmitter<void>();
  @Output() qualificationChangeAlertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
  @Output() qualificationChangeSelectAllChange = new EventEmitter<boolean>();
  @Output() qualificationChangeDeleteSelected = new EventEmitter<void>();
}



