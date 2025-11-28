import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Bonus } from '../../../../models/bonus.model';

@Component({
  selector: 'app-bonus-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './bonus-list.component.html',
  styleUrl: './bonus-list.component.css'
})
export class BonusListComponent {
  @Input() filteredBonuses: Bonus[] = [];
  @Input() year: number = new Date().getFullYear();
  @Input() selectedEmployeeId: string = '';

  @Output() deleteBonus = new EventEmitter<Bonus>();
  @Output() reloadList = new EventEmitter<void>();

  formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || value === 0) {
      return '';
    }
    return value.toLocaleString('ja-JP');
  }

  getBonusTotal(bonus: Bonus): number {
    const healthTotal = (bonus.healthEmployee || 0) + (bonus.healthEmployer || 0);
    const careTotal = (bonus.careEmployee || 0) + (bonus.careEmployer || 0);
    const pensionTotal = (bonus.pensionEmployee || 0) + (bonus.pensionEmployer || 0);
    return healthTotal + careTotal + pensionTotal;
  }

  getExemptNote(bonus: Bonus): string {
    if (bonus.exemptReason) {
      if (bonus.exemptReason.includes('産前産後休業中')) {
        return '免除：産休中';
      } else if (bonus.exemptReason.includes('育児休業中')) {
        return '免除：育休中';
      }
      return '免除中';
    }
    return '免除中';
  }

  onDeleteBonus(bonus: Bonus): void {
    this.deleteBonus.emit(bonus);
  }
}

