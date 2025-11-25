import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { SettingsService } from '../../services/settings.service';
import { BonusCalculationService, BonusCalculationResult } from '../../services/bonus-calculation.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';

@Component({
  selector: 'app-bonus-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './bonus-page.component.html',
  styleUrl: './bonus-page.component.css'
})
export class BonusPageComponent implements OnInit {
  employees: Employee[] = [];
  selectedEmployeeId: string = '';
  bonusAmount: number | null = null;
  bonusAmountDisplay: string = ''; // カンマ付き表示用
  paymentMonth: number = 1;
  isExempt: boolean = false;
  rates: any = null;
  year: number = 2025;
  prefecture: string = 'tokyo';

  // 計算結果（次のStepで使用）
  calculationResult: BonusCalculationResult | null = null;

  // 賞与一覧
  bonusList: Bonus[] = [];

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private settingsService: SettingsService,
    private bonusCalculationService: BonusCalculationService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    // 初期表示時にカンマ付きで表示
    this.bonusAmountDisplay = this.formatAmount(this.bonusAmount);
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
    }
  }

  async loadBonusList(): Promise<void> {
    if (!this.selectedEmployeeId) {
      this.bonusList = [];
      return;
    }

    try {
      const bonuses = await this.bonusService.loadBonus(this.year, this.selectedEmployeeId);
      // 支給日の降順でソート（新しい順）
      this.bonusList = bonuses.sort((a, b) => {
        const dateA = new Date(a.payDate).getTime();
        const dateB = new Date(b.payDate).getTime();
        return dateB - dateA; // 降順
      });
    } catch (error) {
      console.error('賞与一覧の取得エラー:', error);
      this.bonusList = [];
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
      this.rates
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
    } catch (error) {
      console.error('賞与登録エラー:', error);
      alert('登録に失敗しました');
    }
  }
}

