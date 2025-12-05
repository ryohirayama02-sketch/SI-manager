import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { SettingsService } from '../../services/settings.service';
import {
  BonusCalculationService,
  BonusCalculationResult,
} from '../../services/bonus-calculation.service';
import { SalaryCalculationService } from '../../services/salary-calculation.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { BonusNotificationService } from '../../services/bonus-notification.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';
import { BonusCsvImportComponent } from './components/bonus-csv-import/bonus-csv-import.component';
import { RoomIdService } from '../../services/room-id.service';

interface BonusColumn {
  id: string; // 列の一意ID
  payDate: string; // 賞与支給日（YYYY-MM-DD）
}

@Component({
  selector: 'app-bonus-page',
  standalone: true,
  imports: [CommonModule, FormsModule, BonusCsvImportComponent],
  templateUrl: './bonus-page.component.html',
  styleUrl: './bonus-page.component.css',
})
export class BonusPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  // 賞与入力列の情報（支給日付）
  bonusColumns: BonusColumn[] = [];
  // 賞与データ: { columnId_employeeId: amount }
  bonusData: { [key: string]: number } = {};
  year: number = new Date().getFullYear();
  availableYears: number[] = [];
  rates: any = null;
  prefecture: string = 'tokyo';

  // CSVインポート関連
  csvImportText: string = '';
  csvImportResult: { type: 'success' | 'error'; message: string } | null = null;
  // 加入区分購読用
  eligibilitySubscription: Subscription | null = null;
  // 免除月情報（従業員IDをキーとする）
  exemptMonths: { [employeeId: string]: number[] } = {};
  // 免除理由情報（従業員ID_月をキーとする）
  exemptReasons: { [key: string]: string } = {};

  // 保存中フラグ
  isSaving: boolean = false;

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private settingsService: SettingsService,
    private bonusCalculationService: BonusCalculationService,
    private salaryCalculationService: SalaryCalculationService,
    private employeeEligibilityService: EmployeeEligibilityService,
    private bonusNotificationService: BonusNotificationService,
    private roomIdService: RoomIdService
  ) {
    // 年度選択用の年度リストを生成（2023〜2026）
    for (let y = 2023; y <= 2026; y++) {
      this.availableYears.push(y);
    }
  }

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    this.rates = await this.settingsService.getRates(
      this.year.toString(),
      this.prefecture
    );

    await this.loadExistingBonuses();

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService
      .observeEligibility()
      .subscribe(() => {
        // 加入区分が変更された場合の処理（必要に応じて実装）
      });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  getBonusKey(columnId: string, employeeId: string): string {
    return `${columnId}_${employeeId}`;
  }

  /**
   * 賞与入力列を追加
   */
  addBonusColumn(): void {
    // 既存の列IDをチェックして、一意のIDを生成
    let newId: string;
    let counter = 1;
    do {
      const timestamp = Date.now() + counter;
      newId = `col_new_${timestamp}`;
      counter++;
    } while (this.bonusColumns.some((col) => col.id === newId));

    const newColumn: BonusColumn = {
      id: newId,
      payDate: '', // 初期値は空（ユーザーが選択）
    };
    this.bonusColumns.push(newColumn);
  }

  /**
   * 賞与入力列を削除
   */
  async removeBonusColumn(columnId: string): Promise<void> {
    const column = this.bonusColumns.find((col) => col.id === columnId);
    if (!column) return;

    // 確認ダイアログを表示
    const confirmMessage = column.payDate
      ? `支給日「${column.payDate}」の賞与入力列を削除しますか？\nこの列のすべての賞与データが削除されます。`
      : 'この賞与入力列を削除しますか？';

    if (!confirm(confirmMessage)) {
      return; // ユーザーがキャンセルした場合は処理を中断
    }

    // 支給日付が設定されている場合は、Firestoreからも削除
    if (column.payDate) {
      const payDate = new Date(column.payDate);
      const year = payDate.getFullYear();

      // 各従業員の該当する賞与データを削除
      for (const emp of this.employees) {
        const bonuses = await this.bonusService.getBonusesByYear(emp.id, year);
        const bonusToDelete = bonuses.find((b) => {
          const bPayDate = new Date(b.payDate);
          return bPayDate.getTime() === payDate.getTime();
        });

        if (bonusToDelete && bonusToDelete.id) {
          await this.bonusService.deleteBonus(year, emp.id, bonusToDelete.id);
        }
      }
    }

    // 列を削除
    this.bonusColumns = this.bonusColumns.filter((col) => col.id !== columnId);

    // 関連する賞与データも削除
    for (const emp of this.employees) {
      const key = this.getBonusKey(columnId, emp.id);
      delete this.bonusData[key];
    }
  }

  /**
   * 支給日付変更時の処理
   */
  onPayDateChange(columnId: string, payDate: string): void {
    const column = this.bonusColumns.find((col) => col.id === columnId);
    if (column) {
      column.payDate = payDate;
    }
  }

  /**
   * 賞与額変更時の処理
   */
  onBonusChange(columnId: string, employeeId: string, value: number): void {
    const key = this.getBonusKey(columnId, employeeId);
    this.bonusData[key] = value;
  }

  /**
   * 賞与額を取得
   */
  getBonusAmount(columnId: string, employeeId: string): number {
    const key = this.getBonusKey(columnId, employeeId);
    return this.bonusData[key] ?? 0;
  }

  /**
   * 金額をフォーマット
   */
  formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || value === 0) {
      return '';
    }
    return value.toLocaleString('ja-JP');
  }

  /**
   * 金額をパース
   */
  parseAmount(value: string): number {
    const numStr = value.replace(/,/g, '');
    const num = parseInt(numStr, 10);
    return isNaN(num) ? 0 : num;
  }

  /**
   * 入力時の処理
   */
  onBonusInput(columnId: string, employeeId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const numValue = this.parseAmount(value);
    this.onBonusChange(columnId, employeeId, numValue);

    // カンマ付きで表示を更新
    input.value = this.formatAmount(numValue);
  }

  /**
   * フォーカスアウト時の処理
   */
  onBonusBlur(columnId: string, employeeId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const numValue = this.parseAmount(input.value);
    input.value = this.formatAmount(numValue);
  }

  /**
   * 免除月かどうかを判定
   */
  isExemptMonth(employeeId: string, payDate: string): boolean {
    if (!payDate) return false;

    const date = new Date(payDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    return this.exemptMonths[employeeId]?.includes(month) ?? false;
  }

  /**
   * 免除理由ラベルを取得
   */
  getExemptReason(employeeId: string, payDate: string): string {
    if (!payDate) return '';

    const date = new Date(payDate);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const key = `${employeeId}_${month}`;
    const reason = this.exemptReasons[key] || '';

    if (reason.includes('産前産後休業')) {
      return '産休中';
    } else if (reason.includes('育児休業')) {
      return '育休中';
    }
    return '免除中';
  }

  async onYearChange(): Promise<void> {
    // 年度変更時にデータを再読み込み
    this.rates = await this.settingsService.getRates(
      this.year.toString(),
      this.prefecture
    );
    await this.loadExistingBonuses();
  }

  /**
   * 既存の賞与データを読み込む
   */
  async loadExistingBonuses(): Promise<void> {
    // 既存の列とデータをクリア
    this.bonusColumns = [];
    this.bonusData = {};

    // 既存の賞与データを取得して列として表示
    const allBonuses: { [payDate: string]: Bonus[] } = {};
    const payDateSet = new Set<string>();

    for (const emp of this.employees) {
      const bonuses = await this.bonusService.loadBonus(this.year, emp.id);

      for (const bonus of bonuses) {
        const payDate = bonus.payDate || '';
        if (!payDate) continue;

        payDateSet.add(payDate);

        if (!allBonuses[payDate]) {
          allBonuses[payDate] = [];
        }
        allBonuses[payDate].push(bonus);
      }
    }

    // 支給日付ごとに列を作成（ソート済み）
    const payDates = Array.from(payDateSet).sort();
    for (const payDate of payDates) {
      // 列IDは支給日付ベースで統一（一意性を保つため）
      const column: BonusColumn = {
        id: `col_${payDate.replace(/-/g, '')}`,
        payDate: payDate,
      };
      this.bonusColumns.push(column);

      // 各従業員の賞与額を設定
      const bonusesForDate = allBonuses[payDate];
      for (const bonus of bonusesForDate) {
        const key = this.getBonusKey(column.id, bonus.employeeId);
        this.bonusData[key] = bonus.amount || 0;
      }
    }

    // 免除月を構築
    this.buildExemptMonths();
  }

  /**
   * 免除月を構築
   */
  buildExemptMonths(): void {
    this.exemptMonths = {};
    this.exemptReasons = {};

    for (const emp of this.employees) {
      this.exemptMonths[emp.id] = [];

      // 各列の支給日付から月を取得して免除判定
      for (const column of this.bonusColumns) {
        if (!column.payDate) continue;

        const date = new Date(column.payDate);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        const exemptResult =
          this.salaryCalculationService.getExemptReasonForMonth(
            emp,
            year,
            month
          );

        if (exemptResult.exempt) {
          if (!this.exemptMonths[emp.id].includes(month)) {
            this.exemptMonths[emp.id].push(month);
          }
          const key = `${emp.id}_${month}`;
          this.exemptReasons[key] = exemptResult.reason;
        }
      }
    }
  }

  /**
   * 賞与データを保存
   */
  async saveAllBonuses(): Promise<void> {
    // 保存中フラグを設定
    this.isSaving = true;

    try {
      // 支給日付が設定されていない列があるかチェック
      for (const column of this.bonusColumns) {
        if (!column.payDate) {
          alert(
            `支給日付が設定されていない列があります。すべての列に支給日付を設定してください。`
          );
          this.isSaving = false;
          return;
        }
      }

      // 現在の列の支給日付のセットを作成
      const currentPayDates = new Set(
        this.bonusColumns.map((col) => col.payDate).filter((d) => d)
      );

      // 各従業員について処理
      for (const emp of this.employees) {
        // 既存の賞与データを取得
        const existingBonuses = await this.bonusService.getBonusesByYear(
          emp.id,
          this.year
        );

        // 現在の列に存在しない支給日付のデータを削除
        for (const existingBonus of existingBonuses) {
          if (!existingBonus.payDate) continue;
          if (!currentPayDates.has(existingBonus.payDate)) {
            // 現在の列に存在しない支給日付のデータを削除
            if (existingBonus.id) {
              await this.bonusService.deleteBonus(
                this.year,
                emp.id,
                existingBonus.id
              );
            }
          }
        }

        // 現在の列のデータを保存
        for (const column of this.bonusColumns) {
          if (!column.payDate) continue;

          const payDate = new Date(column.payDate);
          const year = payDate.getFullYear();
          const month = payDate.getMonth() + 1;

          const key = this.getBonusKey(column.id, emp.id);
          let amount = this.bonusData[key] || 0;

          // 免除月の場合は0として明示的に保存
          if (this.isExemptMonth(emp.id, column.payDate)) {
            amount = 0;
          }

          // 既存の賞与データを取得（createdAtを保持するため）
          const existingBonus = existingBonuses.find((b) => {
            if (!b.payDate) return false;
            const bPayDate = new Date(b.payDate);
            return bPayDate.getTime() === payDate.getTime();
          });

          // 保存前チェック：過去12か月の賞与件数が4回目になるかどうか
          // 新規保存の場合のみチェック（既存の賞与を更新する場合はチェックしない）
          if (
            !existingBonus &&
            (amount > 0 || this.isExemptMonth(emp.id, column.payDate))
          ) {
            const isFourthBonus =
              await this.bonusNotificationService.isFourthBonusInLast12Months(
                emp.id,
                payDate
              );

            if (isFourthBonus) {
              alert(
                `${emp.name}の賞与が年4回目です。4回目以降は月次給与として入力してください。`
              );
              this.isSaving = false;
              return;
            }
          }

          // 賞与額が0より大きい場合、または免除月で0として保存する場合
          if (amount > 0 || this.isExemptMonth(emp.id, column.payDate)) {
            const employee = this.employees.find((e) => e.id === emp.id);
            if (!employee) continue;

            // 賞与を計算
            const calculationResult =
              await this.bonusCalculationService.calculateBonus(
                employee,
                emp.id,
                amount,
                column.payDate,
                year
              );

            if (!calculationResult) {
              console.error(
                `賞与計算に失敗: 従業員ID=${emp.id}, 支給日=${column.payDate}, 賞与額=${amount}`
              );
              continue;
            }

            // createdAtの処理
            let createdAtValue: any = undefined;
            if (existingBonus?.createdAt) {
              try {
                if (
                  existingBonus.createdAt &&
                  typeof existingBonus.createdAt === 'object' &&
                  'toDate' in existingBonus.createdAt &&
                  typeof (existingBonus.createdAt as any).toDate === 'function'
                ) {
                  createdAtValue = (existingBonus.createdAt as any).toDate();
                } else if (existingBonus.createdAt instanceof Date) {
                  createdAtValue = existingBonus.createdAt;
                }
              } catch (error) {
                console.warn(`[bonus-page] createdAtの変換エラー:`, error);
              }
            }

            const roomId = this.roomIdService.requireRoomId();
            const bonus: Bonus = {
              roomId: roomId,
              employeeId: emp.id,
              year: year,
              month: month,
              amount: amount,
              payDate: column.payDate,
              createdAt: createdAtValue,
              isExempt: calculationResult.isExempted || false,
              cappedHealth: calculationResult.cappedBonusHealth || 0,
              cappedPension: calculationResult.cappedBonusPension || 0,
              healthEmployee: calculationResult.healthEmployee,
              healthEmployer: calculationResult.healthEmployer,
              careEmployee: calculationResult.careEmployee,
              careEmployer: calculationResult.careEmployer,
              pensionEmployee: calculationResult.pensionEmployee,
              pensionEmployer: calculationResult.pensionEmployer,
              standardBonusAmount: calculationResult.standardBonus,
              cappedBonusHealth: calculationResult.cappedBonusHealth,
              cappedBonusPension: calculationResult.cappedBonusPension,
              isExempted: calculationResult.isExempted,
              isRetiredNoLastDay: calculationResult.isRetiredNoLastDay,
              isOverAge70: calculationResult.isOverAge70,
              isOverAge75: calculationResult.isOverAge75,
              requireReport: calculationResult.requireReport,
              reportDeadline: calculationResult.reportDeadline || undefined,
              isSalaryInsteadOfBonus: calculationResult.isSalaryInsteadOfBonus,
              exemptReason: calculationResult.exemptReason || undefined,
            };

            await this.bonusService.saveBonus(year, bonus);
          } else {
            // 賞与額が0で、免除月でない場合は、既存データがあれば削除
            if (existingBonus && existingBonus.id) {
              await this.bonusService.deleteBonus(
                year,
                emp.id,
                existingBonus.id
              );
            }
          }
        }
      }

      // 保存完了メッセージを表示
      alert('賞与データを保存しました');
    } catch (error) {
      alert('保存に失敗しました。もう一度お試しください。');
      console.error('保存エラー:', error);
    } finally {
      // 保存処理完了後、少し遅延させてフラグをクリア
      setTimeout(() => {
        this.isSaving = false;
      }, 500);
    }
  }

  // CSVインポート処理
  async onCsvTextImport(csvText: string): Promise<void> {
    this.csvImportText = csvText;
    await this.importFromCsvText(csvText);
  }

  onCsvImportClose(): void {
    this.csvImportText = '';
    this.csvImportResult = null;
  }

  async importFromCsvText(csvText?: string): Promise<void> {
    const textToImport = csvText || this.csvImportText;

    if (!textToImport.trim()) {
      this.csvImportResult = {
        type: 'error',
        message: 'CSVデータが入力されていません',
      };
      return;
    }

    try {
      // 空行を除外して行を分割
      const lines = textToImport
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length < 2) {
        this.csvImportResult = {
          type: 'error',
          message: 'CSVデータが不正です（最低2行必要：ヘッダー＋データ行）',
        };
        return;
      }

      // ヘッダー行をパース
      const headerLine = lines[0];
      const headerParts = headerLine.split(',').map((p) => p.trim());

      console.log('[bonus-page] CSVヘッダー:', headerParts);

      if (headerParts.length < 3) {
        this.csvImportResult = {
          type: 'error',
          message: 'ヘッダー行が不正です（3列必要：支給日,従業員,賞与額）',
        };
        return;
      }

      // ヘッダーから各列のインデックスを取得
      const payDateIndex = headerParts.indexOf('支給日');
      const employeeIndex = headerParts.indexOf('従業員');
      const bonusAmountIndex = headerParts.indexOf('賞与額');

      console.log('[bonus-page] CSV列インデックス:', {
        payDateIndex,
        employeeIndex,
        bonusAmountIndex,
      });

      if (
        payDateIndex === -1 ||
        employeeIndex === -1 ||
        bonusAmountIndex === -1
      ) {
        this.csvImportResult = {
          type: 'error',
          message: 'ヘッダーに「支給日」「従業員」「賞与額」の列が必要です',
        };
        return;
      }

      // データ行を処理
      const dataLines = lines.slice(1);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const payDateColumns: { [payDate: string]: BonusColumn } = {};

      console.log(
        '[bonus-page] 従業員リスト:',
        this.employees.map((emp) => emp.name)
      );
      console.log('[bonus-page] 処理するデータ行数:', dataLines.length);

      for (const line of dataLines) {
        const parts = line.split(',').map((p) => p.trim());

        console.log('[bonus-page] 処理中の行:', line, '→ パース結果:', parts);

        if (parts.length < headerParts.length) {
          errorCount++;
          errors.push(
            `行「${line}」: 列数が不足しています（期待: ${headerParts.length}列、実際: ${parts.length}列）`
          );
          continue;
        }

        // 支給日を取得
        const payDateStr = parts[payDateIndex];
        console.log('[bonus-page] 支給日文字列:', payDateStr);

        if (!payDateStr || !payDateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          errorCount++;
          errors.push(
            `行「${line}」: 支給日が不正です（YYYY-MM-DD形式が必要。実際の値: "${payDateStr}"）`
          );
          continue;
        }

        // 支給日に対応する列を取得または作成
        let column = payDateColumns[payDateStr];
        if (!column) {
          // 既存の列を支給日付で検索
          const existingColumn = this.bonusColumns.find(
            (col) => col.payDate === payDateStr
          );
          if (existingColumn) {
            // 既存の列がある場合はそれを使用（ただしIDを統一）
            column = existingColumn;
            // 列IDが支給日付ベースでない場合は更新
            const correctId = `col_${payDateStr.replace(/-/g, '')}`;
            if (column.id !== correctId) {
              // 既存のデータを新しいIDに移行
              const oldId = column.id;
              column.id = correctId;

              // 既存のbonusDataを新しいIDに移行
              for (const emp of this.employees) {
                const oldKey = this.getBonusKey(oldId, emp.id);
                const newKey = this.getBonusKey(correctId, emp.id);
                if (this.bonusData[oldKey] !== undefined) {
                  this.bonusData[newKey] = this.bonusData[oldKey];
                  delete this.bonusData[oldKey];
                }
              }

              console.log('[bonus-page] 既存の列のIDを更新:', {
                oldId,
                newId: correctId,
              });
            }
            payDateColumns[payDateStr] = column;
            console.log('[bonus-page] 既存の列を使用:', column);
          } else {
            // 新しい列を作成
            column = {
              id: `col_${payDateStr.replace(/-/g, '')}`,
              payDate: payDateStr,
            };
            payDateColumns[payDateStr] = column;
            this.bonusColumns.push(column);
            console.log('[bonus-page] 新しい列を追加:', column);
          }
        }

        // 従業員名を取得
        const employeeName = parts[employeeIndex];
        console.log('[bonus-page] 従業員名:', employeeName);

        const employee = this.employees.find(
          (emp) => emp.name === employeeName
        );

        if (!employee) {
          errorCount++;
          const availableNames = this.employees
            .map((emp) => emp.name)
            .join(', ');
          errors.push(
            `行「${line}」: 従業員「${employeeName}」が見つかりません。利用可能な従業員: ${availableNames}`
          );
          continue;
        }

        // 賞与額を取得
        const bonusAmountStr = parts[bonusAmountIndex];
        const bonusAmount = this.parseAmount(bonusAmountStr);

        console.log(
          '[bonus-page] 賞与額文字列:',
          bonusAmountStr,
          '→ 数値:',
          bonusAmount
        );

        if (isNaN(bonusAmount) || bonusAmount < 0) {
          errorCount++;
          errors.push(
            `行「${line}」: 賞与額が不正です（実際の値: "${bonusAmountStr}"）`
          );
          continue;
        }

        // bonusDataに値を設定
        const key = this.getBonusKey(column.id, employee.id);
        this.bonusData[key] = bonusAmount;
        console.log('[bonus-page] 賞与データを設定:', {
          key,
          amount: bonusAmount,
          employeeName: employee.name,
          payDate: payDateStr,
        });

        successCount++;
      }

      // 免除月を再構築
      this.buildExemptMonths();

      // 結果メッセージ
      if (errorCount > 0) {
        this.csvImportResult = {
          type: 'error',
          message: `${successCount}件のインポートに成功しましたが、${errorCount}件のエラーがあります。${errors
            .slice(0, 5)
            .join(' / ')}${errors.length > 5 ? ' ...' : ''}`,
        };
      } else {
        this.csvImportResult = {
          type: 'success',
          message: `${successCount}件のデータをインポートしました`,
        };
        this.csvImportText = '';
      }

      console.log('[bonus-page] CSVインポート完了:', {
        successCount,
        errorCount,
        errors,
      });
    } catch (error) {
      console.error('CSVインポートエラー:', error);
      this.csvImportResult = {
        type: 'error',
        message: `インポート中にエラーが発生しました: ${error}`,
      };
    }
  }
}
