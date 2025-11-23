import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { SettingsService } from '../../services/settings.service';
import { BonusCalculationService, BonusCalculationResult } from '../../services/bonus-calculation.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';

@Component({
  selector: 'app-bonus-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bonus-page.component.html',
  styleUrl: './bonus-page.component.css'
})
export class BonusPageComponent implements OnInit {
  employees: Employee[] = [];
  selectedEmployeeId: string = '';
  bonusAmount: number | null = null;
  paymentDate: string = '';
  rates: any = null;
  year: string = '2025';
  prefecture: string = 'tokyo';

  // 計算結果
  calculationResult: BonusCalculationResult | null = null;

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private settingsService: SettingsService,
    private bonusCalculationService: BonusCalculationService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    this.rates = await this.settingsService.getRates(this.year, this.prefecture);
  }

  public onInputChange(): void {
    this.updateBonusCalculation().catch(err => console.error('計算エラー:', err));
  }

  async updateBonusCalculation(): Promise<void> {
    if (!this.selectedEmployeeId || this.bonusAmount === null || this.bonusAmount < 0 || !this.paymentDate || !this.rates) {
      this.calculationResult = null;
      return;
    }

    const employee = this.employees.find(e => e.id === this.selectedEmployeeId);
    if (!employee) {
      this.calculationResult = null;
      return;
    }

    this.calculationResult = await this.bonusCalculationService.calculateBonus(
      employee,
      this.selectedEmployeeId,
      this.bonusAmount,
      this.paymentDate,
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

    if (!this.paymentDate) {
      alert('支給日を入力してください');
      return;
    }

    // 計算結果が無い場合は計算を実行
    if (!this.calculationResult) {
      this.updateBonusCalculation();
    }

    if (!this.calculationResult) {
      alert('保険料の計算に失敗しました');
      return;
    }

    // 標準賞与額（1,000円未満切り捨て）
    const standardBonusAmount = Math.floor((this.bonusAmount || 0) / 1000) * 1000;

    // Bonusオブジェクトを作成（calculationResultと統合）
    const bonus: Bonus = {
      employeeId: this.selectedEmployeeId,
      amount: this.bonusAmount,
      payDate: this.paymentDate,
      createdAt: new Date(),
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
      isSalaryInsteadOfBonus: this.calculationResult.isSalaryInsteadOfBonus
    };

    try {
      await this.bonusService.addBonus(bonus);
      alert('賞与データを保存しました');
      
      // フォームリセット
      this.selectedEmployeeId = '';
      this.bonusAmount = null;
      this.paymentDate = '';
      this.calculationResult = null;
    } catch (error) {
      console.error('賞与登録エラー:', error);
      alert('登録に失敗しました');
    }
  }
}

