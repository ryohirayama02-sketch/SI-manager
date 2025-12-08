import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models/employee.model';

@Component({
  selector: 'app-error-warning-section',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error-warning-section.component.html',
  styleUrl: './error-warning-section.component.css'
})
export class ErrorWarningSectionComponent {
  @Input() employees: Employee[] = [];
  @Input() errorMessages: { [employeeId: string]: string[] } = {};
  @Input() warningMessages: { [employeeId: string]: string[] } = {};
}















