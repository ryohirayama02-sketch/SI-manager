import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-annual-warning-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './annual-warning-panel.component.html',
  styleUrl: './annual-warning-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnnualWarningPanelComponent {
  @Input() warnings: string[] = [];
}

