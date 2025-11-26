import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertItem } from '../alerts-dashboard-page.component';

@Component({
  selector: 'app-alert-item-row',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-item-row.component.html',
  styleUrl: './alert-item-row.component.css'
})
export class AlertItemRowComponent {
  @Input() alert!: AlertItem;
}

