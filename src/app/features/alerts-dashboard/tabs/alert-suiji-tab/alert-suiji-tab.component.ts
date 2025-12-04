import { Component, Input, Output, EventEmitter } from '@angular/core';
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

// 前月比差額を含む拡張型
export interface SuijiKouhoResultWithDiff extends SuijiKouhoResult {
  diffPrev?: number | null;
  id?: string; // FirestoreのドキュメントID
  year?: number; // 年度情報
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
    private settingsService: SettingsService
  ) {}

  getEmployeeName(employeeId: string): string {
    const emp = this.employees.find((e: any) => e.id === employeeId);
    return emp?.name || employeeId;
  }

  getStatusText(result: SuijiKouhoResultWithDiff): string {
    return result.isEligible ? '要提出' : '提出不要';
  }

  /**
   * 随時改定の届出提出期日を取得
   */
  getSuijiReportDeadline(alert: SuijiKouhoResultWithDiff): string {
    return this.suijiAlertUiService.getSuijiReportDeadline(alert);
  }

  /**
   * 適用開始月を取得（変動月から再計算）
   */
  getApplyStartMonth(alert: SuijiKouhoResultWithDiff): number {
    if (!alert.changeMonth) {
      return alert.applyStartMonth || 0;
    }
    // 変動月+3ヶ月後が適用開始月
    const applyStartMonthRaw = alert.changeMonth + 3;
    return applyStartMonthRaw > 12
      ? applyStartMonthRaw - 12
      : applyStartMonthRaw;
  }

  getReasonText(result: SuijiKouhoResultWithDiff): string {
    return result.reasons.join(' / ');
  }

  isLargeChange(diff: number | null | undefined): boolean {
    return this.suijiAlertUiService.isLargeChange(diff);
  }

  getSuijiAlertId(alert: SuijiKouhoResultWithDiff): string {
    return this.suijiAlertUiService.getSuijiAlertId(alert);
  }

  formatDate(date: Date): string {
    return this.suijiAlertUiService.formatSuijiDate(date);
  }

  // 随時改定アラートの選択管理
  toggleSuijiAlertSelection(alertId: string): void {
    const isSelected = this.selectedSuijiAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllSuijiAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isSuijiAlertSelected(alertId: string): boolean {
    return this.selectedSuijiAlertIds.has(alertId);
  }

  // 随時改定アラートの削除
  deleteSelectedSuijiAlerts(): void {
    this.deleteSelected.emit();
  }

  /**
   * CSV出力
   */
  async exportToCsv(alert: SuijiKouhoResultWithDiff): Promise<void> {
    try {
      const employee = this.employees.find(
        (e: any) => e.id === alert.employeeId
      ) as Employee | undefined;
      if (!employee) {
        window.alert('従業員情報が見つかりません');
        return;
      }

      // 事業所情報を取得
      let office: Office | null = null;
      if (employee.officeNumber) {
        const offices = await this.officeService.getAllOffices();
        office =
          offices.find((o) => o.officeNumber === employee.officeNumber) || null;
      }

      // 年度を取得（変動月から適用開始月の年度を計算）
      const changeYear = alert.year || getJSTDate().getFullYear();
      const changeMonth = alert.changeMonth;
      const applyStartMonth = this.getApplyStartMonth(alert);

      // 適用開始月の年度を計算
      let applyStartYear = changeYear;
      if (changeMonth + 3 > 12) {
        applyStartYear = changeYear + 1;
      }

      // 給与データを取得（変動月から連続3か月）
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(
        employee.id,
        changeYear
      );
      const month1 = changeMonth;
      const month2 = changeMonth + 1;
      const month3 = changeMonth + 2;

      // 給与項目マスタを取得
      const salaryItems = await this.settingsService.loadSalaryItems(
        changeYear
      );

      // 標準報酬履歴を取得（従前の標準報酬月額と従前改定月）
      const histories =
        await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
          employee.id
        );
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
          employee.standardMonthlyRemuneration ||
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
      if (salaryData) {
        for (let month = 1; month <= 12; month++) {
          const monthKey = month.toString();
          const monthData = salaryData[monthKey];
          if (monthData?.salaryItems) {
            const key = `${employee.id}_${month}`;
            salaryItemData[key] = {};
            for (const item of monthData.salaryItems) {
              salaryItemData[key][item.itemId] = item.amount;
            }
          }
        }
      }

      if (month1 <= 12 && salaryData?.[month1.toString()]) {
        salaryMonths.push(month1);
        const month1Data = salaryData[month1.toString()];
        workingDaysList.push(month1Data.workingDays || 0);
        remunerationList.push(
          this.calculateRemuneration(
            month1Data,
            `${employee.id}_${month1}`,
            salaryItemData,
            salaryItems
          )
        );
      }
      if (month2 <= 12 && salaryData?.[month2.toString()]) {
        salaryMonths.push(month2);
        const month2Data = salaryData[month2.toString()];
        workingDaysList.push(month2Data.workingDays || 0);
        remunerationList.push(
          this.calculateRemuneration(
            month2Data,
            `${employee.id}_${month2}`,
            salaryItemData,
            salaryItems
          )
        );
      }
      if (month3 <= 12 && salaryData?.[month3.toString()]) {
        salaryMonths.push(month3);
        const month3Data = salaryData[month3.toString()];
        workingDaysList.push(month3Data.workingDays || 0);
        remunerationList.push(
          this.calculateRemuneration(
            month3Data,
            `${employee.id}_${month3}`,
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
      document.body.removeChild(link);
    } catch (error) {
      console.error('CSV出力エラー:', error);
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
    const date = new Date(birthDate);
    const year = date.getFullYear();
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
  }

  /**
   * 年月を元号形式でフォーマット（令和6年8月形式）
   */
  private formatJapaneseEra(year: number, month: number): string {
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

    return `${era}${eraYear}年${month}月`;
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
    if (salaryItemData && salaryItems) {
      const itemData = salaryItemData[key];
      if (itemData) {
        let absenceDeduction = 0;
        let bonusAmount = 0;

        // 給与項目マスタから「欠勤控除」種別の項目を探す
        const deductionItems = salaryItems.filter(
          (item) => item.type === 'deduction'
        );
        for (const item of deductionItems) {
          absenceDeduction += itemData[item.id] || 0;
        }

        // 給与項目マスタから「賞与」という名前の項目を探す（随時改定の計算から除外）
        const bonusItems = salaryItems.filter(
          (item) =>
            item.name === '賞与' ||
            item.name.includes('賞与') ||
            item.name.includes('ボーナス')
        );
        for (const item of bonusItems) {
          bonusAmount += itemData[item.id] || 0;
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
    const birth = new Date(birthDate);
    const today = getJSTDate();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }
}
