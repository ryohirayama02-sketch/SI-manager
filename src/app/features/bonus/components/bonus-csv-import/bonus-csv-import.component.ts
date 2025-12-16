import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-bonus-csv-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bonus-csv-import.component.html',
  styleUrl: './bonus-csv-import.component.css'
})
export class BonusCsvImportComponent {
  @Input() csvImportResult: { type: 'success' | 'error'; message: string } | null = null;

  @Output() csvFileSelected = new EventEmitter<string>();
  @Output() csvTextImport = new EventEmitter<string>();
  @Output() closeDialog = new EventEmitter<void>();

  showCsvImportDialog: boolean = false;
  csvImportText: string = '';

  onCsvFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        this.csvImportText = text;
        this.showCsvImportDialog = true;
      } else {
        console.error('CSVファイルの内容が空です。');
      }
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
    return `支給日,従業員,賞与額
2025-02-01,山田太郎,500000
2025-06-01,山田太郎,500000
2025-10-01,山田太郎,500000`;
  }
}

