import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SuijiKouhoResult } from '../../../../services/salary-calculation.service';
import { SuijiAlertUiService } from '../../../../services/suiji-alert-ui.service';
import { formatDate, getJSTDate } from '../../../../utils/alerts-helper';
import { OfficeService } from '../../../../services/office.service';
import { MonthlySalaryService } from '../../../../services/monthly-salary.service';
import { StandardRemunerationHistoryService } from '../../../../services/standard-remuneration-history.service';
import { SettingsService } from '../../../../services/settings.service';
import { Employee } from '../../../../models/employee.model';
import { Office } from '../../../../models/office.model';
import { SalaryItem } from '../../../../models/salary-item.model';
import { RoomIdService } from '../../../../services/room-id.service';

// 前月比差額を含む拡張型
export interface SuijiKouhoResultWithDiff extends SuijiKouhoResult {
  diffPrev?: number | null;
  id?: string; // FirestoreのドキュメントID
  year?: number; // 年度情報
  currentStandard?: number | null; // 現行標準報酬月額
}

@Component({
  selector: 'app-alert-suiji-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-suiji-tab.component.html',
  styleUrl: './alert-suiji-tab.component.css',
})
export class AlertSuijiTabComponent {
  @Input() suijiAlerts: SuijiKouhoResultWithDiff[] = [];
  @Input() selectedSuijiAlertIds: Set<string> = new Set();
  @Input() employees: any[] = [];
  @Output() alertSelectionChange = new EventEmitter<{
    alertId: string;
    selected: boolean;
  }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  constructor(
    private suijiAlertUiService: SuijiAlertUiService,
    private officeService: OfficeService,
    private monthlySalaryService: MonthlySalaryService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService,
    private settingsService: SettingsService,
    private roomIdService: RoomIdService
  ) {}

