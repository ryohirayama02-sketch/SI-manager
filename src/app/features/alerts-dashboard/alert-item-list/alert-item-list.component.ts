import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertItem } from '../alerts-dashboard-page.component';

@Component({
  selector: 'app-alert-item-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-item-list.component.html',
  styleUrl: './alert-item-list.component.css'
})
export class AlertItemListComponent {
  @Input() alerts: AlertItem[] = [];
  @Input() selectedAlertIds: Set<string> = new Set();
  @Input() onToggleSelection: (alertId: string) => void = () => {};
  @Input() onToggleAll: (checked: boolean) => void = () => {};
  @Input() onDeleteSelected: () => void = () => {};
  @Input() isSelected: (alertId: string) => boolean = () => false;

  onToggleAllChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.onToggleAll(target.checked);
  }
}

