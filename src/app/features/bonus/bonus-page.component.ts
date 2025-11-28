import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { SettingsService } from '../../services/settings.service';
import { BonusCalculationService, BonusCalculationResult } from '../../services/bonus-calculation.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';
import { BonusInputFormComponent } from './components/bonus-input-form/bonus-input-form.component';
import { BonusListComponent } from './components/bonus-list/bonus-list.component';
import { BonusCsvImportComponent } from './components/bonus-csv-import/bonus-csv-import.component';


@Component({
  selector: 'app-bonus-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    BonusInputFormComponent,
    BonusListComponent,
    BonusCsvImportComponent
  ],
  templateUrl: './bonus-page.component.html',
  styleUrl: './bonus-page.component.css'
})
export class BonusPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  selectedEmployeeId: string = '';
  bonusAmount: number | null = null;
  bonusAmountDisplay: string = ''; // カンマ付き表示用
  paymentMonth: number = 1;
  rates: any = null;
  year: number = new Date().getFullYear();
  availableYears: number[] = [];
  prefecture: string = 'tokyo';

  // 計算結果（次のStepで使用）
  calculationResult: BonusCalculationResult | null = null;

  // 賞与一覧
  bonusList: Bonus[] = [];
  filteredBonuses: Bonus[] = [];

  // CSVインポート関連
  csvImportText: string = '';
  csvImportResult: { type: 'success' | 'error'; message: string } | null = null;
  // 加入区分購読用
  eligibilitySubscription: Subscription | null = null;
  // 保存処理の重複実行を防ぐフラグ
  isSaving: boolean = false;

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private settingsService: SettingsService,
    private bonusCalculationService: BonusCalculationService,
    private employeeEligibilityService: EmployeeEligibilityService
  ) {
    // 年度選択用の年度リストを生成（2023〜2026）
    this.availableYears = [2023, 2024, 2025, 2026];
  }

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    // 初期表示時にカンマ付きで表示
    if (this.bonusAmount !== null && this.bonusAmount !== undefined && this.bonusAmount !== 0) {
      this.bonusAmountDisplay = this.bonusAmount.toLocaleString('ja-JP');
    } else {
      this.bonusAmountDisplay = '';
    }

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService.observeEligibility().subscribe(() => {
      this.reloadEligibility();
    });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  async reloadEligibility(): Promise<void> {
    // 加入区分が変更された場合、賞与計算を再実行（選択中の従業員がいて賞与額が入力されている場合）
    if (this.selectedEmployeeId && this.bonusAmount && this.bonusAmount > 0) {
      const employee = this.employees.find(e => e.id === this.selectedEmployeeId);
      if (employee) {
        const paymentDate = `${this.year}-${this.paymentMonth.toString().padStart(2, '0')}-01`;
        this.calculationResult = await this.bonusCalculationService.calculateBonus(
          employee,
          this.selectedEmployeeId,
          this.bonusAmount,
          paymentDate,
          this.year
        );
      }
    }
  }

  parseAmount(value: string): number {
    // カンマを削除して数値に変換
    const numStr = value.replace(/,/g, '');
    const num = parseInt(numStr, 10);
    return isNaN(num) ? 0 : num;
  }

  onBonusAmountInputChange(amount: number): void {
    this.bonusAmount = amount;
    this.onInputChange();
  }

  onBonusAmountDisplayChange(display: string): void {
    this.bonusAmountDisplay = display;
  }

  async onEmployeeChange(employeeId: string): Promise<void> {
    this.selectedEmployeeId = employeeId;
    await this.onInputChange();
  }

  async onInputChange(): Promise<void> {
    await this.updateBonusCalculation();
    // 従業員選択時に賞与一覧を読み込み
    if (this.selectedEmployeeId) {
      await this.loadBonusList();
    } else {
      this.bonusList = [];
      this.filteredBonuses = [];
    }
  }

  async onMonthChangeEvent(month: number): Promise<void> {
    this.paymentMonth = month;
    console.log(`[bonus-page] 支給月変更: 月=${month}, 現在の年度=${this.year}`);
    
    // 年度変更時に料率を再取得（年度は変更しない）
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    
    // 計算結果を再計算
    await this.updateBonusCalculation();
    
    // 賞与一覧を再読み込み
    if (this.selectedEmployeeId) {
      await this.loadBonusList();
    }
  }

  async onYearChangeEvent(year: number): Promise<void> {
    this.year = year;
    // 年度変更時に料率を再取得
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    // 賞与一覧を再読み込み
    if (this.selectedEmployeeId) {
      await this.loadBonusList();
    } else {
      this.bonusList = [];
      this.filteredBonuses = [];
    }
    // 年度フィルタを適用
    this.filteredBonuses = this.bonusList.filter(b => b.year === this.year);
  }

  async loadBonusList(): Promise<void> {
    if (!this.selectedEmployeeId) {
      this.bonusList = [];
      this.filteredBonuses = [];
      return;
    }

    try {
      const bonuses = await this.bonusService.getBonusesByYear(this.selectedEmployeeId, this.year);
      // 支給日の降順でソート（新しい順）
      this.bonusList = bonuses.sort((a, b) => {
        const dateA = new Date(a.payDate).getTime();
        const dateB = new Date(b.payDate).getTime();
        return dateB - dateA; // 降順
      });
      // 年度フィルタを適用
      this.filteredBonuses = this.bonusList.filter(b => b.year === this.year);
    } catch (error) {
      console.error('賞与一覧の取得エラー:', error);
      this.bonusList = [];
      this.filteredBonuses = [];
    }
  }

  async onDeleteBonus(bonus: Bonus): Promise<void> {
    if (!confirm(`賞与（${bonus.payDate}、${bonus.amount.toLocaleString('ja-JP')}円）を削除しますか？`)) {
      return;
    }

    try {
      if (!bonus.id) {
        alert('削除対象の賞与IDが取得できませんでした');
        return;
      }
      await this.bonusService.deleteBonus(this.year, bonus.employeeId, bonus.id);
      alert('賞与データを削除しました');
      // 一覧を再読み込み
      await this.loadBonusList();
      // 年度フィルタを適用
      this.filteredBonuses = this.bonusList.filter(b => b.year === this.year);
    } catch (error) {
      console.error('賞与削除エラー:', error);
      alert('削除に失敗しました');
    }
  }


  async updateBonusCalculation(): Promise<void> {
    if (!this.selectedEmployeeId || this.bonusAmount === null || this.bonusAmount < 0 || !this.rates) {
      this.calculationResult = null;
      return;
    }

    const employee = this.employees.find(e => e.id === this.selectedEmployeeId);
    if (!employee) {
      this.calculationResult = null;
      return;
    }

    // paymentMonthからpayDateを生成（月の1日を仮定）
    const paymentDate = `${this.year}-${String(this.paymentMonth).padStart(2, '0')}-01`;

    this.calculationResult = await this.bonusCalculationService.calculateBonus(
      employee,
      this.selectedEmployeeId,
      this.bonusAmount,
      paymentDate,
      this.year
    );
  }

  async onSubmitEvent(): Promise<void> {
    // 重複実行を防ぐ
    if (this.isSaving) {
      return;
    }

    // バリデーション
    if (!this.selectedEmployeeId) {
      alert('従業員を選択してください');
      return;
    }

    if (this.bonusAmount === null || this.bonusAmount < 0) {
      alert('賞与額は0以上を入力してください');
      return;
    }

    // 計算結果が無い場合は計算を実行
    if (!this.calculationResult) {
      await this.updateBonusCalculation();
    }

    if (!this.calculationResult) {
      alert('保険料の計算に失敗しました');
      return;
    }

    // Bonusオブジェクトを作成（計算結果を含む）
    const paymentDate = `${this.year}-${String(this.paymentMonth).padStart(2, '0')}-01`;
    const bonus: Bonus = {
      employeeId: this.selectedEmployeeId,
      year: this.year,
      month: this.paymentMonth,
      amount: this.bonusAmount!,
      payDate: paymentDate,
      createdAt: new Date(),
      isExempt: this.calculationResult.isExempted || false,
      cappedHealth: this.calculationResult.cappedBonusHealth || 0,
      cappedPension: this.calculationResult.cappedBonusPension || 0,
      // 既存フィールド（後方互換性）
      healthEmployee: this.calculationResult.healthEmployee,
      healthEmployer: this.calculationResult.healthEmployer,
      careEmployee: this.calculationResult.careEmployee,
      careEmployer: this.calculationResult.careEmployer,
      pensionEmployee: this.calculationResult.pensionEmployee,
      pensionEmployer: this.calculationResult.pensionEmployer,
      standardBonusAmount: this.calculationResult.standardBonus,
      cappedBonusHealth: this.calculationResult.cappedBonusHealth,
      cappedBonusPension: this.calculationResult.cappedBonusPension,
      isExempted: this.calculationResult.isExempted,
      isRetiredNoLastDay: this.calculationResult.isRetiredNoLastDay,
      isOverAge70: this.calculationResult.isOverAge70,
      isOverAge75: this.calculationResult.isOverAge75,
      requireReport: this.calculationResult.requireReport,
      reportDeadline: this.calculationResult.reportDeadline || undefined,
      isSalaryInsteadOfBonus: this.calculationResult.isSalaryInsteadOfBonus,
      exemptReason: this.calculationResult.exemptReason || undefined
    };

    this.isSaving = true;
    try {
      console.log(`[bonus-page] 賞与保存: 年度=${this.year}, 従業員ID=${this.selectedEmployeeId}, 月=${this.paymentMonth}, 賞与額=${this.bonusAmount}`);
      console.log(`[bonus-page] bonusオブジェクト:`, bonus);
      await this.bonusService.saveBonus(this.year, bonus);
      alert('賞与データを保存しました');
      
      // 賞与一覧を再読み込み（フォームリセット前に実行）
      await this.loadBonusList();
      
      // フォームリセット
      this.selectedEmployeeId = '';
      this.bonusAmount = null;
      this.bonusAmountDisplay = '';
      this.paymentMonth = 1;
      this.calculationResult = null;
      this.bonusList = [];
      this.filteredBonuses = [];
    } catch (error) {
      console.error('賞与登録エラー:', error);
      alert('登録に失敗しました');
    } finally {
      this.isSaving = false;
    }
  }


  // CSVインポート処理（新フォーマット: 年度,支給月,従業員,賞与額）
  async onCsvTextImport(csvText: string): Promise<void> {
    this.csvImportText = csvText;
    await this.importFromCsvText(csvText);
  }

  onCsvImportClose(): void {
    this.csvImportText = '';
    this.csvImportResult = null;
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
      
      if (headerParts.length < 4) {
        this.csvImportResult = { type: 'error', message: 'ヘッダー行が不正です（4列必要：年度,支給月,従業員,賞与額）' };
        return;
      }

      // ヘッダーから各列のインデックスを取得
      const yearIndex = headerParts.indexOf('年度');
      const monthIndex = headerParts.indexOf('支給月');
      const employeeIndex = headerParts.indexOf('従業員');
      const bonusAmountIndex = headerParts.indexOf('賞与額');
      
      if (yearIndex === -1 || monthIndex === -1 || employeeIndex === -1 || bonusAmountIndex === -1) {
        this.csvImportResult = { type: 'error', message: 'ヘッダーに「年度」「支給月」「従業員」「賞与額」の列が必要です' };
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

        // 年度を取得（「2025年」形式から「2025」を抽出）
        const yearStr = parts[yearIndex].replace(/年/g, '').trim();
        const year = parseInt(yearStr, 10);
        
        if (isNaN(year) || year < 2020 || year > 2100) {
          errorCount++;
          errors.push(`行「${line}」: 年度が不正です（2020〜2100の範囲）`);
          continue;
        }

        // 支給月を取得（「1月」形式から「1」を抽出）
        const monthStr = parts[monthIndex].replace(/月/g, '').trim();
        const month = parseInt(monthStr, 10);
        
        if (isNaN(month) || month < 1 || month > 12) {
          errorCount++;
          errors.push(`行「${line}」: 支給月が不正です（1〜12の範囲）`);
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

        // 支給日を生成（月の1日を仮定）
        const paymentDate = `${year}-${String(month).padStart(2, '0')}-01`;

        // 賞与を計算して保存
        try {
          const calculationResult = await this.bonusCalculationService.calculateBonus(
            employee,
            employee.id,
            bonusAmount,
            paymentDate,
            year
          );

          if (!calculationResult) {
            errorCount++;
            errors.push(`行「${line}」: 保険料の計算に失敗しました`);
            continue;
          }

          // Bonusオブジェクトを作成
          const bonus: Bonus = {
            employeeId: employee.id,
            year: year,
            month: month,
            amount: bonusAmount,
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

          await this.bonusService.saveBonus(year, bonus);
          successCount++;
        } catch (error) {
          errorCount++;
          errors.push(`行「${line}」: 保存に失敗しました: ${error}`);
        }
      }

      // 賞与一覧を再読み込み
      await this.loadBonusList();

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

