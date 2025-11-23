import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators, FormArray, FormGroup } from '@angular/forms';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css'
})
export class SettingsPageComponent implements OnInit {
  year = '2025';
  prefecture = 'tokyo';
  form: any;
  standardTable: FormArray;
  standardTableForm: any;

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService
  ) {
    this.form = this.fb.group({
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

  async saveStandardTable(): Promise<void> {
    await this.settingsService.saveStandardTable(this.year, this.standardTable.value);
    alert('標準報酬月額テーブルを保存しました');
  }

  async ngOnInit(): Promise<void> {
    const data = await this.settingsService.getRates(this.year, this.prefecture);
    if (data) this.form.patchValue(data);
    await this.loadStandardTable();
  }

  async save(): Promise<void> {
    await this.settingsService.saveRates(this.year, this.prefecture, this.form.value);
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

