import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models/employee.model';
import { NotificationDecisionResult } from '../../../../services/notification-decision.service';

@Component({
  selector: 'app-employee-notification-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './employee-notification-panel.component.html',
  styleUrl: './employee-notification-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeNotificationPanelComponent {
  @Input() employee: Employee | null = null;
  @Input() notifications: NotificationDecisionResult[] = [];
  @Input() getNotificationTypeLabel: (type: 'teiji' | 'suiji' | 'bonus') => string = () => '';

  isExpanded: boolean = true;

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  getNotificationTypeLabelInternal(type: 'teiji' | 'suiji' | 'bonus'): string {
    if (this.getNotificationTypeLabel) {
      return this.getNotificationTypeLabel(type);
    }
    switch (type) {
      case 'teiji':
        return '定時決定';
      case 'suiji':
        return '随時改定';
      case 'bonus':
        return '賞与支払届';
      default:
        return type;
    }
  }
}

