import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertItemRowComponent } from '../alert-item-row/alert-item-row.component';
import { AlertItem } from '../alerts-dashboard-page.component';

@Component({
  selector: 'app-alert-item-list',
  standalone: true,
  imports: [CommonModule, AlertItemRowComponent],
  templateUrl: './alert-item-list.component.html',
  styleUrl: './alert-item-list.component.css'
})
export class AlertItemListComponent {
  @Input() alerts: AlertItem[] = [];
}

