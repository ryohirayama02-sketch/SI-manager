import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { SettingsService } from '../../services/settings.service';
import { BonusCalculationService, BonusCalculationResult } from '../../services/bonus-calculation.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';
import { BonusInputTableComponent } from './components/bonus-input-table/bonus-input-table.component';
import { BonusCsvImportComponent } from './components/bonus-csv-import/bonus-csv-import.component';


@Component({
  selector: 'app-bonus-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BonusInputTableComponent,
    BonusCsvImportComponent
  ],
  templateUrl: './bonus-page.component.html',
  styleUrl: './bonus-page.component.css'
})
export class BonusPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // 賞与データ: { employeeId_month: amount }
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

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private settingsService: SettingsService,
    private bonusCalculationService: BonusCalculationService,
    private employeeEligibilityService: EmployeeEligibilityService
  ) {
    // 年度選択用の年度リストを生成（2023〜2026）
    for (let y = 2023; y <= 2026; y++) {
      this.availableYears.push(y);
    }
  }

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);

    // 全従業員×全月のbonusDataオブジェクトを初期化
    for (const emp of this.employees) {
      for (const month of this.months) {
        const key = this.getBonusKey(emp.id, month);
        if (!this.bonusData[key]) {
          this.bonusData[key] = 0;
        }
      }
    }

    await this.loadExistingBonuses();

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService.observeEligibility().subscribe(() => {
      // 加入区分が変更された場合の処理（必要に応じて実装）
    });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  getBonusKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  async onYearChange(): Promise<void> {
    // 年度変更時にデータを再読み込み
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    await this.loadExistingBonuses();
  }

  async loadExistingBonuses(): Promise<void> {
    // 既存の賞与データをクリア
    for (const emp of this.employees) {
      for (const month of this.months) {
        const key = this.getBonusKey(emp.id, month);
        this.bonusData[key] = 0;
      }
    }

    // 既存の賞与データを読み込む
    const bonuses = await this.bonusService.loadBonus(this.year);
    for (const bonus of bonuses) {
      const key = this.getBonusKey(bonus.employeeId, bonus.month);
      this.bonusData[key] = bonus.amount || 0;
    }
  }

  async onBonusChange(event: { employeeId: string; month: number; value: number }): Promise<void> {
    const { employeeId, month, value } = event;
    const key = this.getBonusKey(employeeId, month);
    this.bonusData[key] = value;
  }

  async saveAllBonuses(): Promise<void> {
    for (const emp of this.employees) {
      for (const month of this.months) {
        const key = this.getBonusKey(emp.id, month);
        const amount = this.bonusData[key] || 0;

        if (amount > 0) {
          // 賞与額が入力されている場合のみ保存
          const employee = this.employees.find(e => e.id === emp.id);
          if (!employee) continue;

          const paymentDate = `${this.year}-${String(month).padStart(2, '0')}-01`;

          // 賞与を計算
          const calculationResult = await this.bonusCalculationService.calculateBonus(
            employee,
            emp.id,
            amount,
            paymentDate,
            this.year
          );

          if (!calculationResult) {
            console.error(`賞与計算に失敗: 従業員ID=${emp.id}, 月=${month}, 賞与額=${amount}`);
            continue;
          }

          // Bonusオブジェクトを作成
          const bonus: Bonus = {
            employeeId: emp.id,
            year: this.year,
            month: month,
            amount: amount,
            payDate: paymentDate,
            createdAt: new Date(),
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
            exemptReason: calculationResult.exemptReason || undefined
          };

          await this.bonusService.saveBonus(this.year, bonus);
        } else {
          // 賞与額が0の場合は、既存データがあれば削除
          const existingBonuses = await this.bonusService.getBonusesByYear(emp.id, this.year);
          const existingBonus = existingBonuses.find(b => b.month === month);
          if (existingBonus && existingBonus.id) {
            await this.bonusService.deleteBonus(this.year, emp.id, existingBonus.id);
          }
        }
      }
    }

    alert('賞与データを保存しました');
  }


  // CSVインポート処理（フォーマット: 月,従業員,賞与額）
  async onCsvTextImport(csvText: string): Promise<void> {
    this.csvImportText = csvText;
    await this.importFromCsvText(csvText);
  }

  onCsvImportClose(): void {
    this.csvImportText = '';
    this.csvImportResult = null;
  }

  parseAmount(value: string): number {
    // カンマを削除して数値に変換
    const numStr = value.replace(/,/g, '');
    const num = parseInt(numStr, 10);
    return isNaN(num) ? 0 : num;
  }

  async importFromCsvText(csvText?: string): Promise<void> {
    // 引数が渡されていない場合は、プロパティから取得
    const textToImport = csvText || this.csvImportText;
    
    if (!textToImport.trim()) {
      this.csvImportResult = { type: 'error', message: 'CSVデータが入力されていません' };
      return;
    }

    try {
      const lines = textToImport.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        this.csvImportResult = { type: 'error', message: 'CSVデータが不正です（最低2行必要：ヘッダー＋データ行）' };
        return;
      }

      // ヘッダー行をパース
      const headerLine = lines[0];
      const headerParts = headerLine.split(',').map(p => p.trim());
      
      if (headerParts.length < 3) {
        this.csvImportResult = { type: 'error', message: 'ヘッダー行が不正です（3列必要：月,従業員,賞与額）' };
        return;
      }

      // ヘッダーから各列のインデックスを取得
      const monthIndex = headerParts.indexOf('月');
      const employeeIndex = headerParts.indexOf('従業員');
      const bonusAmountIndex = headerParts.indexOf('賞与額');
      
      if (monthIndex === -1 || employeeIndex === -1 || bonusAmountIndex === -1) {
        this.csvImportResult = { type: 'error', message: 'ヘッダーに「月」「従業員」「賞与額」の列が必要です' };
        return;
      }

      // データ行を処理
      const dataLines = lines.slice(1);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const line of dataLines) {
        const parts = line.split(',').map(p => p.trim());
        
        if (parts.length < headerParts.length) {
          errorCount++;
          errors.push(`行「${line}」: 列数が不足しています`);
          continue;
        }

        // 月を取得
        const monthStr = parts[monthIndex];
        const month = parseInt(monthStr, 10);
        
        if (isNaN(month) || month < 1 || month > 12) {
          errorCount++;
          errors.push(`行「${line}」: 月が不正です（1〜12の範囲）`);
          continue;
        }

        // 従業員名を取得
        const employeeName = parts[employeeIndex];
        const employee = this.employees.find(emp => emp.name === employeeName);
        
        if (!employee) {
          errorCount++;
          errors.push(`行「${line}」: 従業員「${employeeName}」が見つかりません`);
          continue;
        }

        // 賞与額を取得
        const bonusAmountStr = parts[bonusAmountIndex];
        const bonusAmount = this.parseAmount(bonusAmountStr);
        
        if (isNaN(bonusAmount) || bonusAmount < 0) {
          errorCount++;
          errors.push(`行「${line}」: 賞与額が不正です`);
          continue;
        }

        // bonusDataに値を設定
        const key = this.getBonusKey(employee.id, month);
        this.bonusData[key] = bonusAmount;

        successCount++;
      }

      // 結果メッセージ
      if (errorCount > 0) {
        this.csvImportResult = {
          type: 'error',
          message: `${successCount}件のインポートに成功しましたが、${errorCount}件のエラーがあります。${errors.slice(0, 5).join(' / ')}${errors.length > 5 ? ' ...' : ''}`
        };
      } else {
        this.csvImportResult = {
          type: 'success',
          message: `${successCount}件のデータをインポートしました`
        };
        this.csvImportText = '';
      }
    } catch (error) {
      console.error('CSVインポートエラー:', error);
      this.csvImportResult = { type: 'error', message: `インポート中にエラーが発生しました: ${error}` };
    }
  }
}

