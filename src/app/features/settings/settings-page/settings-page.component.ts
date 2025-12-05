import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  Validators,
  FormArray,
  FormGroup,
} from '@angular/forms';
import { SettingsService } from '../../../services/settings.service';
import { OfficeService } from '../../../services/office.service';
import { AuthService } from '../../../services/auth.service';
import { RoomService } from '../../../services/room.service';
import { EditLogService } from '../../../services/edit-log.service';
import { RoomIdService } from '../../../services/room-id.service';
import { Settings } from '../../../models/settings.model';
import { Rate } from '../../../models/rate.model';
import { SalaryItem } from '../../../models/salary-item.model';
import { Office } from '../../../models/office.model';
import { EditLog } from '../../../models/edit-log.model';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css',
})
export class SettingsPageComponent implements OnInit {
  year = '2025';
  availableYears: number[] = [];
  standardTableYear: number = new Date().getFullYear();
  gradeYear: string = new Date().getFullYear().toString();
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
  // タブ管理
  activeTab:
    | 'rate'
    | 'standard'
    | 'salaryItems'
    | 'office'
    | 'editLog'
    | 'userRoom' = 'rate';

  // 事業所マスタ関連
  offices: Office[] = [];
  selectedOffice: Office | null = null;
  officeForm: FormGroup;

  // CSVインポート関連（保険料率用）
  showImportDialog: boolean = false;
  csvImportText: string = '';
  importResult: { type: 'success' | 'error'; message: string } | null = null;

  // CSVインポート関連（標準報酬月額テーブル用）
  showStandardTableImportDialog: boolean = false;
  standardTableCsvImportText: string = '';
  standardTableImportResult: {
    type: 'success' | 'error';
    message: string;
  } | null = null;

  // ユーザー・ルーム情報関連
  currentUser: User | null = null;
  roomInfo: { id: string; name: string; password: string } | null = null;

  // 編集ログ関連
  editLogs: EditLog[] = [];
  filteredEditLogs: EditLog[] = [];
  isLoadingLogs = false;
  filterDate: string = '';
  filterUserName: string = '';
  availableUserNames: string[] = [];

  // 保存中フラグ
  isSavingRates = false;
  isSavingStandardTable = false;

  // 47都道府県の料率データ（パーセント形式で保持）
  prefectureRates: {
    [prefecture: string]: { health_employee: number; health_employer: number };
  } = {};
  careRates: { care_employee: number; care_employer: number } = {
    care_employee: 0,
    care_employer: 0,
  };
  pensionRates: { pension_employee: number; pension_employer: number } = {
    pension_employee: 0,
    pension_employer: 0,
  };

  // パーセント→小数変換ヘルパー
  private percentToDecimal(percent: number): number {
    return percent / 100;
  }

