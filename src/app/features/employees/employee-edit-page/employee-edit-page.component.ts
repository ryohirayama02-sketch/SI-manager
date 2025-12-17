import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { EmployeeBasicInfoFormComponent } from './employee-basic-info-form/employee-basic-info-form.component';
import { EmployeeFamilyInfoComponent } from './employee-family-info/employee-family-info.component';
import { EmployeeHistoryComponent } from './employee-history/employee-history.component';

@Component({
  selector: 'app-employee-edit-page',
  standalone: true,
  imports: [
    CommonModule,
    EmployeeBasicInfoFormComponent,
    EmployeeFamilyInfoComponent,
    EmployeeHistoryComponent,
  ],
  templateUrl: './employee-edit-page.component.html',
  styleUrl: './employee-edit-page.component.css',
})
export class EmployeeEditPageComponent implements OnInit {
  employeeId: string | null = null;
  activeTab: 'basic' | 'family' | 'history' = 'basic';
  errorMessages: string[] = [];
  warningMessages: string[] = [];

  @ViewChild(EmployeeHistoryComponent)
  historyComponent?: EmployeeHistoryComponent;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.employeeId = this.route.snapshot.paramMap.get('id');
  }

  onSaved(): void {
    // 基本情報が保存されたとき、履歴を再読み込み（標準報酬履歴の再生成は行わない）
    if (this.historyComponent) {
      // 標準報酬履歴を再生成せず、既存の履歴を読み込むのみ
      this.historyComponent.reloadHistoriesWithoutRegeneration();
    }
  }

  onErrorMessagesChange(messages: string[]): void {
    this.errorMessages = messages;
  }

  onWarningMessagesChange(messages: string[]): void {
    this.warningMessages = messages;
  }
}
