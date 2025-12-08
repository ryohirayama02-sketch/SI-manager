import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-indicator.component.html',
  styleUrl: './loading-indicator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingIndicatorComponent {
  @Input() message: string = '集計中...';
  @Input() isLoading: boolean = false;
}

















