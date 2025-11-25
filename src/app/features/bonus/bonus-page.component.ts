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

interface ParsedBonus {
  employeeId: string;
  payDate: string;
  bonusAmount: number;
  notes?: string;
}

@Component({
  selector: 'app-bonus-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './bonus-page.component.html',
  styleUrl: './bonus-page.component.css'
})
export class BonusPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  selectedEmployeeId: string = '';
  bonusAmount: number | null = null;
  bonusAmountDisplay: string = ''; // カンマ付き表示用
  paymentMonth: number = 1;
  isExempt: boolean = false;
  rates: any = null;
  year: number = new Date().getFullYear();
  availableYears: number[] = [];
  prefecture: string = 'tokyo';

  // 計算結果（次のStepで使用）
  calculationResult: BonusCalculationResult | null = null;

  // 賞与一覧
  bonusList: Bonus[] = [];
  filteredBonuses: Bonus[] = [];

  // CSVインポート結果
  importResult: { successCount: number; errorCount: number; errors: string[] } | null = null;
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
    this.availableYears = [2023, 2024, 2025, 2026];
  }

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    // 初期表示時にカンマ付きで表示
    this.bonusAmountDisplay = this.formatAmount(this.bonusAmount);

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
        this.isExempt = this.calculationResult?.isExempted || false;
      }
    }
  }

  formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || value === 0) {
      return '';
    }
    return value.toLocaleString('ja-JP');
  }

  parseAmount(value: string): number {
    // カンマを削除して数値に変換
    const numStr = value.replace(/,/g, '');
    const num = parseInt(numStr, 10);
    return isNaN(num) ? 0 : num;
  }

  onBonusAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const numValue = this.parseAmount(value);
    this.bonusAmount = numValue;
    this.bonusAmountDisplay = this.formatAmount(numValue);
    input.value = this.bonusAmountDisplay;
    this.onInputChange();
  }

  onBonusAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const numValue = this.parseAmount(input.value);
    this.bonusAmount = numValue;
    this.bonusAmountDisplay = this.formatAmount(numValue);
    input.value = this.bonusAmountDisplay;
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

  async onMonthChange(month: number): Promise<void> {
    // 支給月から年度を自動判定
    // 支給月が1-3月の場合、年度は前年（会計年度4月始まり）
    // 支給月が4-12月の場合、年度は当年
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    if (month >= 1 && month <= 3) {
      // 1-3月は前年度
      this.year = currentYear - 1;
    } else if (month >= 4 && month <= 12) {
      // 4-12月は当年
      this.year = currentYear;
    } else {
      // 不正な値の場合は現在年度を維持
      this.year = currentYear;
    }
    
    // 年度変更時に料率を再取得
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    
    // 計算結果を再計算
    await this.updateBonusCalculation();
    
    // 賞与一覧を再読み込み
    if (this.selectedEmployeeId) {
      await this.loadBonusList();
    }
  }

  async onYearChange(): Promise<void> {
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

  async deleteBonus(bonus: Bonus): Promise<void> {
    if (!confirm(`賞与（${bonus.payDate}、${this.formatAmount(bonus.amount)}円）を削除しますか？`)) {
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

  getBonusTotal(bonus: Bonus): number {
    const healthTotal = (bonus.healthEmployee || 0) + (bonus.healthEmployer || 0);
    const careTotal = (bonus.careEmployee || 0) + (bonus.careEmployer || 0);
    const pensionTotal = (bonus.pensionEmployee || 0) + (bonus.pensionEmployer || 0);
    return healthTotal + careTotal + pensionTotal;
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

  async onSubmit(): Promise<void> {
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
      isExempt: this.isExempt || this.calculationResult.isExempted || false,
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
      exemptReason: this.calculationResult.exemptReason
    };

    try {
      await this.bonusService.saveBonus(this.year, bonus);
      alert('賞与データを保存しました');
      
      // 賞与一覧を再読み込み（フォームリセット前に実行）
      await this.loadBonusList();
      
      // フォームリセット
      this.selectedEmployeeId = '';
      this.bonusAmount = null;
      this.bonusAmountDisplay = '';
      this.paymentMonth = 1;
      this.isExempt = false;
      this.calculationResult = null;
      this.bonusList = [];
      this.filteredBonuses = [];
    } catch (error) {
      console.error('賞与登録エラー:', error);
      alert('登録に失敗しました');
    }
  }

  // CSVインポート関連
  onCsvUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) {
        alert('ファイルの読み込みに失敗しました');
        return;
      }

      try {
        const parsed = this.parseCsv(text);
        await this.importBonuses(parsed);
      } catch (error) {
        console.error('CSVインポートエラー:', error);
        alert('CSVの処理中にエラーが発生しました');
      }
    };
    reader.readAsText(file, 'UTF-8');

    // 同じファイルを再度選択できるようにリセット
    input.value = '';
  }

  parseCsv(text: string): ParsedBonus[] {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) {
      return [];
    }

    // 1行目はヘッダーとしてスキップ
    const dataLines = lines.slice(1);
    const parsed: ParsedBonus[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const columns = line.split(',').map(col => col.trim());

      // 最低限の列数チェック（employeeId, payDate, bonusAmount は必須）
      if (columns.length < 3) {
        continue;
      }

      const employeeId = columns[0];
      const payDate = columns[1];
      const bonusAmountStr = columns[2];
      const notes = columns[3] || '';

      // バリデーション
      if (!employeeId || employeeId === '') {
        continue; // スキップ
      }

      // 日付形式チェック
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(payDate)) {
        continue; // スキップ
      }

      // 数値チェック
      const bonusAmount = this.parseAmount(bonusAmountStr);
      if (isNaN(bonusAmount) || bonusAmount < 0) {
        continue; // スキップ
      }

      parsed.push({
        employeeId,
        payDate,
        bonusAmount,
        notes
      });
    }

    return parsed;
  }

  async importBonuses(parsed: ParsedBonus[]): Promise<void> {
    if (parsed.length === 0) {
      alert('有効なデータがありませんでした');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // 料率が未取得の場合は取得
    if (!this.rates) {
      this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    }

    for (const item of parsed) {
      try {
        // 従業員を検索
        const employee = this.employees.find(e => e.id === item.employeeId);
        if (!employee) {
          errorCount++;
          errors.push(`${item.employeeId}: 従業員が見つかりません`);
          continue;
        }

        // 賞与計算を実行
        // 支給日から年度を取得
        const payDateObj = new Date(item.payDate);
        const bonusYear = payDateObj.getFullYear();
        const calculationResult = await this.bonusCalculationService.calculateBonus(
          employee,
          item.employeeId,
          item.bonusAmount,
          item.payDate,
          bonusYear
        );

        if (!calculationResult) {
          errorCount++;
          errors.push(`${item.employeeId} (${item.payDate}): 保険料の計算に失敗しました`);
          continue;
        }

        // payDateから月を抽出（payDateObjは既に416行目で宣言済み）
        const month = payDateObj.getMonth() + 1;

        // Bonusオブジェクトを作成
        const bonus: Bonus = {
          employeeId: item.employeeId,
          year: this.year,
          month: month,
          amount: item.bonusAmount,
          payDate: item.payDate,
          createdAt: new Date(),
          notes: item.notes || undefined,
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
          exemptReason: calculationResult.exemptReason
        };

        // Firestoreに保存
        await this.bonusService.saveBonus(this.year, bonus);
        successCount++;
      } catch (error) {
        errorCount++;
        errors.push(`${item.employeeId} (${item.payDate}): ${error instanceof Error ? error.message : '登録エラー'}`);
        console.error(`賞与インポートエラー (${item.employeeId}):`, error);
      }
    }

    // 結果を表示
    this.showImportResult(successCount, errorCount, errors);

    // 一覧を再読み込み（選択中の従業員がいる場合）
    if (this.selectedEmployeeId) {
      await this.loadBonusList();
    }
  }

  showImportResult(successCount: number, errorCount: number, errors: string[]): void {
    this.importResult = {
      successCount,
      errorCount,
      errors: errors.slice(0, 10) // 最大10件まで表示
    };

    // 結果メッセージを表示
    let message = `インポート完了\n成功: ${successCount}件`;
    if (errorCount > 0) {
      message += `\n失敗: ${errorCount}件`;
    }
    alert(message);
  }
}

