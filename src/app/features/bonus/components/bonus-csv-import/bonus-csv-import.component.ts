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
}

