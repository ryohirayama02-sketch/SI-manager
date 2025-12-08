import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeeService } from '../../../services/employee.service';
import { BonusService } from '../../../services/bonus.service';
import { SettingsService } from '../../../services/settings.service';
import {
  BonusCalculationService,
  BonusCalculationResult,
} from '../../../services/bonus-calculation.service';
import { Employee } from '../../../models/employee.model';
import { Bonus } from '../../../models/bonus.model';
import { RoomIdService } from '../../../services/room-id.service';

@Component({
  selector: 'app-bonus-edit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './bonus-edit-page.component.html',
  styleUrl: './bonus-edit-page.component.css',
})
export class BonusEditPageComponent implements OnInit {
  form: FormGroup;
  employee: Employee | null = null;
  bonus: Bonus | null = null;
  employeeId: string = '';
  bonusId: string = '';
  year: number = new Date().getFullYear();
  rates: any = null;
  prefecture: string = 'tokyo';
  
  // 計算結果
  calculationResult: BonusCalculationResult | null = null;
  
  // カンマ表示用
  bonusAmountDisplay: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private settingsService: SettingsService,
    private bonusCalculationService: BonusCalculationService,
    private roomIdService: RoomIdService
  ) {
    this.form = this.fb.group({
      payDate: ['', Validators.required],
      amount: [0, [Validators.required, Validators.min(0)]],
      notes: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    // ルートパラメータから取得
    this.employeeId = this.route.snapshot.paramMap.get('employeeId') || '';
    this.bonusId = this.route.snapshot.paramMap.get('bonusId') || '';

    if (!this.employeeId || !this.bonusId) {
      alert('パラメータが不正です');
      this.router.navigate(['/bonus']);
      return;
    }

    // 従業員情報を取得
    const employees = await this.employeeService.getAllEmployees();
    this.employee = employees.find((e) => e.id === this.employeeId) || null;
    
    if (!this.employee) {
      alert('従業員が見つかりません');
      this.router.navigate(['/bonus']);
      return;
    }

    // 賞与データを取得（年度はloadBonus内で自動検索される）
    await this.loadBonus();
  }

  async loadBonus(): Promise<void> {
    if (!this.employeeId || !this.bonusId) {
      return;
    }

    try {
      const roomId = this.roomIdService.requireRoomId();
      // クエリパラメータから年度を取得（優先検索年度）
      const queryParams = this.route.snapshot.queryParams;
      const preferredYear = queryParams['year']
        ? parseInt(queryParams['year'], 10)
        : undefined;
      const currentYear = new Date().getFullYear();
      const searchYears: number[] = [];
      if (preferredYear !== undefined) {
        searchYears.push(preferredYear);
      }
      for (let year = currentYear - 2; year <= currentYear + 2; year++) {
        if (preferredYear !== undefined && year === preferredYear) continue;
        searchYears.push(year);
      }

      let foundBonus: Bonus | null = null;
      let foundYear: number | null = null;
      for (const year of searchYears) {
        const bonus = await this.bonusService.getBonus(
          roomId,
          this.employeeId,
          year,
          this.bonusId
        );
        if (bonus) {
          foundBonus = bonus as Bonus;
          foundYear = year;
          break;
        }
      }

      if (!foundBonus || foundYear === null) {
        alert('賞与データが見つかりません');
        this.router.navigate(['/bonus']);
        return;
      }

      this.bonus = foundBonus;
      this.year = this.bonus.year || foundYear;

      // 料率を取得
      this.rates = await this.settingsService.getRates(
        this.year.toString(),
        this.prefecture
      );

      // フォームに値を設定
      this.form.patchValue({
        payDate: this.bonus.payDate || '',
        amount: this.bonus.amount || 0,
        notes: this.bonus.notes || '',
      });

      // カンマ表示を設定
      this.bonusAmountDisplay = this.formatAmount(this.bonus.amount);

      // 計算結果を更新
      await this.updateBonusCalculation();
    } catch (error) {
      console.error('賞与データの取得エラー:', error);
      alert('データの取得に失敗しました');
      this.router.navigate(['/bonus']);
    }
  }

  formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || value === 0) {
      return '';
    }
    return value.toLocaleString('ja-JP');
  }

  parseAmount(value: string): number {
    const numStr = value.replace(/,/g, '');
    const num = parseInt(numStr, 10);
    return isNaN(num) ? 0 : num;
  }

  onBonusAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const numValue = this.parseAmount(value);
    this.form.patchValue({ amount: numValue });
    this.bonusAmountDisplay = this.formatAmount(numValue);
    input.value = this.bonusAmountDisplay;
    this.onInputChange();
  }

  onBonusAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const numValue = this.parseAmount(input.value);
    this.form.patchValue({ amount: numValue });
    this.bonusAmountDisplay = this.formatAmount(numValue);
    input.value = this.bonusAmountDisplay;
  }

  async onInputChange(): Promise<void> {
    await this.updateBonusCalculation();
  }

  async updateBonusCalculation(): Promise<void> {
    if (
      !this.employee ||
      !this.form.value.amount ||
      this.form.value.amount < 0 ||
      !this.rates
    ) {
      this.calculationResult = null;
      return;
    }

    const payDate = this.form.value.payDate || this.bonus?.payDate || '';
    if (!payDate) {
      this.calculationResult = null;
      return;
    }

    this.calculationResult = await this.bonusCalculationService.calculateBonus(
      this.employee,
      this.employeeId,
      this.form.value.amount,
      payDate,
      this.year
    );
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      alert('入力内容を確認してください');
      return;
    }

    if (!this.bonus || !this.employeeId || !this.bonusId) {
      alert('データが不正です');
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

    // 更新データを作成（undefinedの値を除外）
    const updateData: any = {
      year: this.year,
      amount: this.form.value.amount,
      payDate: this.form.value.payDate,
      isExempt: this.calculationResult.isExempted || false,
      cappedHealth: this.calculationResult.cappedBonusHealth || 0,
      cappedPension: this.calculationResult.cappedBonusPension || 0,
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
      isSalaryInsteadOfBonus: this.calculationResult.isSalaryInsteadOfBonus,
    };

    // undefinedでない値のみ追加
    if (this.calculationResult.reportDeadline) {
      updateData.reportDeadline = this.calculationResult.reportDeadline;
    }
    if (this.calculationResult.exemptReason) {
      updateData.exemptReason = this.calculationResult.exemptReason;
    }
    if (this.form.value.notes) {
      updateData.notes = this.form.value.notes;
    }

    try {
      const roomId = this.roomIdService.requireRoomId();
      await this.bonusService.saveBonus(
        roomId,
        this.employeeId,
        this.year,
        this.bonusId,
        updateData
      );
      alert('賞与データを更新しました');
      this.router.navigate(['/bonus']);
    } catch (error) {
      console.error('賞与更新エラー:', error);
      alert('更新に失敗しました');
    }
  }

  onCancel(): void {
    this.router.navigate(['/bonus']);
  }
}