  // 小数→パーセント変換ヘルパー
  private decimalToPercent(decimal: number): number {
    return decimal * 100;
  }

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
    { code: 'okinawa', name: '沖縄県' },
  ];

  getPrefectureListColumn1(): any[] {
    return this.prefectureList.slice(
      0,
      Math.ceil(this.prefectureList.length / 2)
    );
  }

  getPrefectureListColumn2(): any[] {
    return this.prefectureList.slice(Math.ceil(this.prefectureList.length / 2));
  }

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService,
    private officeService: OfficeService,
    private authService: AuthService,
    private roomService: RoomService,
    private editLogService: EditLogService,
    private roomIdService: RoomIdService,
    private cdr: ChangeDetectorRef
  ) {
    // 年度選択用のリストを初期化（現在年度±2年）
    const currentYear = new Date().getFullYear();
    this.availableYears = [
      currentYear - 2,
      currentYear - 1,
      currentYear,
      currentYear + 1,
      currentYear + 2,
    ];
    this.year = currentYear.toString();
    // 標準報酬等級表の年度選択用リストを初期化（現在年度±2年）
    this.availableGradeYears = [
      currentYear - 2,
      currentYear - 1,
      currentYear,
      currentYear + 1,
      currentYear + 2,
    ];
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
    // 給与月判定設定は削除（常に4-6月を使用）
    this.settingsForm = this.fb.group({});
    this.rateVersionForm = this.fb.group({
      applyFromMonth: [
        4,
        [Validators.required, Validators.min(1), Validators.max(12)],
      ],
    });
    this.standardTable = this.fb.array([]);
    this.standardTableForm = this.fb.group({
      standardTable: this.standardTable,
    });
    this.salaryItems = this.fb.array([]);
    this.salaryItemsForm = this.fb.group({
      salaryItems: this.salaryItems,
    });
    this.officeForm = this.fb.group({
      officeCode: [''],
      officeNumber: [''],
      corporateNumber: [''],
      prefecture: ['tokyo'], // デフォルトは東京都
      address: [''],
      officeName: [''],
      phoneNumber: [''],
      ownerName: [''],
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
    const rows = await this.settingsService.getStandardTable(
      this.standardTableYear
    );
    rows.forEach((r) => this.standardTable.push(this.createRow(r)));
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
        this.errorMessages.push(
          `等級${rank}: 下限は上限より小さくする必要があります`
        );
      }

      if (standard !== null && (standard < lower || standard >= upper)) {
        this.warningMessages.push(
          `等級${rank}: 標準報酬月額が範囲外です（下限: ${lower}, 上限: ${upper}）`
        );
      }

      // テーブルが昇順になっているかのチェック（前の等級の上限 = 次の等級の下限）
      if (i > 0) {
        const prevRow = this.standardTable.at(i - 1);
        const prevUpper = prevRow.get('upper')?.value;
        if (prevUpper !== null && lower !== null && prevUpper !== lower) {
          this.errorMessages.push(
            `等級${
              prevRow.get('rank')?.value
            }と等級${rank}の範囲に不整合があります（前等級の上限: ${prevUpper}, 当等級の下限: ${lower}）`
          );
        }
      }
    }
  }

  async saveStandardTable(): Promise<void> {
    if (this.isSavingStandardTable) return;

    this.validateStandardTable();
    if (this.errorMessages.length > 0) {
      alert('エラーがあります。修正してください。');
      return;
    }

    this.isSavingStandardTable = true;
    try {
      await this.settingsService.saveStandardTable(
        this.standardTableYear,
        this.standardTable.value
      );
      alert('標準報酬月額テーブルを保存しました');
    } catch (error) {
      console.error('標準報酬月額テーブルの保存エラー:', error);
      alert('標準報酬月額テーブルの保存に失敗しました');
    } finally {
      this.isSavingStandardTable = false;
    }
  }

  clearStandardTable(): void {
    if (
      !confirm(
        '標準報酬月額テーブルをすべてクリアしますか？\nこの操作は取り消せません。'
      )
    ) {
      return;
    }
    while (this.standardTable.length !== 0) {
      this.standardTable.removeAt(0);
    }
    this.errorMessages = [];
    this.warningMessages = [];
    this.cdr.detectChanges();
  }

  async ngOnInit(): Promise<void> {
    await this.loadAllRates();

    // 標準報酬等級表の年度を初期化
    this.standardTableYear = parseInt(this.gradeYear, 10);

    // 適用開始月（改定月）をロード
    const versionInfo = await this.settingsService.getRateVersionInfo(
      this.year
    );
    this.rateVersionForm.patchValue({
      applyFromMonth: versionInfo.applyFromMonth,
    });

    // 変更時に自動保存
    this.rateVersionForm
      .get('applyFromMonth')
      ?.valueChanges.subscribe(async (value) => {
        if (value && value >= 1 && value <= 12) {
          await this.settingsService.saveRateVersionInfo(this.year, value);
        }
      });

    await this.loadStandardTable();
    await this.loadSalaryItems();
    await this.loadOffices();
    await this.loadUserRoomInfo();
  }

  // 編集ログタブがクリックされたときの処理
  async onEditLogTabClick(): Promise<void> {
    this.activeTab = 'editLog';
    await this.loadEditLogs();
  }

  // 編集ログを読み込む
  async loadEditLogs(): Promise<void> {
    this.isLoadingLogs = true;
    try {
      this.editLogs = await this.editLogService.getEditLogs(100);
      // ユーザー名のリストを取得
      this.availableUserNames = [
        ...new Set(this.editLogs.map((log) => log.userName)),
      ].sort();
      // フィルターを適用
      this.applyFilters();
    } catch (error) {
      console.error('[SettingsPage] 編集ログの読み込みエラー:', error);
    } finally {
      this.isLoadingLogs = false;
    }
  }

  // フィルターを適用
  applyFilters(): void {
    let filtered = [...this.editLogs];

    // 日付フィルター
    if (this.filterDate) {
      const filterDateObj = new Date(this.filterDate);
      filterDateObj.setHours(0, 0, 0, 0);
      const filterDateEnd = new Date(filterDateObj);
      filterDateEnd.setHours(23, 59, 59, 999);

      filtered = filtered.filter((log) => {
        const logDate = new Date(log.timestamp);
        return logDate >= filterDateObj && logDate <= filterDateEnd;
      });
    }

    // ユーザーフィルター
    if (this.filterUserName) {
      filtered = filtered.filter((log) => log.userName === this.filterUserName);
    }

    this.filteredEditLogs = filtered;
  }

  // 日付フィルターをクリア
  clearDateFilter(): void {
    this.filterDate = '';
    this.applyFilters();
  }

  // アクション名を日本語に変換
  getActionLabel(action: string): string {
    switch (action) {
      case 'create':
        return '追加';
      case 'update':
        return '編集';
      case 'delete':
        return '削除';
      default:
        return action;
    }
  }

  // エンティティタイプ名を日本語に変換
  getEntityTypeLabel(entityType: string): string {
    const labels: { [key: string]: string } = {
      employee: '従業員',
      office: '事業所',
      settings: '設定',
      salary: '給与',
      bonus: '賞与',
      insurance: '保険料',
    };
    return labels[entityType] || entityType;
  }

  // 日時をフォーマット
  formatDateTime(date: Date): string {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ユーザー・ルーム情報を読み込む
  async loadUserRoomInfo(): Promise<void> {
    // 現在のユーザー情報を取得
    this.currentUser = this.authService.getCurrentUser();

    // ルーム情報を取得
    const roomId = sessionStorage.getItem('roomId');
    if (roomId) {
      try {
        const roomData = await this.roomService.getRoom(roomId);
        if (roomData) {
          this.roomInfo = {
            id: roomId,
            name: roomData.companyName || '未設定',
            password: roomData.password,
          };
        }
      } catch (error) {
        console.error('[SettingsPage] ルーム情報の取得エラー:', error);
      }
    }
  }

  // 事業所マスタ関連メソッド
  async loadOffices(): Promise<void> {
    this.offices = await this.officeService.getAllOffices();
  }

  selectOffice(office: Office | null): void {
    this.selectedOffice = office;
    if (office) {
      this.officeForm.patchValue({
        officeCode: office.officeCode || '',
        officeNumber: office.officeNumber || '',
        corporateNumber: office.corporateNumber || '',
        prefecture: office.prefecture || 'tokyo',
        address: office.address || '',
        officeName: office.officeName || '',
        phoneNumber: office.phoneNumber || '',
        ownerName: office.ownerName || '',
      });
    } else {
      this.officeForm.reset({
        prefecture: 'tokyo', // リセット時もデフォルト値を設定
      });
    }
  }

  async saveOffice(): Promise<void> {
    const value = this.officeForm.value;
    const roomId = this.roomIdService.requireRoomId();
    const office: Office = {
      id: this.selectedOffice?.id,
      roomId: roomId,
      officeCode: value.officeCode || undefined,
      officeNumber: value.officeNumber || undefined,
      corporateNumber: value.corporateNumber || undefined,
      prefecture: value.prefecture || undefined,
      address: value.address || undefined,
      officeName: value.officeName || undefined,
      phoneNumber: value.phoneNumber || undefined,
      ownerName: value.ownerName || undefined,
      createdAt: this.selectedOffice?.createdAt || new Date(),
    };

    const savedId = await this.officeService.saveOffice(office);
    // 新規作成の場合は、保存されたIDを設定
    if (!this.selectedOffice?.id) {
      office.id = savedId;
    }
    alert('事業所マスタを保存しました');
    await this.loadOffices();
    // 保存した事業所を選択状態に保つ
    if (office.id) {
      const savedOffice = this.offices.find((o) => o.id === office.id);
      if (savedOffice) {
        this.selectOffice(savedOffice);
      } else {
        this.selectOffice(null);
      }
    } else {
      this.selectOffice(null);
    }
  }

  async deleteOffice(officeId: string): Promise<void> {
    if (!confirm('この事業所マスタを削除しますか？')) {
      return;
    }
    await this.officeService.deleteOffice(officeId);
    alert('事業所マスタを削除しました');
    await this.loadOffices();
    if (this.selectedOffice?.id === officeId) {
      this.selectOffice(null);
    }
  }

  addNewOffice(): void {
    this.selectOffice(null);
  }

  async loadAllRates(): Promise<void> {
    // 47都道府県の健康保険料率を取得（小数→パーセント変換）
    this.prefectureRates = {};
    for (const pref of this.prefectureList) {
      const data = await this.settingsService.getRates(this.year, pref.code);
      if (data) {
        this.prefectureRates[pref.code] = {
          health_employee: this.decimalToPercent(data.health_employee || 0),
          health_employer: this.decimalToPercent(data.health_employer || 0),
        };
      } else {
        this.prefectureRates[pref.code] = {
          health_employee: 0,
          health_employer: 0,
        };
      }
    }

    // 介護保険と厚生年金は最初の都道府県（または東京）から取得（全国一律のため、小数→パーセント変換）
    const careData = await this.settingsService.getRates(this.year, 'tokyo');
    if (careData) {
      this.careRates = {
        care_employee: this.decimalToPercent(careData.care_employee || 0),
        care_employer: this.decimalToPercent(careData.care_employer || 0),
      };
      this.pensionRates = {
        pension_employee: this.decimalToPercent(careData.pension_employee || 0),
        pension_employer: this.decimalToPercent(careData.pension_employer || 0),
      };
    } else {
      // データが存在しない場合は、既存の値を保持（初期化しない）
      // これにより、ユーザーが入力した値が消えない
      if (!this.careRates || Object.keys(this.careRates).length === 0) {
        this.careRates = {
          care_employee: 0,
          care_employer: 0,
        };
      }
      if (!this.pensionRates || Object.keys(this.pensionRates).length === 0) {
        this.pensionRates = {
          pension_employee: 0,
          pension_employer: 0,
        };
      }
    }
  }

  async onYearChange(): Promise<void> {
    await this.loadAllRates();
  }

  /**
   * 小数点以下5位に丸める（6位以下を切り捨て）
   */
  private roundTo5Decimals(value: number): number {
    return Math.floor(value * 100000) / 100000;
  }

  /**
   * 健康保険料率を小数点以下3位に丸める（4位以下を切り捨て）
   */
  private roundHealthRateTo3Decimals(value: number): number {
    return Math.floor(value * 1000) / 1000;
  }

  /**
   * 健康保険料率の表示を小数点以下3位までフォーマット
   */
  formatHealthRate(value: number): number {
    return this.roundHealthRateTo3Decimals(value);
  }

  onHealthEmployeeInput(prefecture: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value) || 0;
    if (!this.prefectureRates[prefecture]) {
      this.prefectureRates[prefecture] = {
        health_employee: 0,
        health_employer: 0,
      };
    }
    // 小数点以下3位に丸める（4位以下を切り捨て）
    const roundedValue = this.roundHealthRateTo3Decimals(value);
    // パーセント形式で保持
    this.prefectureRates[prefecture].health_employee = roundedValue;
    // 入力欄の表示も更新（小数点以下3位まで）
    input.value = roundedValue.toFixed(3);
  }

  onHealthEmployerInput(prefecture: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value) || 0;
    if (!this.prefectureRates[prefecture]) {
      this.prefectureRates[prefecture] = {
        health_employee: 0,
        health_employer: 0,
      };
    }
    // 小数点以下3位に丸める（4位以下を切り捨て）
    const roundedValue = this.roundHealthRateTo3Decimals(value);
    // パーセント形式で保持
    this.prefectureRates[prefecture].health_employer = roundedValue;
    // 入力欄の表示も更新（小数点以下3位まで）
    input.value = roundedValue.toFixed(3);
  }

  async savePrefectureRate(prefecture: string): Promise<void> {
    const rate = this.prefectureRates[prefecture] || {
      health_employee: 0,
      health_employer: 0,
    };
    // 健康保険料率は小数点以下3位に丸める（4位以下を切り捨て）
    const roundedHealthEmployee = this.roundHealthRateTo3Decimals(
      rate.health_employee || 0
    );
    const roundedHealthEmployer = this.roundHealthRateTo3Decimals(
      rate.health_employer || 0
    );
    // 介護保険と厚生年金は小数点以下5位に丸める
    const roundedCareEmployee = this.roundTo5Decimals(
      this.careRates.care_employee || 0
    );
    const roundedCareEmployer = this.roundTo5Decimals(
      this.careRates.care_employer || 0
    );
    const roundedPensionEmployee = this.roundTo5Decimals(
      this.pensionRates.pension_employee || 0
    );
    const roundedPensionEmployer = this.roundTo5Decimals(
      this.pensionRates.pension_employer || 0
    );

    // パーセント→小数変換して保存
    await this.settingsService.saveRates(this.year, prefecture, {
      health_employee: this.percentToDecimal(roundedHealthEmployee),
      health_employer: this.percentToDecimal(roundedHealthEmployer),
      care_employee: this.percentToDecimal(roundedCareEmployee),
      care_employer: this.percentToDecimal(roundedCareEmployer),
      pension_employee: this.percentToDecimal(roundedPensionEmployee),
      pension_employer: this.percentToDecimal(roundedPensionEmployer),
      effectiveFrom: `${this.year}-04`,
    } as Rate);
  }

  async saveAllRates(): Promise<void> {
    if (this.isSavingRates) return;

    this.isSavingRates = true;
    try {
      for (const pref of this.prefectureList) {
        await this.savePrefectureRate(pref.code);
      }
      alert('保険料率を保存しました');
    } catch (error) {
      console.error('保険料率の保存エラー:', error);
      alert('保険料率の保存に失敗しました');
    } finally {
      this.isSavingRates = false;
    }
  }

  async clearAllRates(): Promise<void> {
    if (
      !confirm('すべての料率をクリアしますか？\nこの操作は取り消せません。')
    ) {
      return;
    }
    // 47都道府県の料率をクリア（画面表示用）
    for (const pref of this.prefectureList) {
      this.prefectureRates[pref.code] = {
        health_employee: 0,
        health_employer: 0,
      };
    }
    // 介護保険料率をクリア（画面表示用）
    this.careRates = {
      care_employee: 0,
      care_employer: 0,
    };
    // 厚生年金料率をクリア（画面表示用）
    this.pensionRates = {
      pension_employee: 0,
      pension_employer: 0,
    };
    // Firestoreにも0を保存（現在選択している年度のデータを削除）
    try {
      for (const pref of this.prefectureList) {
        await this.savePrefectureRate(pref.code);
      }
      alert('すべての料率をクリアしました');
    } catch (error) {
      console.error('料率のクリアエラー:', error);
      alert('料率のクリアに失敗しました');
    }
    this.cdr.detectChanges();
  }

  // CSVインポート機能
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        this.importFromCsvText(text);
      };
      reader.readAsText(file, 'UTF-8');
    }
  }

  importFromText(): void {
    if (!this.csvImportText.trim()) {
      this.importResult = {
        type: 'error',
        message: 'CSVデータが入力されていません',
      };
      return;
    }
    this.importFromCsvText(this.csvImportText);
  }

  importFromCsvText(csvText: string): void {
    try {
      const lines = csvText.split('\n').filter((line) => line.trim());
      if (lines.length < 2) {
        this.importResult = {
          type: 'error',
          message: 'CSVデータが不正です（最低2行必要：ヘッダー＋データ行）',
        };
        return;
      }

      // ヘッダー行をスキップ
      const dataLines = lines.slice(1);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // 都道府県名→コードのマッピングを作成
      const prefectureMap = new Map<string, string>();
      this.prefectureList.forEach((pref) => {
        prefectureMap.set(pref.name, pref.code);
      });

      // 都道府県コードをキーとして重複を防ぐ（同じ都道府県が複数回出現した場合は上書き）
      const ratesToAdd: Map<
        string,
        { health_employee: number; health_employer: number }
      > = new Map();

      for (const line of dataLines) {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 3) {
          errorCount++;
          errors.push(`行「${line}」: 列数が不足しています（3列必要）`);
          continue;
        }

        const prefectureName = parts[0];
        const employeeRateStr = parts[1];
        const employerRateStr = parts[2];

        // 都道府県コードを取得
        const prefectureCode = prefectureMap.get(prefectureName);
        if (!prefectureCode) {
          errorCount++;
          errors.push(
            `行「${line}」: 都道府県名「${prefectureName}」が見つかりません`
          );
          continue;
        }

        // 数値に変換（パーセント形式）
        const employeeRate = parseFloat(employeeRateStr);
        const employerRate = parseFloat(employerRateStr);

        if (isNaN(employeeRate) || isNaN(employerRate)) {
          errorCount++;
          errors.push(`行「${line}」: 料率が数値ではありません`);
          continue;
        }

        if (
          employeeRate < 0 ||
          employeeRate > 100 ||
          employerRate < 0 ||
          employerRate > 100
        ) {
          errorCount++;
          errors.push(`行「${line}」: 料率は0〜100%の範囲で入力してください`);
          continue;
        }

        // 同じ都道府県が既に存在する場合は上書き（Mapを使用して自動的に上書き）
        ratesToAdd.set(prefectureCode, {
          health_employee: employeeRate,
          health_employer: employerRate,
        });
        successCount++;
      }

      // パース済みの料率を設定（パーセント形式で保持）
      ratesToAdd.forEach((rates, prefectureCode) => {
        if (!this.prefectureRates[prefectureCode]) {
          this.prefectureRates[prefectureCode] = {
            health_employee: 0,
            health_employer: 0,
          };
        }
        this.prefectureRates[prefectureCode].health_employee =
          rates.health_employee;
        this.prefectureRates[prefectureCode].health_employer =
          rates.health_employer;
      });

      // 結果メッセージ
      if (errorCount === 0) {
        this.importResult = {
          type: 'success',
          message: `${successCount}件の料率をインポートしました`,
        };
        this.showImportDialog = false;
        this.csvImportText = '';
      } else {
        const errorMsg = errors.slice(0, 5).join('\n');
        const moreErrors =
          errors.length > 5 ? `\n...他${errors.length - 5}件のエラー` : '';
        this.importResult = {
          type: 'error',
          message: `成功: ${successCount}件、エラー: ${errorCount}件\n${errorMsg}${moreErrors}`,
        };
      }
    } catch (error) {
      this.importResult = {
        type: 'error',
        message: `インポート中にエラーが発生しました: ${error}`,
      };
    }
  }

  async onPrefectureChange(): Promise<void> {
    this.prefecture = this.form.get('prefecture')?.value || 'tokyo';
    await this.reloadRates();
  }

  async reloadRates(): Promise<void> {
    const data = await this.settingsService.getRates(
      this.year,
      this.prefecture
    );
    if (data) {
      this.form.patchValue(data);
    }
  }

  validateRates(): void {
    this.errorMessages = [];
    this.warningMessages = [];

    const values = this.form.value;
    const rateFields = [
      'health_employee',
      'health_employer',
      'care_employee',
      'care_employer',
      'pension_employee',
      'pension_employer',
    ];

    for (const field of rateFields) {
      const value = values[field];
      if (value < 0 || value > 1) {
        this.errorMessages.push(
          `${field}: 料率は0以上1以下である必要があります`
        );
      }
    }
  }

  async save(): Promise<void> {
    this.validateRates();
    if (this.errorMessages.length > 0) {
      return;
    }
    const prefectureValue =
      this.form.get('prefecture')?.value || this.prefecture;
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
    const salaryMonthRule =
      this.settingsForm.get('salaryMonthRule')?.value || 'payDate';
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
      type: [item?.type || 'fixed', Validators.required],
    });
  }

  generateId(): string {
    return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async loadSalaryItems(): Promise<void> {
    while (this.salaryItems.length !== 0) {
      this.salaryItems.removeAt(0);
    }
    const items = await this.settingsService.loadSalaryItems(
      this.salaryItemsYear
    );
    items.forEach((item) =>
      this.salaryItems.push(this.createSalaryItemRow(item))
    );
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

  onSalaryItemTypeChange(index: number): void {
    const itemGroup = this.salaryItems.at(index) as FormGroup;
    const typeValue = itemGroup.get('type')?.value;

    // 種別が「欠勤控除」に変更された場合、項目名を自動で「欠勤控除」に設定
    if (typeValue === 'deduction') {
      itemGroup.get('name')?.setValue('欠勤控除');
    }
  }

  async saveSalaryItems(): Promise<void> {
    const items: SalaryItem[] = this.salaryItems.value;
    await this.settingsService.saveSalaryItems(this.salaryItemsYear, items);
    alert('給与項目マスタを保存しました');
  }

  async seedStandardTable(): Promise<void> {
    if (
      !confirm(
        `${this.standardTableYear}年度の標準報酬等級表（50等級）を一括登録しますか？\n既存のデータは上書きされます。`
      )
    ) {
      return;
    }

    try {
      await this.settingsService.seedStandardTable(this.standardTableYear);
      alert(
        `${this.standardTableYear}年度の標準報酬等級表（50等級）を登録しました`
      );
      // テーブルを再読み込み
      await this.loadStandardTable();
    } catch (error) {
      console.error('標準報酬等級表の一括登録エラー:', error);
      alert('標準報酬等級表の一括登録に失敗しました');
    }
  }

  // 標準報酬月額テーブルCSVインポート関連
  onStandardTableFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      this.standardTableCsvImportText = text;
      this.importStandardTableFromCsvText(text);
    };
    reader.readAsText(file);
  }

  importStandardTableFromText(): void {
    if (!this.standardTableCsvImportText.trim()) {
      this.standardTableImportResult = {
        type: 'error',
        message: 'CSVデータが入力されていません',
      };
      return;
    }
    this.importStandardTableFromCsvText(this.standardTableCsvImportText);
  }

  importStandardTableFromCsvText(csvText: string): void {
    try {
      const lines = csvText.split('\n').filter((line) => line.trim());
      if (lines.length < 2) {
        this.standardTableImportResult = {
          type: 'error',
          message: 'CSVデータが不正です（最低2行必要：ヘッダー＋データ行）',
        };
        return;
      }

      // ヘッダー行をスキップ
      const dataLines = lines.slice(1);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const rowsToAdd: Map<number, any> = new Map(); // 等級をキーとして重複を防ぐ

      // CSVデータをパースして一時配列に格納
      for (const line of dataLines) {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 4) {
          errorCount++;
          errors.push(
            `行「${line}」: 列数が不足しています（4列必要：等級,標準報酬月額,下限,上限）`
          );
          continue;
        }

        const rankStr = parts[0];
        const standardStr = parts[1];
        const lowerStr = parts[2];
        const upperStr = parts[3];

        // 数値に変換
        const rank = parseInt(rankStr, 10);
        const standard = parseInt(standardStr.replace(/,/g, ''), 10);
        const lower = parseInt(lowerStr.replace(/,/g, ''), 10);
        const upper = parseInt(upperStr.replace(/,/g, ''), 10);

        if (isNaN(rank) || isNaN(standard) || isNaN(lower) || isNaN(upper)) {
          errorCount++;
          errors.push(`行「${line}」: 数値が不正です`);
          continue;
        }

        if (rank < 1 || rank > 50) {
          errorCount++;
          errors.push(`行「${line}」: 等級は1〜50の範囲で入力してください`);
          continue;
        }

        if (lower < 0 || upper < 0 || standard < 0) {
          errorCount++;
          errors.push(`行「${line}」: 金額は0以上で入力してください`);
          continue;
        }

        if (lower >= upper) {
          errorCount++;
          errors.push(`行「${line}」: 下限は上限より小さくする必要があります`);
          continue;
        }

        // 同じ等級が既に存在する場合は上書き（Mapを使用して自動的に上書き）
        rowsToAdd.set(rank, {
          id: `grade-${rank}`,
          rank: rank,
          standard: standard,
          lower: lower,
          upper: upper,
        });
        successCount++;
      }

      // 等級順にソート
      const sortedRows = Array.from(rowsToAdd.values()).sort(
        (a, b) => a.rank - b.rank
      );

      // 既存のテーブルをクリア
      while (this.standardTable.length !== 0) {
        this.standardTable.removeAt(0);
      }

      // ソート済みデータをFormArrayに追加
      sortedRows.forEach((rowData) => {
        const row = this.createRow(rowData);
        this.standardTable.push(row);
      });

      // バリデーション実行
      this.validateStandardTable();

      // 変更検知を確実にする
      this.cdr.detectChanges();

      // 結果メッセージ
      if (errorCount > 0) {
        this.standardTableImportResult = {
          type: 'error',
          message: `${successCount}件のインポートに成功しましたが、${errorCount}件のエラーがあります。${errors
            .slice(0, 5)
            .join(' / ')}${errors.length > 5 ? ' ...' : ''}`,
        };
      } else {
        this.standardTableImportResult = {
          type: 'success',
          message: `${successCount}件のデータをインポートしました`,
        };
        this.showStandardTableImportDialog = false;
        this.standardTableCsvImportText = '';
      }
    } catch (error) {
      console.error('CSVインポートエラー:', error);
      this.standardTableImportResult = {
        type: 'error',
        message: `インポート中にエラーが発生しました: ${error}`,
      };
    }
  }
}