  // 年度ごとの標準報酬等級表キャッシュ
  private gradeTables: Map<number, any[]> = new Map();

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['suijiAlerts'] && this.suijiAlerts && Array.isArray(this.suijiAlerts)) {
      const years = Array.from(
        new Set(
          this.suijiAlerts
            .map((a) => a && a.year)
            .filter((y): y is number => typeof y === 'number' && y >= 1900 && y <= 2100)
        )
      );
      // 年度情報が無い場合は現在年をプリロード
      if (years.length === 0) {
        const currentYear = getJSTDate().getFullYear();
        if (currentYear >= 1900 && currentYear <= 2100) {
          years.push(currentYear);
        }
      }
      for (const y of years) {
        if (y >= 1900 && y <= 2100 && !this.gradeTables.has(y)) {
          try {
            const table = await this.settingsService.getStandardTable(y);
            if (table && Array.isArray(table)) {
              this.gradeTables.set(y, table);
            }
          } catch (error) {
            console.error(`[alert-suiji-tab] 標準報酬等級表取得エラー: 年度=${y}`, error);
          }
        }
      }
    }
  }

  getEmployeeName(employeeId: string): string {
    const emp = this.employees.find((e: any) => e.id === employeeId);
    return emp?.name || employeeId;
  }

  getStatusText(result: SuijiKouhoResultWithDiff): string {
    if (!result) {
      return '提出不要';
    }
    return result.isEligible ? '要提出' : '提出不要';
  }

  /**
   * 随時改定の届出提出期日を取得
   */
  getSuijiReportDeadline(alert: SuijiKouhoResultWithDiff): string {
    if (!alert) {
      return '-';
    }
    return this.suijiAlertUiService.getSuijiReportDeadline(alert);
  }

  /**
   * 適用開始月を取得（変動月から再計算）
   */
  getApplyStartMonth(alert: SuijiKouhoResultWithDiff): number {
    if (!alert) {
      return 0;
    }
    if (!alert.changeMonth || alert.changeMonth < 1 || alert.changeMonth > 12) {
      return alert.applyStartMonth || 0;
    }
    // 変動月+3ヶ月後が適用開始月
    const applyStartMonthRaw = alert.changeMonth + 3;
    return applyStartMonthRaw > 12
      ? applyStartMonthRaw - 12
      : applyStartMonthRaw;
  }

  getReasonText(result: SuijiKouhoResultWithDiff): string {
    if (!result || !result.reasons || !Array.isArray(result.reasons)) {
      return '';
    }
    return result.reasons.join(' / ');
  }

  isLargeChange(diff: number | null | undefined): boolean {
    return this.suijiAlertUiService.isLargeChange(diff);
  }

  getSuijiAlertId(alert: SuijiKouhoResultWithDiff): string {
    if (!alert) {
      return '';
    }
    return this.suijiAlertUiService.getSuijiAlertId(alert);
  }

  getCurrentStandard(alert: SuijiKouhoResultWithDiff): number | null {
    if (!alert) {
      return null;
    }
    if (alert.currentStandard !== undefined && alert.currentStandard !== null) {
      return alert.currentStandard;
    }
    const year = alert.year || new Date().getFullYear();
    if (year < 1900 || year > 2100) {
      return null;
    }
    const table = this.gradeTables.get(year);
    if (!table || !Array.isArray(table)) {
      return null;
    }
    const row = table.find((r: any) => r && r.rank === alert.currentGrade);
    return row && row.standard !== undefined && row.standard !== null
      ? row.standard
      : null;
  }

  formatDate(date: Date): string {
    return this.suijiAlertUiService.formatSuijiDate(date);
  }

  // 随時改定アラートの選択管理
  toggleSuijiAlertSelection(alertId: string): void {
    if (!alertId || !this.selectedSuijiAlertIds) {
      return;
    }
    const isSelected = this.selectedSuijiAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllSuijiAlertsChange(event: Event): void {
    if (!event || !event.target) {
      return;
    }
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isSuijiAlertSelected(alertId: string): boolean {
    if (!alertId || !this.selectedSuijiAlertIds) {
      return false;
    }
    return this.selectedSuijiAlertIds.has(alertId);
  }

  // 随時改定アラートの削除
  deleteSelectedSuijiAlerts(): void {
    if (!this.selectedSuijiAlertIds || this.selectedSuijiAlertIds.size === 0) {
      return;
    }
    this.deleteSelected.emit();
  }

  /**
   * CSV出力
   */
  async exportToCsv(alert: SuijiKouhoResultWithDiff): Promise<void> {
    if (!alert || !alert.employeeId) {
      window.alert('アラート情報が不正です');
      return;
    }
    try {
      const employee = this.employees.find(
        (e: any) => e && e.id === alert.employeeId
      ) as Employee | undefined;
      if (!employee) {
        window.alert('従業員情報が見つかりません');
        return;
      }

      // 事業所情報を取得
      let office: Office | null = null;
      try {
        if (employee.officeNumber) {
          const offices = await this.officeService.getAllOffices();
          if (offices && Array.isArray(offices)) {
            office =
              offices.find((o) => o && o.officeNumber === employee.officeNumber) || null;
          }
        }
        if (!office) {
          const offices = await this.officeService.getAllOffices();
          if (offices && Array.isArray(offices) && offices.length > 0) {
            office = offices[0] || null;
          }
        }
      } catch (error) {
        console.error('[alert-suiji-tab] 事業所情報取得エラー:', error);
      }

      // 年度を取得（変動月から適用開始月の年度を計算）
      const changeYear = alert.year || getJSTDate().getFullYear();
      if (changeYear < 1900 || changeYear > 2100) {
        window.alert('年度が不正です');
        return;
      }
      const changeMonth = alert.changeMonth;
      if (!changeMonth || changeMonth < 1 || changeMonth > 12) {
        window.alert('変動月が不正です');
        return;
      }
      const applyStartMonth = this.getApplyStartMonth(alert);
      if (!applyStartMonth || applyStartMonth < 1 || applyStartMonth > 12) {
        window.alert('適用開始月が不正です');
        return;
      }
      const roomId = this.roomIdService.requireRoomId();

      // 適用開始月の年度を計算
      let applyStartYear = changeYear;
      if (changeMonth + 3 > 12) {
        applyStartYear = changeYear + 1;
      }

      const month1 = changeMonth;
      const month2 = changeMonth + 1;
      const month3 = changeMonth + 2;
      // 各月の給与データを room スコープで取得
      let salaryDataMonth1: any = null;
      let salaryDataMonth2: any = null;
      let salaryDataMonth3: any = null;
      try {
        salaryDataMonth1 =
          await this.monthlySalaryService.getEmployeeSalary(
            roomId,
            employee.id,
            changeYear,
            month1
          );
        salaryDataMonth2 =
          await this.monthlySalaryService.getEmployeeSalary(
            roomId,
            employee.id,
            changeYear,
            month2
          );
        salaryDataMonth3 =
          await this.monthlySalaryService.getEmployeeSalary(
            roomId,
            employee.id,
            changeYear,
            month3
          );
      } catch (error) {
        console.error('[alert-suiji-tab] 給与データ取得エラー:', error);
        window.alert('給与データの取得に失敗しました');
        return;
      }

      // 給与項目マスタを取得
      let salaryItems: SalaryItem[] = [];
      try {
        salaryItems = await this.settingsService.loadSalaryItems(changeYear) || [];
      } catch (error) {
        console.error('[alert-suiji-tab] 給与項目マスタ取得エラー:', error);
      }

      // 標準報酬履歴を取得（従前の標準報酬月額と従前改定月）
      let histories: any[] = [];
      try {
        histories =
          await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
            employee.id
          ) || [];
      } catch (error) {
        console.error('[alert-suiji-tab] 標準報酬履歴取得エラー:', error);
      }
      const previousHistory =
        histories.find(
          (h) =>
            h.applyStartYear < applyStartYear ||
            (h.applyStartYear === applyStartYear &&
              h.applyStartMonth < applyStartMonth)
        ) || histories[0];

      // CSVデータを生成
      const csvRows: string[] = [];

      // ヘッダー行
      csvRows.push('月額変更届');
      csvRows.push('');

      // 事業所情報
      csvRows.push(
        `事業所の都道府県,${this.formatPrefecture(
          office?.prefecture || employee.prefecture || ''
        )}`
      );
      csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
      csvRows.push(`事業所所在地,${office?.address || ''}`);
      csvRows.push(
        `事業所名称,${office?.officeName || '株式会社　伊藤忠商事'}`
      );
      csvRows.push(
        `事業主氏名,${office?.ownerName || '代表取締役社長　田中太郎'}`
      );
      csvRows.push(`電話番号,${office?.phoneNumber || '03-5432-6789'}`);
      csvRows.push('');

      // 被保険者情報
      csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
      csvRows.push(`被保険者氏名,${employee.name || ''}`);
      csvRows.push(`被保険者氏名（カナ）,${employee.nameKana || ''}`);
      csvRows.push(`生年月日,${this.formatBirthDate(employee.birthDate)}`);
      csvRows.push(
        `改定年月,${this.formatJapaneseEra(applyStartYear, applyStartMonth)}`
      );
      csvRows.push(`個人番号,${employee.myNumber || ''}`);
      csvRows.push(`基礎年金番号,${employee.basicPensionNumber || ''}`);
      csvRows.push('');

      // 従前の標準報酬月額と従前改定月
      csvRows.push(
        `従前の標準報酬月額,${
          previousHistory?.standardMonthlyRemuneration ||
          employee.currentStandardMonthlyRemuneration ||
          ''
        }`
      );
      if (previousHistory) {
        csvRows.push(
          `従前改定月,${this.formatJapaneseEra(
            previousHistory.applyStartYear,
            previousHistory.applyStartMonth
          )}`
        );
      } else {
        csvRows.push(`従前改定月,`);
      }
      csvRows.push('');

      // 給与支給月（連続3か月）
      const salaryMonths: number[] = [];
      const workingDaysList: number[] = [];
      const remunerationList: number[] = [];

      // 給与項目データを準備（salaryItemsからitemIdとamountのマップを作成）
      const salaryItemData: { [key: string]: { [itemId: string]: number } } =
        {};
      const monthDataList = [
        { month: month1, data: salaryDataMonth1 },
        { month: month2, data: salaryDataMonth2 },
        { month: month3, data: salaryDataMonth3 },
      ];
      for (const entry of monthDataList) {
        const { month, data } = entry;
        if (data?.salaryItems) {
          const key = `${employee.id}_${month}`;
          salaryItemData[key] = {};
          for (const item of data.salaryItems) {
            salaryItemData[key][item.itemId] = item.amount;
          }
        }
      }

      for (const entry of monthDataList) {
        const { month, data } = entry;
        if (!data || month > 12) continue;
        salaryMonths.push(month);
        workingDaysList.push(data.workingDays || 0);
        remunerationList.push(
          this.calculateRemuneration(
            data,
            `${employee.id}_${month}`,
            salaryItemData,
            salaryItems
          )
        );
      }

      csvRows.push(
        `給与支給月,${salaryMonths.map((m) => `${m}月`).join('、')}`
      );
      csvRows.push(
        `給与計算の基礎日数,${workingDaysList.map((d) => `${d}日`).join('、')}`
      );
      csvRows.push(
        `報酬月額,${remunerationList.map((r) => r.toString()).join('、')}`
      );

      // 総計と平均額（支払基礎日数が17日未満は計算対象外）
      const validMonths = remunerationList.filter(
        (_, i) => workingDaysList[i] >= 17
      );
      const total = validMonths.reduce((sum, r) => sum + r, 0);
      const average =
        validMonths.length > 0 ? Math.floor(total / validMonths.length) : 0;

      csvRows.push(`総計,${total.toString()}`);
      csvRows.push(`平均額,${average.toString()}`);
      csvRows.push('');

      // 年齢
      const age = this.calculateAge(employee.birthDate);
      csvRows.push(`年齢,${age}歳`);

      // CSVファイルをダウンロード
      const csvContent = csvRows.join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `月額変更届_${employee.name}_${applyStartYear}年${applyStartMonth}月.csv`
      );
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      // クリーンアップ（少し遅延させて確実に削除）
      setTimeout(() => {
        try {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error('[alert-suiji-tab] CSVダウンロード後のクリーンアップエラー:', error);
        }
      }, 100);
    } catch (error) {
      console.error('[alert-suiji-tab] CSV出力エラー:', error);
      window.alert('CSV出力中にエラーが発生しました');
    }
  }

  /**
   * 都道府県をフォーマット
   */
  private formatPrefecture(prefecture: string): string {
    if (!prefecture) return '';
    const prefectureMap: { [key: string]: string } = {
      tokyo: '東京都',
      hokkaido: '北海道',
      osaka: '大阪府',
      kyoto: '京都府',
      kanagawa: '神奈川県',
      aichi: '愛知県',
      fukuoka: '福岡県',
      // 他の都道府県も必要に応じて追加
    };
    return prefectureMap[prefecture] || prefecture;
  }

  /**
   * 生年月日をフォーマット（昭和30年1月1日形式）
   */
  private formatBirthDate(birthDate: string): string {
    if (!birthDate) return '';
    try {
      const date = new Date(birthDate);
      if (isNaN(date.getTime())) {
        return '';
      }
      const year = date.getFullYear();
      if (year < 1900 || year > 2100) {
        return '';
      }
      const month = date.getMonth() + 1;
      const day = date.getDate();

    // 元号を判定
    let era: string;
    let eraYear: number;
    if (year >= 2019) {
      era = '令和';
      eraYear = year - 2018;
    } else if (year >= 1989) {
      era = '平成';
      eraYear = year - 1988;
    } else if (year >= 1926) {
      era = '昭和';
      eraYear = year - 1925;
    } else {
      era = '大正';
      eraYear = year - 1911;
    }

      return `${era}${eraYear}年${month}月${day}日`;
    } catch (error) {
      console.error('[alert-suiji-tab] formatBirthDateエラー:', error);
      return '';
    }
  }

  /**
   * 年月を元号形式でフォーマット（令和6年8月形式）
   */
  private formatJapaneseEra(year: number, month: number): string {
    if (!year || isNaN(year) || year < 1900 || year > 2100) {
      return '';
    }
    if (!month || isNaN(month) || month < 1 || month > 12) {
      return '';
    }
    try {
      let era: string;
      let eraYear: number;
      if (year >= 2019) {
        era = '令和';
        eraYear = year - 2018;
      } else if (year >= 1989) {
        era = '平成';
        eraYear = year - 1988;
      } else if (year >= 1926) {
        era = '昭和';
        eraYear = year - 1925;
      } else {
        era = '大正';
        eraYear = year - 1911;
      }

      if (eraYear <= 0 || eraYear > 99) {
        return '';
      }

      return `${era}${eraYear}年${month}月`;
    } catch (error) {
      console.error('[alert-suiji-tab] formatJapaneseEraエラー:', error);
      return '';
    }
  }

  /**
   * 報酬月額を計算（総支給額 - 欠勤控除 - 賞与）
   */
  private calculateRemuneration(
    monthData: any,
    key: string,
    salaryItemData?: { [key: string]: { [itemId: string]: number } },
    salaryItems?: SalaryItem[]
  ): number {
    const total = monthData.totalSalary ?? monthData.total ?? 0;

    // 給与項目マスタがある場合は、控除項目と賞与を除外
    if (salaryItemData && salaryItems && Array.isArray(salaryItems)) {
      const itemData = salaryItemData[key];
      if (itemData) {
        let absenceDeduction = 0;
        let bonusAmount = 0;

        // 給与項目マスタから「欠勤控除」種別の項目を探す
        const deductionItems = salaryItems.filter(
          (item) => item && item.type === 'deduction'
        );
        for (const item of deductionItems) {
          if (item && item.id) {
            const amount = itemData[item.id];
            if (amount && !isNaN(amount) && amount > 0) {
              absenceDeduction += amount;
            }
          }
        }

        // 給与項目マスタから「賞与」という名前の項目を探す（随時改定の計算から除外）
        const bonusItems = salaryItems.filter(
          (item) =>
            item &&
            item.name &&
            (item.name === '賞与' ||
              item.name.includes('賞与') ||
              item.name.includes('ボーナス'))
        );
        for (const item of bonusItems) {
          if (item && item.id) {
            const amount = itemData[item.id];
            if (amount && !isNaN(amount) && amount > 0) {
              bonusAmount += amount;
            }
          }
        }

        // 報酬月額 = 総支給額 - 欠勤控除 - 賞与
        const remuneration = total - absenceDeduction - bonusAmount;
        return remuneration >= 0 ? remuneration : 0;
      }
    }

    // 給与項目マスタがない場合は総支給額を使用
    return total;
  }

  /**
   * 年齢を計算
   */
  private calculateAge(birthDate: string): number {
    if (!birthDate) return 0;
    try {
      const birth = new Date(birthDate);
      if (isNaN(birth.getTime())) {
        return 0;
      }
      const today = getJSTDate();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birth.getDate())
      ) {
        age--;
      }
      // 年齢が負の値や異常に大きい値の場合は0を返す
      if (age < 0 || age > 150) {
        return 0;
      }
      return age;
    } catch (error) {
      console.error('[alert-suiji-tab] calculateAgeエラー:', error);
      return 0;
    }
  }
}
