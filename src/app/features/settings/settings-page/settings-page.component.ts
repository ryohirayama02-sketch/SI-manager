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
  availableYears: number[] = [];
  standardTableYear: number = new Date().getFullYear();
  gradeYear: string = (new Date().getFullYear()).toString();
  availableGradeYears: number[] = [];
  salaryItemsYear: number = new Date().getFullYear();
  prefecture = 'tokyo';
  form: any;
  settingsForm: FormGroup;
  rateVersionForm: FormGroup;
  standardTable: FormArray;
  standardTableForm: any;
  salaryItems: FormArray;
  salaryItemsForm: FormGroup;
  errorMessages: string[] = [];
  warningMessages: string[] = [];
  isStandardTableExpanded: boolean = true;
  
  // 47都道府県の料率データ
  prefectureRates: { [prefecture: string]: { health_employee: number; health_employer: number } } = {};
  careRates: { care_employee: number; care_employer: number } = { care_employee: 0, care_employer: 0 };
  pensionRates: { pension_employee: number; pension_employer: number } = { pension_employee: 0, pension_employer: 0 };
  
  prefectureList = [
    { code: 'hokkaido', name: '北海道' },
    { code: 'aomori', name: '青森県' },
    { code: 'iwate', name: '岩手県' },
    { code: 'miyagi', name: '宮城県' },
    { code: 'akita', name: '秋田県' },
    { code: 'yamagata', name: '山形県' },
    { code: 'fukushima', name: '福島県' },
    { code: 'ibaraki', name: '茨城県' },
    { code: 'tochigi', name: '栃木県' },
    { code: 'gunma', name: '群馬県' },
    { code: 'saitama', name: '埼玉県' },
    { code: 'chiba', name: '千葉県' },
    { code: 'tokyo', name: '東京都' },
    { code: 'kanagawa', name: '神奈川県' },
    { code: 'niigata', name: '新潟県' },
    { code: 'toyama', name: '富山県' },
    { code: 'ishikawa', name: '石川県' },
    { code: 'fukui', name: '福井県' },
    { code: 'yamanashi', name: '山梨県' },
    { code: 'nagano', name: '長野県' },
    { code: 'gifu', name: '岐阜県' },
    { code: 'shizuoka', name: '静岡県' },
    { code: 'aichi', name: '愛知県' },
    { code: 'mie', name: '三重県' },
    { code: 'shiga', name: '滋賀県' },
    { code: 'kyoto', name: '京都府' },
    { code: 'osaka', name: '大阪府' },
    { code: 'hyogo', name: '兵庫県' },
    { code: 'nara', name: '奈良県' },
    { code: 'wakayama', name: '和歌山県' },
    { code: 'tottori', name: '鳥取県' },
    { code: 'shimane', name: '島根県' },
    { code: 'okayama', name: '岡山県' },
    { code: 'hiroshima', name: '広島県' },
    { code: 'yamaguchi', name: '山口県' },
    { code: 'tokushima', name: '徳島県' },
    { code: 'kagawa', name: '香川県' },
    { code: 'ehime', name: '愛媛県' },
    { code: 'kochi', name: '高知県' },
    { code: 'fukuoka', name: '福岡県' },
    { code: 'saga', name: '佐賀県' },
    { code: 'nagasaki', name: '長崎県' },
    { code: 'kumamoto', name: '熊本県' },
    { code: 'oita', name: '大分県' },
    { code: 'miyazaki', name: '宮崎県' },
    { code: 'kagoshima', name: '鹿児島県' },
    { code: 'okinawa', name: '沖縄県' }
  ];

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService
  ) {
    // 年度選択用のリストを初期化（現在年度±2年）
    const currentYear = new Date().getFullYear();
    this.availableYears = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
    this.year = currentYear.toString();
    // 標準報酬等級表の年度選択用リストを初期化（現在年度±2年）
    this.availableGradeYears = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
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
      salaryMonthRule: ['payDate', Validators.required]
    });
    this.rateVersionForm = this.fb.group({
      applyFromMonth: [4, [Validators.required, Validators.min(1), Validators.max(12)]]
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

  async onGradeYearChange(): Promise<void> {
    const yearNum = parseInt(this.gradeYear, 10);
    this.standardTableYear = yearNum;
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
    await this.loadAllRates();
    
    // 給与月の判定方法をロード
    const salaryMonthRule = await this.settingsService.getSalaryMonthRule();
    this.settingsForm.patchValue({ salaryMonthRule });
    
    // 標準報酬等級表の年度を初期化
    this.standardTableYear = parseInt(this.gradeYear, 10);
    
    // 変更時に自動保存
    this.settingsForm.get('salaryMonthRule')?.valueChanges.subscribe(async (value) => {
      if (value) {
        await this.settingsService.saveSalaryMonthRule(value);
      }
    });
    
    // 適用開始月（改定月）をロード
    const versionInfo = await this.settingsService.getRateVersionInfo(this.year);
    this.rateVersionForm.patchValue({ applyFromMonth: versionInfo.applyFromMonth });
    
    // 変更時に自動保存
    this.rateVersionForm.get('applyFromMonth')?.valueChanges.subscribe(async (value) => {
      if (value && value >= 1 && value <= 12) {
        await this.settingsService.saveRateVersionInfo(this.year, value);
      }
    });
    
    await this.loadStandardTable();
    await this.loadSalaryItems();
  }

  async loadAllRates(): Promise<void> {
    // 47都道府県の健康保険料率を取得
    this.prefectureRates = {};
    for (const pref of this.prefectureList) {
      const data = await this.settingsService.getRates(this.year, pref.code);
      if (data) {
        this.prefectureRates[pref.code] = {
          health_employee: data.health_employee || 0,
          health_employer: data.health_employer || 0
        };
      } else {
        this.prefectureRates[pref.code] = { health_employee: 0, health_employer: 0 };
      }
    }
    
    // 介護保険と厚生年金は最初の都道府県（または東京）から取得（全国一律のため）
    const careData = await this.settingsService.getRates(this.year, 'tokyo');
    if (careData) {
      this.careRates = {
        care_employee: careData.care_employee || 0,
        care_employer: careData.care_employer || 0
      };
      this.pensionRates = {
        pension_employee: careData.pension_employee || 0,
        pension_employer: careData.pension_employer || 0
      };
    }
  }

  async onYearChange(): Promise<void> {
    await this.loadAllRates();
  }

  onHealthEmployeeInput(prefecture: string, event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value) || 0;
    if (!this.prefectureRates[prefecture]) {
      this.prefectureRates[prefecture] = { health_employee: 0, health_employer: 0 };
    }
    this.prefectureRates[prefecture].health_employee = value;
  }

  onHealthEmployerInput(prefecture: string, event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value) || 0;
    if (!this.prefectureRates[prefecture]) {
      this.prefectureRates[prefecture] = { health_employee: 0, health_employer: 0 };
    }
    this.prefectureRates[prefecture].health_employer = value;
  }

  async savePrefectureRate(prefecture: string): Promise<void> {
    const rate = this.prefectureRates[prefecture] || { health_employee: 0, health_employer: 0 };
    await this.settingsService.saveRates(this.year, prefecture, {
      health_employee: rate.health_employee || 0,
      health_employer: rate.health_employer || 0,
      care_employee: this.careRates.care_employee || 0,
      care_employer: this.careRates.care_employer || 0,
      pension_employee: this.pensionRates.pension_employee || 0,
      pension_employer: this.pensionRates.pension_employer || 0,
      effectiveFrom: `${this.year}-04`
    } as Rate);
  }

  async saveAllRates(): Promise<void> {
    for (const pref of this.prefectureList) {
      await this.savePrefectureRate(pref.code);
    }
    alert('47都道府県の料率を保存しました');
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
    const yearNum = parseInt(this.year, 10);
    await this.settingsService.seedRatesAllPrefectures2025();
    await this.loadAllRates();
    alert(`47都道府県の${yearNum}年度料率を登録しました`);
  }

  async saveSettings(): Promise<void> {
    const salaryMonthRule = this.settingsForm.get('salaryMonthRule')?.value || 'payDate';
    await this.settingsService.saveSalaryMonthRule(salaryMonthRule);
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

  async seedStandardTable(): Promise<void> {
    if (!confirm(`${this.standardTableYear}年度の標準報酬等級表（50等級）を一括登録しますか？\n既存のデータは上書きされます。`)) {
      return;
    }
    
    try {
      await this.settingsService.seedStandardTable(this.standardTableYear);
      alert(`${this.standardTableYear}年度の標準報酬等級表（50等級）を登録しました`);
      // テーブルを再読み込み
      await this.loadStandardTable();
    } catch (error) {
      console.error('標準報酬等級表の一括登録エラー:', error);
      alert('標準報酬等級表の一括登録に失敗しました');
    }
  }
}

