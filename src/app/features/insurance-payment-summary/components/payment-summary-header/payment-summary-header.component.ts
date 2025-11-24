import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-payment-summary-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-summary-header.component.html',
  styleUrl: './payment-summary-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentSummaryHeaderComponent {
  @Input() year: number = new Date().getFullYear();
}

