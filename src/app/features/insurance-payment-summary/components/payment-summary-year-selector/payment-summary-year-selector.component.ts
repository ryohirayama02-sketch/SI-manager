import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-payment-summary-year-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-summary-year-selector.component.html',
  styleUrl: './payment-summary-year-selector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentSummaryYearSelectorComponent {
  @Input() year: number = new Date().getFullYear();
  @Output() yearChange = new EventEmitter<number>();

  onYearChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newYear = parseInt(target.value, 10);
    this.yearChange.emit(newYear);
  }

  getAvailableYears(): number[] {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = currentYear - 5; i <= currentYear + 1; i++) {
      years.push(i);
    }
    return years;
  }
}

