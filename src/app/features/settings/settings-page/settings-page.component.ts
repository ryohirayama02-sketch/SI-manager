import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormArray, FormGroup } from '@angular/forms';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css'
})
export class SettingsPageComponent implements OnInit {
  year = '2025';
  prefecture = 'tokyo';
  form: any;
  standardTable: FormArray;
  standardTableForm: any;
  errorMessages: string[] = [];
  warningMessages: string[] = [];

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService
  ) {
    this.form = this.fb.group({
      prefecture: [this.prefecture, Validators.required],
      health_employee: [0, Validators.required],
      health_employer: [0, Validators.required],
      care_employee: [0, Validators.required],
      care_employer: [0, Validators.required],
      pension_employee: [0, Validators.required],
      pension_employer: [0, Validators.required],
    });
    this.standardTable = this.fb.array([]);
    this.standardTableForm = this.fb.group({
      standardTable: this.standardTable
    });
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
    const rows = await this.settingsService.getStandardTable(this.year);
    rows.forEach(r => this.standardTable.push(this.createRow(r)));
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
    await this.settingsService.saveStandardTable(this.year, this.standardTable.value);
    alert('標準報酬月額テーブルを保存しました');
  }

  async ngOnInit(): Promise<void> {
    const data = await this.settingsService.getRates(this.year, this.prefecture);
    if (data) {
      this.form.patchValue({
        ...data,
        prefecture: this.prefecture
      });
    }
    await this.loadStandardTable();
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
    await this.settingsService.saveRates(this.year, prefectureValue, formData);
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
}

