import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators, FormArray, FormGroup } from '@angular/forms';
import { SettingsService } from '../../../services/settings.service';
import { Settings } from '../../../models/settings.model';
import { Rate } from '../../../models/rate.model';
import { SalaryItem } from '../../../models/salary-item.model';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css'
})
export class SettingsPageComponent implements OnInit {
  year = '2025';
  standardTableYear: number = new Date().getFullYear();
  salaryItemsYear: number = new Date().getFullYear();
  prefecture = 'tokyo';
  form: any;
  settingsForm: FormGroup;
  standardTable: FormArray;
  standardTableForm: any;
  salaryItems: FormArray;
  salaryItemsForm: FormGroup;
  errorMessages: string[] = [];
  warningMessages: string[] = [];

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService
  ) {
    this.form = this.fb.group({
      prefecture: [this.prefecture, Validators.required],
      effectiveFrom: [`${this.year}-04`, Validators.required],
      health_employee: [0, Validators.required],
      health_employer: [0, Validators.required],
      care_employee: [0, Validators.required],
      care_employer: [0, Validators.required],
      pension_employee: [0, Validators.required],
      pension_employer: [0, Validators.required],
    });
    this.settingsForm = this.fb.group({
      payrollMonthRule: ['payday', Validators.required]
    });
    this.standardTable = this.fb.array([]);
    this.standardTableForm = this.fb.group({
      standardTable: this.standardTable
    });
    this.salaryItems = this.fb.array([]);
    this.salaryItemsForm = this.fb.group({
      salaryItems: this.salaryItems
    });
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

  onAmountInput(index: number, field: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const numValue = this.parseAmount(value);
    const row = this.standardTable.at(index);
    row.get(field)?.setValue(numValue, { emitEvent: false });
    
    // カンマ付きで表示を更新
    input.value = this.formatAmount(numValue);
    
    // バリデーション実行
    this.validateStandardTable();
  }

  onAmountBlur(index: number, field: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const numValue = this.parseAmount(input.value);
    const row = this.standardTable.at(index);
    row.get(field)?.setValue(numValue, { emitEvent: false });
    input.value = this.formatAmount(numValue);
  }

  getAmountDisplayValue(index: number, field: string): string {
    const row = this.standardTable.at(index);
    const value = row.get(field)?.value;
    return this.formatAmount(value);
  }

  createRow(row: any): FormGroup {
    return this.fb.group({
      id: [row.id],
      rank: [row.rank],
      lower: [row.lower],
      upper: [row.upper],
      standard: [row.standard],
    });
  }

  async loadStandardTable(): Promise<void> {
    // 既存のデータをクリア
    while (this.standardTable.length !== 0) {
      this.standardTable.removeAt(0);
    }
    const rows = await this.settingsService.getStandardTable(this.standardTableYear);
    rows.forEach(r => this.standardTable.push(this.createRow(r)));
  }

  async onStandardTableYearChange(): Promise<void> {
    await this.loadStandardTable();
  }

  validateStandardTable(): void {
    this.errorMessages = [];
    this.warningMessages = [];

    for (let i = 0; i < this.standardTable.length; i++) {
      const row = this.standardTable.at(i);
      const lower = row.get('lower')?.value;
      const upper = row.get('upper')?.value;
      const standard = row.get('standard')?.value;
      const rank = row.get('rank')?.value;

      if (lower !== null && upper !== null && lower >= upper) {
        this.errorMessages.push(`等級${rank}: 下限は上限より小さくする必要があります`);
      }

      if (standard !== null && (standard < lower || standard >= upper)) {
        this.warningMessages.push(`等級${rank}: 標準報酬月額が範囲外です（下限: ${lower}, 上限: ${upper}）`);
      }

      // テーブルが昇順になっているかのチェック（前の等級の上限 = 次の等級の下限）
      if (i > 0) {
        const prevRow = this.standardTable.at(i - 1);
        const prevUpper = prevRow.get('upper')?.value;
        if (prevUpper !== null && lower !== null && prevUpper !== lower) {
          this.errorMessages.push(`等級${prevRow.get('rank')?.value}と等級${rank}の範囲に不整合があります（前等級の上限: ${prevUpper}, 当等級の下限: ${lower}）`);
        }
      }
    }
  }

  async saveStandardTable(): Promise<void> {
    this.validateStandardTable();
    if (this.errorMessages.length > 0) {
      alert('エラーがあります。修正してください。');
      return;
    }
    await this.settingsService.saveStandardTable(this.standardTableYear, this.standardTable.value);
    alert('標準報酬月額テーブルを保存しました');
  }

  async ngOnInit(): Promise<void> {
    const data = await this.settingsService.getRates(this.year, this.prefecture);
    if (data) {
      this.form.patchValue({
        ...data,
        prefecture: this.prefecture,
        effectiveFrom: data.effectiveFrom || `${this.year}-04`
      });
    } else {
      this.form.patchValue({
        effectiveFrom: `${this.year}-04`
      });
    }
    const settings = await this.settingsService.loadSettings();
    this.settingsForm.patchValue(settings);
    await this.loadStandardTable();
    await this.loadSalaryItems();
  }

  async onPrefectureChange(): Promise<void> {
    this.prefecture = this.form.get('prefecture')?.value || 'tokyo';
    await this.reloadRates();
  }

  async reloadRates(): Promise<void> {
    const data = await this.settingsService.getRates(this.year, this.prefecture);
    if (data) {
      this.form.patchValue(data);
    }
  }

  validateRates(): void {
    this.errorMessages = [];
    this.warningMessages = [];

    const values = this.form.value;
    const rateFields = ['health_employee', 'health_employer', 'care_employee', 'care_employer', 'pension_employee', 'pension_employer'];

    for (const field of rateFields) {
      const value = values[field];
      if (value < 0 || value > 1) {
        this.errorMessages.push(`${field}: 料率は0以上1以下である必要があります`);
      }
    }
  }

  async save(): Promise<void> {
    this.validateRates();
    if (this.errorMessages.length > 0) {
      return;
    }
    const prefectureValue = this.form.get('prefecture')?.value || this.prefecture;
    const formData = { ...this.form.value };
    delete formData.prefecture; // prefectureはformDataから除外
    
    const rateData: Rate = {
      effectiveFrom: formData.effectiveFrom || `${this.year}-04`,
      health_employee: formData.health_employee,
      health_employer: formData.health_employer,
      care_employee: formData.care_employee,
      care_employer: formData.care_employer,
      pension_employee: formData.pension_employee,
      pension_employer: formData.pension_employer,
    };
    
    await this.settingsService.saveRates(this.year, prefectureValue, rateData);
    alert('設定を保存しました');
  }

  async seedTokyo(): Promise<void> {
    await this.settingsService.seedRatesTokyo2025();
    alert('東京都の料率（2025年）を登録しました');
  }

  async seedAllPrefectures(): Promise<void> {
    await this.settingsService.seedRatesAllPrefectures2025();
    alert('47都道府県の2025年度料率を登録しました');
  }

  async saveSettings(): Promise<void> {
    const settings: Settings = {
      payrollMonthRule: this.settingsForm.get('payrollMonthRule')?.value || 'payday'
    };
    await this.settingsService.saveSettings(settings);
    alert('設定を保存しました');
  }

  getAvailableYears(): number[] {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    // 現在年から過去5年、未来2年まで
    for (let i = currentYear - 5; i <= currentYear + 2; i++) {
      years.push(i);
    }
    return years;
  }

  createSalaryItemRow(item?: SalaryItem): FormGroup {
    return this.fb.group({
      id: [item?.id || this.generateId()],
      name: [item?.name || '', Validators.required],
      type: [item?.type || 'fixed', Validators.required]
    });
  }

  generateId(): string {
    return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async loadSalaryItems(): Promise<void> {
    while (this.salaryItems.length !== 0) {
      this.salaryItems.removeAt(0);
    }
    const items = await this.settingsService.loadSalaryItems(this.salaryItemsYear);
    items.forEach(item => this.salaryItems.push(this.createSalaryItemRow(item)));
  }

  async onSalaryItemsYearChange(): Promise<void> {
    await this.loadSalaryItems();
  }

  addSalaryItem(): void {
    this.salaryItems.push(this.createSalaryItemRow());
  }

  removeSalaryItem(index: number): void {
    this.salaryItems.removeAt(index);
  }

  async saveSalaryItems(): Promise<void> {
    const items: SalaryItem[] = this.salaryItems.value;
    await this.settingsService.saveSalaryItems(this.salaryItemsYear, items);
    alert('給与項目マスタを保存しました');
  }
}

