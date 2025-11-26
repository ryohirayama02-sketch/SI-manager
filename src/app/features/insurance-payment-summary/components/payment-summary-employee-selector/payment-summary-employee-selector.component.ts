import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models/employee.model';

@Component({
  selector: 'app-payment-summary-employee-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-summary-employee-selector.component.html',
  styleUrl: './payment-summary-employee-selector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentSummaryEmployeeSelectorComponent {
  @Input() employees: Employee[] = [];
  @Input() selectedEmployeeIds: string[] = [];
  @Output() selectionChange = new EventEmitter<string[]>();
  
  isExpanded: boolean = false;

  onEmployeeToggle(employeeId: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    const isChecked = target.checked;
    let newSelection: string[];
    
    if (isChecked) {
      newSelection = [...this.selectedEmployeeIds, employeeId];
    } else {
      newSelection = this.selectedEmployeeIds.filter(id => id !== employeeId);
    }
    
    this.selectionChange.emit(newSelection);
  }

  isEmployeeSelected(employeeId: string): boolean {
    return this.selectedEmployeeIds.includes(employeeId);
  }

  selectAll(): void {
    this.selectionChange.emit(this.employees.map(emp => emp.id));
  }

  deselectAll(): void {
    this.selectionChange.emit([]);
  }
}

