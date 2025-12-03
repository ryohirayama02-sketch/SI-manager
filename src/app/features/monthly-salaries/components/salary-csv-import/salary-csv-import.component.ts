import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalaryItem } from '../../../../models/salary-item.model';
import { Employee } from '../../../../models/employee.model';
import { SalaryCalculationService } from '../../../../services/salary-calculation.service';

export interface CsvImportResult {
  type: 'success' | 'error';
  message: string;
}

export interface SalaryItemChangeEvent {
  employeeId: string;
  month: number;
  itemId: string;
  value: string | number;
}

@Component({
  selector: 'app-salary-csv-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './salary-csv-import.component.html',
  styleUrl: './salary-csv-import.component.css'
})
export class SalaryCsvImportComponent {
  @Input() salaryItems: SalaryItem[] = [];
  @Input() employees: Employee[] = [];
  @Input() csvImportResult: CsvImportResult | null = null;
  @Input() year: number = new Date().getFullYear();

  @Output() csvTextImport = new EventEmitter<string>();
  @Output() closeDialog = new EventEmitter<void>();
  @Output() salaryItemChange = new EventEmitter<SalaryItemChangeEvent>();
  @Output() salaryItemBatchChange = new EventEmitter<SalaryItemChangeEvent[]>();
  @Output() workingDaysChange = new EventEmitter<{ employeeId: string; month: number; value: number }>();
  @Output() importResult = new EventEmitter<CsvImportResult>();

  showCsvImportDialog: boolean = false;
  csvImportText: string = '';

  constructor(
    private salaryCalculationService: SalaryCalculationService
  ) {}

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

  async onImportClick(): Promise<void> {
    if (!this.csvImportText.trim()) {
      return;
    }
    await this.importFromCsvText(this.csvImportText);
  }

  onCloseDialog(): void {
    this.showCsvImportDialog = false;
    this.csvImportText = '';
    this.closeDialog.emit();
  }

  getCsvPlaceholder(): string {
    if (this.salaryItems.length === 0) {
      return '月,従業員,支払基礎日数,基本給,住宅手当,残業手当\n1,若林,20,300000,30000,20000\n1,福本,20,200000,30000,20000';
    }
    const header = '月,従業員,支払基礎日数,' + this.salaryItems.map(item => item.name).join(',');
    const example = '1,若林,20,' + this.salaryItems.map(() => '300000').join(',');
    return `${header}\n${example}\n1,福本,20,${this.salaryItems.map(() => '200000').join(',')}`;
  }

  getSalaryItemKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  getWorkingDaysKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  async importFromCsvText(csvText: string): Promise<void> {
    if (!csvText.trim()) {
      this.importResult.emit({
        type: 'error',
        message: 'CSVデータが入力されていません',
      });
      return;
    }
    try {
      const lines = csvText.split('\n').filter((line) => line.trim());
      if (lines.length < 2) {
        this.importResult.emit({
          type: 'error',
          message: 'CSVデータが不正です（最低2行必要：ヘッダー＋データ行）',
        });
        return;
      }

      // ヘッダー行をパース
      const headerLine = lines[0];
      const headerParts = headerLine.split(',').map((p) => p.trim());

      if (headerParts.length < 3) {
        this.importResult.emit({
          type: 'error',
          message: 'ヘッダー行が不正です（最低3列必要：月,従業員,項目名...）',
        });
        return;
      }

      // ヘッダーから月と従業員の列インデックスを取得
      const monthIndex = headerParts.indexOf('月');
      const employeeIndex = headerParts.indexOf('従業員');
      const workingDaysIndex = headerParts.indexOf('支払基礎日数');

      if (monthIndex === -1 || employeeIndex === -1) {
        this.importResult.emit({
          type: 'error',
          message: 'ヘッダーに「月」と「従業員」の列が必要です',
        });
        return;
      }

      // 給与項目名の列インデックスを取得（月、従業員、支払基礎日数以外）
      const salaryItemColumns: { index: number; name: string }[] = [];
      for (let i = 0; i < headerParts.length; i++) {
        if (i !== monthIndex && i !== employeeIndex && i !== workingDaysIndex) {
          salaryItemColumns.push({ index: i, name: headerParts[i] });
        }
      }

      if (salaryItemColumns.length === 0) {
        this.importResult.emit({
          type: 'error',
          message: '給与項目が見つかりません',
        });
        return;
      }

      // データ行を処理
      const dataLines = lines.slice(1);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // バッチ処理用のイベント配列
      const batchEvents: Array<{
        employeeId: string;
        month: number;
        itemId: string;
        value: number;
      }> = [];

      // デバッグ: 給与項目マスタの一覧をログ出力
      console.log('[CSV Import] 給与項目マスタ:', this.salaryItems.map(item => ({ id: item.id, name: item.name, type: item.type })));
      console.log('[CSV Import] CSVヘッダー:', headerParts);
      console.log('[CSV Import] 給与項目列:', salaryItemColumns.map(col => col.name));

      for (const line of dataLines) {
        const parts = line.split(',').map((p) => p.trim());

        if (parts.length < headerParts.length) {
          errorCount++;
          errors.push(`行「${line}」: 列数が不足しています（期待: ${headerParts.length}, 実際: ${parts.length}）`);
          continue;
        }

        // 月を取得
        const monthStr = parts[monthIndex];
        const month = parseInt(monthStr, 10);

        if (isNaN(month) || month < 1 || month > 12) {
          errorCount++;
          errors.push(`行「${line}」: 月が不正です（1〜12の範囲）: ${monthStr}`);
          continue;
        }

        // 従業員名を取得
        const employeeName = parts[employeeIndex];
        const employee = this.employees.find(
          (emp) => emp.name === employeeName
        );

        if (!employee) {
          errorCount++;
          errors.push(
            `行「${line}」: 従業員「${employeeName}」が見つかりません（登録済み: ${this.employees.map(e => e.name).join(', ')}）`
          );
          continue;
        }

        // 支払基礎日数を取得（オプション）
        if (workingDaysIndex !== -1 && parts[workingDaysIndex]) {
          const workingDaysStr = parts[workingDaysIndex];
          const workingDays = parseInt(workingDaysStr, 10);
          if (!isNaN(workingDays) && workingDays >= 0 && workingDays <= 31) {
            this.workingDaysChange.emit({
              employeeId: employee.id,
              month: month,
              value: workingDays
            });
          }
        }

        // 各給与項目の金額を設定
        for (const itemColumn of salaryItemColumns) {
          const amountStr = parts[itemColumn.index];
          const amount = parseFloat(amountStr.replace(/,/g, '')) || 0;

          // 給与項目名から給与項目IDを取得（完全一致）
          let salaryItem = this.salaryItems.find(
            (item) => item.name === itemColumn.name
          );

          // 完全一致しない場合、部分一致で検索（「基本給」→「基本給 (固定)」など）
          if (!salaryItem) {
            salaryItem = this.salaryItems.find(
              (item) => item.name.includes(itemColumn.name) || itemColumn.name.includes(item.name)
            );
          }

          // それでも見つからない場合、よくある別名で検索
          if (!salaryItem) {
            const nameMap: { [key: string]: string[] } = {
              '基本給': ['基本給', '基本給 (固定)', '基本給(固定)'],
              '欠勤控除': ['欠勤控除', '欠勤控除 (非固定)', '欠勤控除(非固定)', '欠勤控除 (控除)', '欠勤控除(控除)'],
              '残業手当': ['残業手当', '残業手当 (非固定)', '残業手当(非固定)', '残業代', '残業代 (非固定)'],
              '手当': ['手当', '手当 (固定)', '手当(固定)', '住宅手当', '住宅手当 (固定)'],
            };
            
            const possibleNames = nameMap[itemColumn.name] || [itemColumn.name];
            for (const possibleName of possibleNames) {
              salaryItem = this.salaryItems.find(item => item.name === possibleName);
              if (salaryItem) break;
            }
          }

          if (!salaryItem) {
            errorCount++;
            const availableItems = this.salaryItems.map(item => item.name).join(', ');
            errors.push(
              `行「${line}」: 給与項目「${itemColumn.name}」が見つかりません（利用可能: ${availableItems}）`
            );
            continue;
          }

          // バッチ処理用にイベントを配列に追加
          batchEvents.push({
            employeeId: employee.id,
            month: month,
            itemId: salaryItem.id,
            value: amount,
          });

          successCount++;
        }
      }
      
      // バッチ処理: すべてのイベントを一度に発火
      console.log(`[CSV Import] バッチ処理開始: ${batchEvents.length}件のイベント`);
      if (batchEvents.length > 0) {
        // バッチ更新イベントを発火（親コンポーネントで一括処理）
        this.salaryItemBatchChange.emit(batchEvents);
      }
      console.log(`[CSV Import] バッチ処理完了`);

      // 結果メッセージ
      console.log('[CSV Import] 処理結果:', { successCount, errorCount, errors });
      
      if (errorCount > 0) {
        const errorMessages = errors.slice(0, 10).join('\n');
        const remainingErrors = errors.length > 10 ? `\n...他${errors.length - 10}件のエラー` : '';
        this.importResult.emit({
          type: 'error',
          message: `${successCount}件のインポートに成功しましたが、${errorCount}件のエラーがあります。\n\n${errorMessages}${remainingErrors}`,
        });
      } else {
        this.importResult.emit({
          type: 'success',
          message: `${successCount}件のデータをインポートしました`,
        });
        this.csvImportText = '';
      }
    } catch (error) {
      console.error('CSVインポートエラー:', error);
      this.importResult.emit({
        type: 'error',
        message: `インポート中にエラーが発生しました: ${error}`,
      });
    }
  }
}
