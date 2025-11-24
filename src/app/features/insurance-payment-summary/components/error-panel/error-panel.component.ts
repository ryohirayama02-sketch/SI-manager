import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models/employee.model';

@Component({
  selector: 'app-error-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error-panel.component.html',
  styleUrl: './error-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorPanelComponent {
  @Input() employees: Employee[] = [];
  @Input() errorMessages: { [employeeId: string]: string[] } = {};
  @Input() warningMessages: { [employeeId: string]: string[] } = {};

  isExpanded: boolean = true;

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  hasAnyMessages(): boolean {
    return this.employees.some(emp => 
      (this.errorMessages[emp.id]?.length ?? 0) > 0 ||
      (this.warningMessages[emp.id]?.length ?? 0) > 0
    );
  }
}

