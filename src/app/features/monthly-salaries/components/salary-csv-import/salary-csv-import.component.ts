import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalaryItem } from '../../../../models/salary-item.model';

@Component({
  selector: 'app-salary-csv-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './salary-csv-import.component.html',
  styleUrl: './salary-csv-import.component.css'
})
export class SalaryCsvImportComponent {
  @Input() salaryItems: SalaryItem[] = [];
  @Input() csvImportResult: { type: 'success' | 'error'; message: string } | null = null;

  @Output() csvTextImport = new EventEmitter<string>();
  @Output() closeDialog = new EventEmitter<void>();

  showCsvImportDialog: boolean = false;
  csvImportText: string = '';

  onCsvFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      this.csvImportText = text;
      this.showCsvImportDialog = true;
    };
    reader.readAsText(file);
  }

  onImportClick(): void {
    if (!this.csvImportText.trim()) {
      return;
    }
    this.csvTextImport.emit(this.csvImportText);
  }

  onCloseDialog(): void {
    this.showCsvImportDialog = false;
    this.csvImportText = '';
    this.closeDialog.emit();
  }

  getCsvPlaceholder(): string {
    if (this.salaryItems.length === 0) {
      return '月,従業員,基本給,住宅手当,残業手当\n1,若林,300000,30000,20000\n1,福本,200000,30000,20000';
    }
    const header = '月,従業員,' + this.salaryItems.map(item => item.name).join(',');
    const example = '1,若林,' + this.salaryItems.map(() => '300000').join(',');
    return `${header}\n${example}\n1,福本,${this.salaryItems.map(() => '200000').join(',')}`;
  }
}



