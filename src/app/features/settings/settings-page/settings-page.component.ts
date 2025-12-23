import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  Validators,
  FormArray,
  FormGroup,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SettingsService } from '../../../services/settings.service';
import { OfficeService } from '../../../services/office.service';
import { AuthService } from '../../../services/auth.service';
import { RoomService } from '../../../services/room.service';
import { EditLogService } from '../../../services/edit-log.service';
import { RoomIdService } from '../../../services/room-id.service';
import { EmployeeService } from '../../../services/employee.service';
import { Settings } from '../../../models/settings.model';
import { Rate } from '../../../models/rate.model';
import { SalaryItem } from '../../../models/salary-item.model';
import { Office } from '../../../models/office.model';
import { EditLog } from '../../../models/edit-log.model';
import { User } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css',
})
export class SettingsPageComponent {
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
  isImportingRates: boolean = false;

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

  // 初回案内モーダル
  showOnboardingGuide = false;

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
    if (isNaN(percent) || !isFinite(percent)) {
      return 0;
    }
    return percent / 100;
  }

  // 小数→パーセント変換ヘルパー
  private decimalToPercent(decimal: number): number {
    if (isNaN(decimal) || !isFinite(decimal)) {
      return 0;
    }
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
    private employeeService: EmployeeService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {
    // 年度選択用のリストを初期化（2020〜2029年：2020/3-2021/2から2029/3-2030/2まで）
    // 3月〜翌2月の年度で扱うため、基準年は「3月を含む年」
    this.availableYears = [];
    for (let y = 2020; y <= 2029; y++) {
      this.availableYears.push(y);
    }
    const currentYear = new Date().getFullYear();
    // 現在年度が範囲内の場合は現在年度を、範囲外の場合は2020年をデフォルトに設定
    this.year =
      currentYear >= 2020 && currentYear <= 2029
        ? currentYear.toString()
        : '2020';
    // 標準報酬等級表の年度選択用リストを初期化（2020〜2029年：2020/3-2021/2から2029/3-2030/2まで）
    this.availableGradeYears = [];
    for (let y = 2020; y <= 2029; y++) {
      this.availableGradeYears.push(y);
    }
    this.form = this.fb.group({
      prefecture: [this.prefecture, Validators.required],
      effectiveFrom: [`${this.year}-03`, Validators.required],
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
        3,
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
      address: ['', Validators.required],
      officeName: [''],
      phoneNumber: [''],
      ownerName: ['', Validators.required],
    });
  }

  formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || value === 0) {
      return '';
    }
    if (isNaN(value) || !isFinite(value)) {
      return '';
    }
    return value.toLocaleString('ja-JP');
  }

  parseAmount(value: string): number {
    // カンマを削除して数値に変換
    const numStr = value.replace(/,/g, '');
    const num = parseInt(numStr, 10);
    if (isNaN(num) || !isFinite(num)) {
      return 0;
    }
    return num;
  }

  onAmountInput(index: number, field: string, event: Event): void {
    try {
      const input = event.target as HTMLInputElement;
      const value = input.value;
      const numValue = this.parseAmount(value);
      const row = this.standardTable.at(index);
      if (row) {
        row.get(field)?.setValue(numValue, { emitEvent: false });

        // カンマ付きで表示を更新
        input.value = this.formatAmount(numValue);

        // バリデーション実行
        this.validateStandardTable();
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  onAmountBlur(index: number, field: string, event: Event): void {
    try {
      const input = event.target as HTMLInputElement;
      const numValue = this.parseAmount(input.value);
      const row = this.standardTable.at(index);
      if (row) {
        row.get(field)?.setValue(numValue, { emitEvent: false });
        input.value = this.formatAmount(numValue);
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  getAmountDisplayValue(index: number, field: string): string {
    try {
      const row = this.standardTable.at(index);
      if (!row) {
        return '';
      }
      const value = row.get(field)?.value;
      return this.formatAmount(value);
    } catch (error) {
      return '';
    }
  }

  createRow(row: any): FormGroup {
    // デフォルト値を設定して、nullやundefinedを防ぐ
    const rank = row?.rank ?? 0;
    const lower = row?.lower ?? 0;
    const upper = row?.upper ?? 0;
    const standard = row?.standard ?? 0;
    const id = row?.id ?? `grade-${rank}`;

    // NaNや無限大のチェック
    const safeRank = isNaN(rank) || !isFinite(rank) ? 0 : rank;
    const safeLower = isNaN(lower) || !isFinite(lower) ? 0 : lower;
    const safeUpper = isNaN(upper) || !isFinite(upper) ? 0 : upper;
    const safeStandard = isNaN(standard) || !isFinite(standard) ? 0 : standard;

    return this.fb.group({
      id: [id],
      rank: [safeRank],
      lower: [safeLower],
      upper: [safeUpper],
      standard: [safeStandard],
    });
  }

  async loadStandardTable(): Promise<void> {
    try {
      // 既存のデータをクリア
      while (this.standardTable.length !== 0) {
        this.standardTable.removeAt(0);
      }
      const rows = await this.settingsService.getStandardTable(
        this.standardTableYear
      );
      if (rows && Array.isArray(rows)) {
        rows.forEach((r) => {
          if (r) {
            const row = this.createRow(r);
            if (row) {
              this.standardTable.push(row);
            }
          }
        });
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  async onStandardTableYearChange(): Promise<void> {
    // 年度を変更した際に、前のインポート結果メッセージをクリア
    this.standardTableImportResult = null;
    try {
      await this.loadStandardTable();
    } catch (error) {
      // エラーはloadStandardTable内で処理されているため、ここでは何もしない
    }
  }

  async onGradeYearChange(): Promise<void> {
    try {
      const yearNum = parseInt(this.gradeYear, 10);
      if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
        alert('無効な年度が設定されています');
        return;
      }
      this.standardTableYear = yearNum;
      // 年度を変更した際に、前のインポート結果メッセージをクリア
      this.standardTableImportResult = null;
      await this.loadStandardTable();
    } catch (error) {
      // エラーはloadStandardTable内で処理されているため、ここでは何もしない
    }
  }

  validateStandardTable(): void {
    this.errorMessages = [];
    this.warningMessages = [];

    try {
      for (let i = 0; i < this.standardTable.length; i++) {
        const row = this.standardTable.at(i);
        if (!row) {
          continue;
        }
        const lower = row.get('lower')?.value;
        const upper = row.get('upper')?.value;
        const standard = row.get('standard')?.value;
        const rank = row.get('rank')?.value;

        // NaNや無限大のチェック
        if (
          (lower !== null && (isNaN(lower) || !isFinite(lower))) ||
          (upper !== null && (isNaN(upper) || !isFinite(upper))) ||
          (standard !== null && (isNaN(standard) || !isFinite(standard))) ||
          (rank !== null && (isNaN(rank) || !isFinite(rank)))
        ) {
          this.errorMessages.push(`等級${rank}: 数値が不正です`);
          continue;
        }

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
          if (prevRow) {
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
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  /**
   * 新規作成ルームの初回入室時に案内を表示
   */
  private showFirstEntryGuideIfNeeded(roomId: string): void {
    const key = `room_onboarding_${roomId}`;
    const flag = localStorage.getItem(key);
    if (flag === '1') {
      // ページ内モーダルで案内を表示し、閉じるとフラグを削除
      this.showOnboardingGuide = true;
      localStorage.removeItem(key);
      // 変更検知を強制的に実行（ビューが更新されるように）
      this.cdr.detectChanges();
    }
  }

  closeOnboardingGuide(): void {
    this.showOnboardingGuide = false;
  }

  async saveStandardTable(): Promise<void> {
    if (this.isSavingStandardTable) return;

    // 年度のバリデーション
    if (
      !this.standardTableYear ||
      this.standardTableYear < 1900 ||
      this.standardTableYear > 2100
    ) {
      alert('無効な年度が設定されています');
      return;
    }

    // standardTableの存在確認
    if (!this.standardTable || !this.standardTable.value) {
      alert('標準報酬月額テーブルのデータが存在しません');
      return;
    }

    this.validateStandardTable();
    if (this.errorMessages.length > 0) {
      alert('エラーがあります。修正してください。');
      return;
    }

    this.isSavingStandardTable = true;
    try {
      const tableValue = this.standardTable.value;
      if (!Array.isArray(tableValue) || tableValue.length === 0) {
        alert('標準報酬月額テーブルにデータがありません');
        return;
      }
      await this.settingsService.saveStandardTable(
        this.standardTableYear,
        tableValue
      );
      alert('標準報酬月額テーブルを保存しました');
    } catch (error) {
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
    // 初回入室時の案内を表示（画面表示と同時にすぐに表示）
    const roomId = this.roomIdService.requireRoomId();
    this.showFirstEntryGuideIfNeeded(roomId);

    // クエリパラメータからタブを読み取る
    this.route.queryParams.subscribe((params) => {
      const tab = params['tab'];
      if (
        tab &&
        [
          'rate',
          'standard',
          'salaryItems',
          'office',
          'editLog',
          'userRoom',
        ].includes(tab)
      ) {
        this.activeTab = tab;
      }
    });

    try {
      await this.loadAllRates();
    } catch (error) {
      // エラーはloadAllRates内で処理されているため、ここでは何もしない
    }

    // 標準報酬等級表の年度を初期化
    this.standardTableYear = parseInt(this.gradeYear, 10);

    // 適用開始月（改定月）をロード
    try {
      const versionInfo = await this.settingsService.getRateVersionInfo(
        this.year
      );
      this.rateVersionForm.patchValue({
        applyFromMonth: versionInfo.applyFromMonth,
      });
    } catch (error) {
      // エラーが発生した場合はデフォルト値を使用
      this.rateVersionForm.patchValue({
        applyFromMonth: 3,
      });
    }

    // 変更時に自動保存
    this.rateVersionForm
      .get('applyFromMonth')
      ?.valueChanges.subscribe(async (value) => {
        if (value && value >= 1 && value <= 12) {
          try {
            await this.settingsService.saveRateVersionInfo(this.year, value);
          } catch (error) {
            // エラーは静かに処理（ユーザー体験を損なわないため）
          }
        }
      });

    try {
      await this.loadStandardTable();
    } catch (error) {
      // エラーはloadStandardTable内で処理されているため、ここでは何もしない
    }
    try {
      await this.loadSalaryItems();
    } catch (error) {
      // エラーはloadSalaryItems内で処理されているため、ここでは何もしない
    }
    try {
      await this.loadOffices();
    } catch (error) {
      // エラーはloadOffices内で処理されているため、ここでは何もしない
    }
    try {
      await this.loadUserRoomInfo();
    } catch (error) {
      // エラーはloadUserRoomInfo内で処理されているため、ここでは何もしない
    }
  }

  // 編集ログタブがクリックされたときの処理
  async onEditLogTabClick(): Promise<void> {
    try {
      this.activeTab = 'editLog';
      await this.loadEditLogs();
    } catch (error) {
      // エラーはloadEditLogs内で処理されているため、ここでは何もしない
    }
  }

  // 編集ログを読み込む
  async loadEditLogs(): Promise<void> {
    this.isLoadingLogs = true;
    try {
      this.editLogs = await this.editLogService.getEditLogs(100);
      // ユーザー名のリストを取得
      if (this.editLogs && Array.isArray(this.editLogs)) {
        this.availableUserNames = [
          ...new Set(
            this.editLogs.map((log) => log?.userName).filter((name) => name)
          ),
        ].sort();
      } else {
        this.editLogs = [];
        this.availableUserNames = [];
      }
      // フィルターを適用
      this.applyFilters();
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
      this.editLogs = [];
      this.filteredEditLogs = [];
      this.availableUserNames = [];
    } finally {
      this.isLoadingLogs = false;
    }
  }

  // フィルターを適用
  applyFilters(): void {
    try {
      if (!this.editLogs || !Array.isArray(this.editLogs)) {
        this.filteredEditLogs = [];
        return;
      }

      let filtered = [...this.editLogs];

      // 日付フィルター
      if (this.filterDate) {
        try {
          const filterDateObj = new Date(this.filterDate);
          if (isNaN(filterDateObj.getTime())) {
            // 無効な日付の場合はフィルターをスキップ
          } else {
            filterDateObj.setHours(0, 0, 0, 0);
            const filterDateEnd = new Date(filterDateObj);
            filterDateEnd.setHours(23, 59, 59, 999);

            filtered = filtered.filter((log) => {
              if (!log || !log.timestamp) {
                return false;
              }
              try {
                const logDate = new Date(log.timestamp);
                if (isNaN(logDate.getTime())) {
                  return false;
                }
                return logDate >= filterDateObj && logDate <= filterDateEnd;
              } catch (error) {
                return false;
              }
            });
          }
        } catch (error) {
          // 日付フィルターのエラーは無視
        }
      }

      // ユーザーフィルター
      if (this.filterUserName) {
        filtered = filtered.filter((log) => {
          if (!log || !log.userName) {
            return false;
          }
          return log.userName === this.filterUserName;
        });
      }

      this.filteredEditLogs = filtered;
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
      this.filteredEditLogs = [];
    }
  }

  // 日付フィルターをクリア
  clearDateFilter(): void {
    try {
      this.filterDate = '';
      this.applyFilters();
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  // アクション名を日本語に変換
  getActionLabel(action: string): string {
    try {
      if (!action) {
        return '';
      }
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
    } catch (error) {
      return '';
    }
  }

  // エンティティタイプ名を日本語に変換
  getEntityTypeLabel(entityType: string): string {
    try {
      if (!entityType) {
        return '';
      }
      const labels: { [key: string]: string } = {
        employee: '従業員',
        office: '事業所',
        settings: '設定',
        salary: '給与',
        bonus: '賞与',
        insurance: '保険料',
      };
      return labels[entityType] || entityType;
    } catch (error) {
      return '';
    }
  }

  // 日時をフォーマット
  formatDateTime(date: Date): string {
    try {
      if (!date) {
        return '';
      }
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) {
        return '';
      }
      return d.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return '';
    }
  }

  // 説明文をフォーマット（変更前・変更後の情報を含む）
  formatDescription(log: EditLog): string {
    try {
      if (!log) {
        return '';
      }
      if (!log.oldValue || !log.newValue) {
        return log.description || '';
      }

      // 料率の更新の場合
      if (log.entityType === 'settings' && log.entityName?.includes('の料率')) {
        try {
          // 健保本人と健保会社の値を抽出
          const oldMatch = log.oldValue.match(
            /健保本人:([\d.]+)%, 健保会社:([\d.]+)%/
          );
          const newMatch = log.newValue.match(
            /健保本人:([\d.]+)%, 健保会社:([\d.]+)%/
          );

          if (
            oldMatch &&
            newMatch &&
            oldMatch.length >= 3 &&
            newMatch.length >= 3
          ) {
            const oldHealth = parseFloat(oldMatch[1]);
            const oldEmployer = parseFloat(oldMatch[2]);
            const newHealth = parseFloat(newMatch[1]);
            const newEmployer = parseFloat(newMatch[2]);

            // NaNチェック
            if (
              isNaN(oldHealth) ||
              isNaN(oldEmployer) ||
              isNaN(newHealth) ||
              isNaN(newEmployer)
            ) {
              return `${log.description || ''}（${log.oldValue}→${
                log.newValue
              }）`;
            }

            // 変更があった項目のみ表示
            const changes: string[] = [];
            if (Math.abs(oldHealth - newHealth) > 0.0001) {
              changes.push(`${oldHealth.toFixed(3)}→${newHealth.toFixed(3)}`);
            }
            if (Math.abs(oldEmployer - newEmployer) > 0.0001) {
              changes.push(
                `${oldEmployer.toFixed(3)}→${newEmployer.toFixed(3)}`
              );
            }

            if (changes.length > 0) {
              // 料率の表示形式を統一
              return `${log.description || ''}（${changes.join('、')}）`;
            }
          }
        } catch (error) {
          // 料率フォーマットのエラーは無視して、デフォルト形式で表示
        }
      }

      // その他の場合は変更前→変更後の形式で表示
      return `${log.description || ''}（${log.oldValue}→${log.newValue}）`;
    } catch (error) {
      return '';
    }
  }

  // ユーザー・ルーム情報を読み込む
  async loadUserRoomInfo(): Promise<void> {
    try {
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
              password: roomData.password || '',
            };
          } else {
            // ルームデータが取得できなかった場合はnullに設定
            this.roomInfo = null;
          }
        } catch (error) {
          // エラーは静かに処理（ユーザー体験を損なわないため）
          this.roomInfo = null;
        }
      } else {
        // roomIdが存在しない場合はnullに設定
        this.roomInfo = null;
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
      this.roomInfo = null;
    }
  }

  // 事業所マスタ関連メソッド
  async loadOffices(): Promise<void> {
    try {
      const roomId = this.roomIdService.requireRoomId();
      const officesData = await firstValueFrom(
        this.officeService.getOfficesByRoom(roomId)
      );
      if (officesData && Array.isArray(officesData)) {
        this.offices = (officesData as any[]).map((o) => ({
          roomId,
          ...o,
        })) as Office[];
      } else {
        this.offices = [];
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
      this.offices = [];
    }
  }

  selectOffice(office: Office | null): void {
    try {
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
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  async saveOffice(): Promise<void> {
    try {
      // officeFormの存在確認
      if (!this.officeForm || !this.officeForm.value) {
        alert('事業所マスタのデータが存在しません');
        return;
      }

      // フォームが無効な場合は保存しない（ボタンが無効化されているため通常は呼ばれないが、念のため）
      if (!this.officeForm.valid) {
        return;
      }

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

      // 既存の事業所の場合、都道府県が変更されたかチェック
      const oldPrefecture = this.selectedOffice?.prefecture;
      const newPrefecture = office.prefecture;
      const officeNumber = office.officeNumber;
      const isPrefectureChanged =
        this.selectedOffice?.id &&
        officeNumber &&
        oldPrefecture &&
        newPrefecture &&
        oldPrefecture !== newPrefecture;

      if (!this.selectedOffice?.id) {
        const savedId = await this.officeService.createOfficeInRoom(
          roomId,
          office
        );
        office.id = savedId;
      } else {
        await this.officeService.updateOfficeInRoom(
          roomId,
          this.selectedOffice.id,
          office
        );
      }

      // 都道府県が変更された場合、その事業所に紐づく従業員の都道府県も自動更新
      if (isPrefectureChanged && officeNumber && newPrefecture) {
        try {
          const updateCount =
            await this.employeeService.updateEmployeesPrefectureByOfficeNumber(
              officeNumber,
              newPrefecture
            );
        } catch (error) {
          // エラーが発生しても事業所の保存は成功しているため、警告のみ表示
          alert(
            `事業所マスタを保存しましたが、従業員の都道府県更新中にエラーが発生しました。\n従業員の都道府県を手動で更新してください。`
          );
          await this.loadOffices();
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
          return;
        }
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
    } catch (error) {
      alert('事業所マスタの保存に失敗しました');
    }
  }

  async deleteOffice(officeId: string): Promise<void> {
    if (!officeId) {
      alert('事業所IDが指定されていません');
      return;
    }

    if (!confirm('この事業所マスタを削除しますか？')) {
      return;
    }

    try {
      const roomId = this.roomIdService.requireRoomId();
      await this.officeService.deleteOfficeInRoom(roomId, officeId);
      alert('事業所マスタを削除しました');
      await this.loadOffices();
      if (this.selectedOffice?.id === officeId) {
        this.selectOffice(null);
      }
    } catch (error) {
      alert('事業所マスタの削除に失敗しました');
    }
  }

  addNewOffice(): void {
    try {
      this.selectOffice(null);
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  async loadAllRates(): Promise<void> {
    try {
      // yearのバリデーション
      if (!this.year) {
        return;
      }
      const yearNum = parseInt(this.year, 10);
      if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
        return;
      }

      // 47都道府県の健康保険料率を取得（小数→パーセント変換）
      this.prefectureRates = {};
      for (const pref of this.prefectureList) {
        try {
          const data = await this.settingsService.getRates(
            this.year,
            pref.code
          );
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
        } catch (error) {
          // 個別の都道府県の読み込みエラーは無視して、デフォルト値を設定
          this.prefectureRates[pref.code] = {
            health_employee: 0,
            health_employer: 0,
          };
        }
      }

      // 介護保険と厚生年金は最初の都道府県（または東京）から取得（全国一律のため、小数→パーセント変換）
      try {
        const careData = await this.settingsService.getRates(
          this.year,
          'tokyo'
        );
        if (careData) {
          this.careRates = {
            care_employee: this.decimalToPercent(careData.care_employee || 0),
            care_employer: this.decimalToPercent(careData.care_employer || 0),
          };
          this.pensionRates = {
            pension_employee: this.decimalToPercent(
              careData.pension_employee || 0
            ),
            pension_employer: this.decimalToPercent(
              careData.pension_employer || 0
            ),
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
          if (
            !this.pensionRates ||
            Object.keys(this.pensionRates).length === 0
          ) {
            this.pensionRates = {
              pension_employee: 0,
              pension_employer: 0,
            };
          }
        }
      } catch (error) {
        // 介護保険・厚生年金の読み込みエラーは無視して、既存の値を保持
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
    } catch (error) {
      // 全体のエラーは無視（既存の値を保持）
    }
  }

  async onYearChange(): Promise<void> {
    // 対象期間を変更した際に、前のインポート結果メッセージをクリア
    this.importResult = null;
    try {
      await this.loadAllRates();
    } catch (error) {
      // エラーはloadAllRates内で処理されているため、ここでは何もしない
    }
  }

  /**
   * 小数点以下5位に丸める（6位以下を切り捨て）
   */
  private roundTo5Decimals(value: number): number {
    if (isNaN(value) || !isFinite(value)) {
      return 0;
    }
    return Math.floor(value * 100000) / 100000;
  }

  /**
   * 健康保険料率を小数点以下3位に丸める（4位以下を切り捨て）
   */
  private roundHealthRateTo3Decimals(value: number): number {
    if (isNaN(value) || !isFinite(value)) {
      return 0;
    }
    return Math.floor(value * 1000) / 1000;
  }

  /**
   * 健康保険料率の表示を小数点以下3位までフォーマット
   */
  formatHealthRate(value: number): number {
    if (
      value === null ||
      value === undefined ||
      isNaN(value) ||
      !isFinite(value)
    ) {
      return 0;
    }
    return this.roundHealthRateTo3Decimals(value);
  }

  onHealthEmployeeInput(prefecture: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = parseFloat(input.value);
    if (isNaN(value) || !isFinite(value)) {
      value = 0;
    }
    // 範囲チェック（0-100%）
    value = Math.max(0, Math.min(100, value));
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
    let value = parseFloat(input.value);
    if (isNaN(value) || !isFinite(value)) {
      value = 0;
    }
    // 範囲チェック（0-100%）
    value = Math.max(0, Math.min(100, value));
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
    try {
      // yearとprefectureのバリデーション
      if (!this.year || !prefecture) {
        return;
      }
      const yearNum = parseInt(this.year, 10);
      if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
        return;
      }

      const rate = this.prefectureRates[prefecture] || {
        health_employee: 0,
        health_employer: 0,
      };
      // 健康保険料率は小数点以下3位に丸める（4位以下を切り捨て）
      let roundedHealthEmployee = this.roundHealthRateTo3Decimals(
        rate.health_employee || 0
      );
      let roundedHealthEmployer = this.roundHealthRateTo3Decimals(
        rate.health_employer || 0
      );
      // 介護保険と厚生年金は小数点以下5位に丸める
      let roundedCareEmployee = this.roundTo5Decimals(
        this.careRates.care_employee || 0
      );
      let roundedCareEmployer = this.roundTo5Decimals(
        this.careRates.care_employer || 0
      );
      let roundedPensionEmployee = this.roundTo5Decimals(
        this.pensionRates.pension_employee || 0
      );
      let roundedPensionEmployer = this.roundTo5Decimals(
        this.pensionRates.pension_employer || 0
      );

      // 値の範囲チェック（0-100%）
      roundedHealthEmployee = Math.max(0, Math.min(100, roundedHealthEmployee));
      roundedHealthEmployer = Math.max(0, Math.min(100, roundedHealthEmployer));
      roundedCareEmployee = Math.max(0, Math.min(100, roundedCareEmployee));
      roundedCareEmployer = Math.max(0, Math.min(100, roundedCareEmployer));
      roundedPensionEmployee = Math.max(
        0,
        Math.min(100, roundedPensionEmployee)
      );
      roundedPensionEmployer = Math.max(
        0,
        Math.min(100, roundedPensionEmployer)
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
    } catch (error) {
      // エラーが発生した場合は、ユーザーに通知せずに静かに失敗する
      // （blurイベントから呼び出される場合、ユーザー体験を損なわないため）
    }
  }

  async saveAllRates(): Promise<void> {
    if (this.isSavingRates) return;

    // yearのバリデーション
    if (!this.year) {
      alert('年度が設定されていません');
      return;
    }
    const yearNum = parseInt(this.year, 10);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      alert('無効な年度が設定されています');
      return;
    }

    this.isSavingRates = true;
    try {
      for (const pref of this.prefectureList) {
        await this.savePrefectureRate(pref.code);
      }
      alert('保険料率を保存しました');
    } catch (error) {
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

    // yearのバリデーション
    if (!this.year) {
      alert('年度が設定されていません');
      return;
    }
    const yearNum = parseInt(this.year, 10);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      alert('無効な年度が設定されています');
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
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;
          if (text) {
            await this.importFromCsvText(text);
          } else {
            this.importResult = {
              type: 'error',
              message: 'ファイルの読み込みに失敗しました',
            };
          }
        } catch (error) {
          this.importResult = {
            type: 'error',
            message: 'ファイルの読み込み中にエラーが発生しました',
          };
        }
      };
      reader.onerror = () => {
        this.importResult = {
          type: 'error',
          message: 'ファイルの読み込みに失敗しました',
        };
      };
      reader.readAsText(file, 'UTF-8');
    }
  }

  async importFromText(): Promise<void> {
    if (!this.csvImportText.trim()) {
      this.importResult = {
        type: 'error',
        message: 'CSVデータが入力されていません',
      };
      return;
    }
    await this.importFromCsvText(this.csvImportText);
  }

  async importFromCsvText(csvText: string): Promise<void> {
    if (this.isImportingRates) return;

    // yearのバリデーション
    if (!this.year) {
      this.importResult = {
        type: 'error',
        message: '年度が設定されていません',
      };
      return;
    }
    const yearNum = parseInt(this.year, 10);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      this.importResult = {
        type: 'error',
        message: '無効な年度が設定されています',
      };
      return;
    }

    this.isImportingRates = true;
    this.cdr.detectChanges(); // 変更検知を強制してローディング状態を即座に反映
    try {
      // 対象期間が変更された直後の場合に備えて、最新の料率データを読み込む
      // これにより、this.prefectureRatesが現在の年度のデータで初期化される
      await this.loadAllRates();

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

        if (
          isNaN(employeeRate) ||
          isNaN(employerRate) ||
          !isFinite(employeeRate) ||
          !isFinite(employerRate)
        ) {
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
        // Firestoreに保存（現在選択されている年度に対して）
        try {
          for (const [prefectureCode, rates] of ratesToAdd) {
            await this.savePrefectureRate(prefectureCode);
          }

          // 画面表示を更新するためにloadAllRates()を呼び出す
          await this.loadAllRates();
          this.cdr.detectChanges();

          this.importResult = {
            type: 'success',
            message: `${successCount}件の料率をインポートしました`,
          };
          this.showImportDialog = false;
          this.csvImportText = '';
        } catch (saveError) {
          this.importResult = {
            type: 'error',
            message: `インポートは成功しましたが、保存に失敗しました`,
          };
        }
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
    } finally {
      this.isImportingRates = false;
    }
  }

  async onPrefectureChange(): Promise<void> {
    try {
      this.prefecture = this.form.get('prefecture')?.value || 'tokyo';
      await this.reloadRates();
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  async reloadRates(): Promise<void> {
    try {
      const data = await this.settingsService.getRates(
        this.year,
        this.prefecture
      );
      if (data) {
        this.form.patchValue(data);
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
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
    try {
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

      await this.settingsService.saveRates(
        this.year,
        prefectureValue,
        rateData
      );
      alert('設定を保存しました');
    } catch (error) {
      alert('設定の保存に失敗しました');
    }
  }

  async seedTokyo(): Promise<void> {
    try {
      await this.settingsService.seedRatesTokyo2025();
      alert('東京都の料率（2025年）を登録しました');
    } catch (error) {
      alert('東京都の料率の登録に失敗しました');
    }
  }

  async seedAllPrefectures(): Promise<void> {
    try {
      const yearNum = parseInt(this.year, 10);
      await this.settingsService.seedRatesAllPrefectures2025();
      await this.loadAllRates();
      alert(`47都道府県の${yearNum}年度料率を登録しました`);
    } catch (error) {
      alert('47都道府県の料率の登録に失敗しました');
    }
  }

  async saveSettings(): Promise<void> {
    const salaryMonthRule =
      this.settingsForm.get('salaryMonthRule')?.value || 'payDate';
    await this.settingsService.saveSalaryMonthRule(salaryMonthRule);
    alert('設定を保存しました');
  }

  getAvailableYears(): number[] {
    const years: number[] = [];
    // 2020年から2030年まで
    for (let i = 2020; i <= 2030; i++) {
      years.push(i);
    }
    return years;
  }

  createSalaryItemRow(item?: SalaryItem): FormGroup {
    try {
      const id = item?.id || this.generateId();
      const name = item?.name || '';
      const type = item?.type || 'fixed';

      // 型のバリデーション
      const safeType = ['fixed', 'variable', 'deduction'].includes(type)
        ? type
        : 'fixed';

      return this.fb.group({
        id: [id],
        name: [name, Validators.required],
        type: [safeType, Validators.required],
      });
    } catch (error) {
      // エラーが発生した場合はデフォルト値で作成
      return this.fb.group({
        id: [this.generateId()],
        name: ['', Validators.required],
        type: ['fixed', Validators.required],
      });
    }
  }

  generateId(): string {
    try {
      return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
      // エラーが発生した場合はタイムスタンプのみを使用
      return `item_${Date.now()}`;
    }
  }

  async loadSalaryItems(): Promise<void> {
    try {
      // 年度のバリデーション
      if (
        !this.salaryItemsYear ||
        this.salaryItemsYear < 1900 ||
        this.salaryItemsYear > 2100
      ) {
        return;
      }

      // salaryItemsの存在確認
      if (!this.salaryItems) {
        return;
      }

      while (this.salaryItems.length !== 0) {
        this.salaryItems.removeAt(0);
      }
      const items = await this.settingsService.loadSalaryItems(
        this.salaryItemsYear
      );
      if (items && Array.isArray(items)) {
        items.forEach((item) => {
          if (item) {
            const row = this.createSalaryItemRow(item);
            if (row) {
              this.salaryItems.push(row);
            }
          }
        });
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  async onSalaryItemsYearChange(): Promise<void> {
    try {
      await this.loadSalaryItems();
    } catch (error) {
      // エラーはloadSalaryItems内で処理されているため、ここでは何もしない
    }
  }

  addSalaryItem(): void {
    try {
      if (!this.salaryItems) {
        return;
      }
      const row = this.createSalaryItemRow();
      if (row) {
        this.salaryItems.push(row);
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  removeSalaryItem(index: number): void {
    try {
      if (!this.salaryItems) {
        return;
      }
      if (index >= 0 && index < this.salaryItems.length) {
        this.salaryItems.removeAt(index);
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  onSalaryItemTypeChange(index: number): void {
    try {
      if (!this.salaryItems) {
        return;
      }
      if (index < 0 || index >= this.salaryItems.length) {
        return;
      }
      const itemGroup = this.salaryItems.at(index) as FormGroup;
      if (!itemGroup) {
        return;
      }
      const typeValue = itemGroup.get('type')?.value;

      // 種別が「欠勤控除」に変更された場合、項目名を自動で「欠勤控除」に設定
      if (typeValue === 'deduction') {
        itemGroup.get('name')?.setValue('欠勤控除');
      }
    } catch (error) {
      // エラーは静かに処理（ユーザー体験を損なわないため）
    }
  }

  async saveSalaryItems(): Promise<void> {
    try {
      // 年度のバリデーション
      if (
        !this.salaryItemsYear ||
        this.salaryItemsYear < 1900 ||
        this.salaryItemsYear > 2100
      ) {
        alert('無効な年度が設定されています');
        return;
      }

      // salaryItemsの存在確認
      if (!this.salaryItems || !this.salaryItems.value) {
        alert('給与項目マスタのデータが存在しません');
        return;
      }

      const items: SalaryItem[] = this.salaryItems.value;
      if (!Array.isArray(items)) {
        alert('給与項目マスタのデータが不正です');
        return;
      }

      await this.settingsService.saveSalaryItems(this.salaryItemsYear, items);
      alert('給与項目マスタを保存しました');
    } catch (error) {
      alert('給与項目マスタの保存に失敗しました');
    }
  }

  async seedStandardTable(): Promise<void> {
    // 年度のバリデーション
    if (
      !this.standardTableYear ||
      this.standardTableYear < 1900 ||
      this.standardTableYear > 2100
    ) {
      alert('無効な年度が設定されています');
      return;
    }

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
      alert('標準報酬等級表の一括登録に失敗しました');
    }
  }

  // 標準報酬月額テーブルCSVインポート関連
  onStandardTableFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (text) {
          this.standardTableCsvImportText = text;
          await this.importStandardTableFromCsvText(text);
        } else {
          this.standardTableImportResult = {
            type: 'error',
            message: 'ファイルの読み込みに失敗しました',
          };
        }
      } catch (error) {
        this.standardTableImportResult = {
          type: 'error',
          message: 'ファイルの読み込み中にエラーが発生しました',
        };
      }
    };
    reader.onerror = () => {
      this.standardTableImportResult = {
        type: 'error',
        message: 'ファイルの読み込みに失敗しました',
      };
    };
    reader.readAsText(file);
  }

  async importStandardTableFromText(): Promise<void> {
    if (!this.standardTableCsvImportText.trim()) {
      this.standardTableImportResult = {
        type: 'error',
        message: 'CSVデータが入力されていません',
      };
      return;
    }
    await this.importStandardTableFromCsvText(this.standardTableCsvImportText);
  }

  async importStandardTableFromCsvText(csvText: string): Promise<void> {
    try {
      // 現在選択されている年度を standardTableYear に同期
      // これにより、インポート時に選択されている年度が確実に反映される
      const yearNum = parseInt(this.gradeYear, 10);
      if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
        this.standardTableImportResult = {
          type: 'error',
          message: '無効な年度が設定されています',
        };
        return;
      }
      this.standardTableYear = yearNum;

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

        if (
          isNaN(rank) ||
          isNaN(standard) ||
          isNaN(lower) ||
          isNaN(upper) ||
          !isFinite(rank) ||
          !isFinite(standard) ||
          !isFinite(lower) ||
          !isFinite(upper)
        ) {
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
      const sortedRows = Array.from(rowsToAdd.values())
        .filter((row) => row !== null && row !== undefined)
        .sort((a, b) => {
          const rankA = a?.rank ?? 0;
          const rankB = b?.rank ?? 0;
          if (isNaN(rankA) || isNaN(rankB)) {
            return 0;
          }
          return rankA - rankB;
        });

      // 既存のテーブルをクリア
      while (this.standardTable.length !== 0) {
        this.standardTable.removeAt(0);
      }

      // ソート済みデータをFormArrayに追加
      sortedRows.forEach((rowData) => {
        if (rowData) {
          const row = this.createRow(rowData);
          if (row) {
            this.standardTable.push(row);
          }
        }
      });

      // バリデーション実行
      this.validateStandardTable();

      // エラーがある場合は保存しない
      if (this.errorMessages.length > 0) {
        this.standardTableImportResult = {
          type: 'error',
          message: `バリデーションエラーがあります。修正してください。${
            errors.length > 0 ? '\n' + errors.slice(0, 5).join(' / ') : ''
          }`,
        };
        return;
      }

      // 結果メッセージ
      if (errorCount > 0) {
        this.standardTableImportResult = {
          type: 'error',
          message: `${successCount}件のインポートに成功しましたが、${errorCount}件のエラーがあります。${errors
            .slice(0, 5)
            .join(' / ')}${errors.length > 5 ? ' ...' : ''}`,
        };
      } else {
        // Firestoreに保存（現在選択されている年度に対して）
        try {
          const tableValue = this.standardTable?.value;
          if (!Array.isArray(tableValue) || tableValue.length === 0) {
            this.standardTableImportResult = {
              type: 'error',
              message: '標準報酬月額テーブルにデータがありません',
            };
            return;
          }
          await this.settingsService.saveStandardTable(
            this.standardTableYear,
            tableValue
          );

          // 画面表示を更新するためにloadStandardTable()を呼び出す
          await this.loadStandardTable();
          this.cdr.detectChanges();

          this.standardTableImportResult = {
            type: 'success',
            message: `${successCount}件のデータをインポートしました`,
          };
          this.showStandardTableImportDialog = false;
          this.standardTableCsvImportText = '';
        } catch (saveError) {
          this.standardTableImportResult = {
            type: 'error',
            message: `インポートは成功しましたが、保存に失敗しました`,
          };
        }
      }
    } catch (error) {
      this.standardTableImportResult = {
        type: 'error',
        message: `インポート中にエラーが発生しました`,
      };
    }
  }
}
