import { Injectable } from '@angular/core';

/**
 * MonthlySalaryCsvImportUiService
 * 
 * 月次給与画面のCSVインポート関連ロジックを担当するサービス
 * CSVインポートの状態管理を提供
 */
@Injectable({ providedIn: 'root' })
export class MonthlySalaryCsvImportUiService {
  csvImportText: string = '';
  csvImportResult: { type: 'success' | 'error'; message: string } | null = null;

  /**
   * CSVテキストを設定する
   */
  setCsvImportText(csvText: string): void {
    this.csvImportText = csvText;
  }

  /**
   * CSVインポートを閉じる
   */
  closeCsvImport(): void {
    this.csvImportText = '';
    this.csvImportResult = null;
  }

  /**
   * CSVインポート結果を設定する
   */
  setCsvImportResult(result: {
    type: 'success' | 'error';
    message: string;
  }): void {
    this.csvImportResult = result;
    if (result.type === 'success') {
      this.csvImportText = '';
    }
  }
}




