import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeijiAlertUiService } from '../../../../services/teiji-alert-ui.service';
import { OfficeService } from '../../../../services/office.service';
import { MonthlySalaryService } from '../../../../services/monthly-salary.service';
import { StandardRemunerationHistoryService } from '../../../../services/standard-remuneration-history.service';
import { SettingsService } from '../../../../services/settings.service';
import { Employee } from '../../../../models/employee.model';
import { Office } from '../../../../models/office.model';
import { SalaryItem } from '../../../../models/salary-item.model';
import { getJSTDate } from '../../../../utils/alerts-helper';
import { RoomIdService } from '../../../../services/room-id.service';

export interface TeijiKetteiResultData {
  employeeId: string;
  employeeName: string;
  aprilSalary: number;
  aprilWorkingDays: number;
  maySalary: number;
  mayWorkingDays: number;
  juneSalary: number;
  juneWorkingDays: number;
  averageSalary: number;
  excludedMonths: number[];
  exclusionCandidates: number[]; // 平均額との差が10%以上の月
  teijiResult: any;
}

@Component({
  selector: 'app-alert-teiji-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './alert-teiji-tab.component.html',
  styleUrl: './alert-teiji-tab.component.css',
})
export class AlertTeijiTabComponent {
  @Input() teijiKetteiResults: TeijiKetteiResultData[] = [];
  @Input() teijiYear: number = new Date().getFullYear();
  @Input() availableYears: number[] = [];
  @Input() isLoadingTeijiKettei: boolean = false;
  @Input() employees: Employee[] = [];
  @Input() selectedTeijiAlertIds: Set<string> = new Set();
  @Output() yearChange = new EventEmitter<number>();
  @Output() alertSelectionChange = new EventEmitter<{
    alertId: string;
    selected: boolean;
  }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  constructor(
    private teijiAlertUiService: TeijiAlertUiService,
    private officeService: OfficeService,
    private monthlySalaryService: MonthlySalaryService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService,
    private settingsService: SettingsService,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 定時決定（算定基礎届）の提出期日を取得
   */
  getTeijiReportDeadline(year: number): string {
    return this.teijiAlertUiService.getTeijiReportDeadline(year);
  }

  /**
   * 算定決定タブの年度変更ハンドラ
   */
  onTeijiYearChange(): void {
    this.yearChange.emit(this.teijiYear);
  }

  /**
   * 算定基礎届アラートのIDを取得
   */
  getTeijiAlertId(result: TeijiKetteiResultData): string {
    return result.employeeId;
  }

  /**
   * 算定基礎届アラートの選択管理
   */
  toggleTeijiAlertSelection(alertId: string): void {
    const isSelected = this.selectedTeijiAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllTeijiAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isTeijiAlertSelected(alertId: string): boolean {
    return this.selectedTeijiAlertIds.has(alertId);
  }

  /**
   * 選択した算定基礎届アラートを削除
   */
  deleteSelectedTeijiAlerts(): void {
    if (this.selectedTeijiAlertIds.size === 0) {
      return;
    }
    const count = this.selectedTeijiAlertIds.size;
    if (!confirm(`選択した${count}件のアラートを削除（非表示）しますか？`)) {
      return;
    }
    this.deleteSelected.emit();
  }

  /**
   * CSV出力（全従業員分を出力）
   */
  async exportToCsv(): Promise<void> {
    try {
      // 全従業員分のCSVを生成
      const csvRows: string[] = [];

      // 「算定基礎届」は最初だけ
      csvRows.push('算定基礎届');
      csvRows.push('');

      for (let i = 0; i < this.teijiKetteiResults.length; i++) {
        const teijiResult = this.teijiKetteiResults[i];
        const employee = this.employees.find(
          (e) => e.id === teijiResult.employeeId
        ) as Employee | undefined;
        if (!employee) continue;

        // 事業所情報を取得
        let office: Office | null = null;
        if (employee.officeNumber) {
          const offices = await this.officeService.getAllOffices();
          office =
            offices.find((o) => o.officeNumber === employee.officeNumber) ||
            null;
        }

        // 給与データを取得
        const roomId = this.roomIdService.requireRoomId();
        const aprilData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          employee.id,
          this.teijiYear,
          4
        );
        const mayData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          employee.id,
          this.teijiYear,
          5
        );
        const juneData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          employee.id,
          this.teijiYear,
          6
        );

        // 給与項目マスタを取得
        const salaryItems = await this.settingsService.loadSalaryItems(
          this.teijiYear
        );

        // 標準報酬履歴を取得（従前の標準報酬月額と従前改定月）
        const histories =
          await this.standardRemunerationHistoryService.getStandardRemunerationHistories(
            employee.id
          );
        const applyStartYear = this.teijiYear;
        const applyStartMonth = 9; // 算定基礎届は9月適用
        const previousHistory =
          histories.find(
            (h) =>
              h.applyStartYear < applyStartYear ||
              (h.applyStartYear === applyStartYear &&
                h.applyStartMonth < applyStartMonth)
          ) || histories[0];

        const payMonths: number[] = [];
        const workingDaysList: number[] = [];
        const remunerationList: number[] = [];

        // 給与項目データを準備
        const salaryItemData: { [key: string]: { [itemId: string]: number } } =
          {};
        const monthDataList = [
          { month: 4, data: aprilData },
          { month: 5, data: mayData },
          { month: 6, data: juneData },
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

        // 4月、5月、6月のデータを処理（算定基礎届は常にこの3か月を使用）
        if (aprilData) {
          payMonths.push(4);
          workingDaysList.push(aprilData.workingDays || 0);
          remunerationList.push(
            this.calculateRemuneration(
              aprilData,
              `${employee.id}_4`,
              salaryItemData,
              salaryItems
            )
          );
        }
        if (mayData) {
          payMonths.push(5);
          workingDaysList.push(mayData.workingDays || 0);
          remunerationList.push(
            this.calculateRemuneration(
              mayData,
              `${employee.id}_5`,
              salaryItemData,
              salaryItems
            )
          );
        }
        if (juneData) {
          payMonths.push(6);
          workingDaysList.push(juneData.workingDays || 0);
          remunerationList.push(
            this.calculateRemuneration(
              juneData,
              `${employee.id}_6`,
              salaryItemData,
              salaryItems
            )
          );
        }

        // 総計と平均額（支払基礎日数がフルタイムは17日未満、短時間労働者は11日未満は計算対象外）
        const isShortTime =
          employee.isShortTime ||
          employee.weeklyWorkHoursCategory === '20-30hours' ||
          employee.weeklyWorkHoursCategory === 'less-than-20hours';
        const minWorkingDays = isShortTime ? 11 : 17;
        const validMonths = remunerationList.filter(
          (_, i) => workingDaysList[i] >= minWorkingDays
        );
        const total = validMonths.reduce((sum, r) => sum + r, 0);
        const average =
          validMonths.length > 0 ? Math.floor(total / validMonths.length) : 0;

        // 年齢
        const age = this.calculateAge(employee.birthDate);

        // 各従業員の情報を出力（各項目を1行ずつ）
        csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
        csvRows.push(`事業所整理番号,${office?.officeNumber || ''}`);
        csvRows.push(`事業所所在地,${office?.address || ''}`);
        csvRows.push(`事業所名所,${office?.officeName || ''}`);
        csvRows.push(`事業主氏名,${office?.ownerName || ''}`);
        csvRows.push(`電話番号,${office?.phoneNumber || ''}`);
        csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
        csvRows.push(`被保険者氏名,${employee.name || ''}`);
        csvRows.push(`被保険者氏名（カナ）,${employee.nameKana || ''}`);
        csvRows.push(`生年月日,${this.formatBirthDate(employee.birthDate)}`);
        csvRows.push(
          `適応年月,${this.formatJapaneseEra(applyStartYear, applyStartMonth)}`
        );
        csvRows.push(`個人番号,${employee.myNumber || ''}`);
        csvRows.push(`基礎年金番号,${employee.basicPensionNumber || ''}`);
        csvRows.push(
          `従前の標準報酬月額,${
            previousHistory?.standardMonthlyRemuneration ||
            employee.currentStandardMonthlyRemuneration ||
            ''
          }`
        );
        csvRows.push(
          `従前改定月,${
            previousHistory
              ? this.formatJapaneseEra(
                  previousHistory.applyStartYear,
                  previousHistory.applyStartMonth
                )
              : ''
          }`
        );
        csvRows.push(`支給月,${payMonths.map((m) => `${m}月`).join('、')}`);
        csvRows.push(
          `給与計算の基礎日数,${workingDaysList
            .map((d) => `${d}日`)
            .join('、')}`
        );
        csvRows.push(
          `報酬月額,${remunerationList.map((r) => r.toString()).join('、')}`
        );
        csvRows.push(`総計,${total.toString()}`);
        csvRows.push(`平均額,${average.toString()}`);
        csvRows.push(`年齢,${age}歳`);
        csvRows.push(`短時間労働者,${isShortTime ? '〇' : '×'}`);

        // 従業員情報間には2行の改行スペースを入れる（最後の従業員以外）
        if (i < this.teijiKetteiResults.length - 1) {
          csvRows.push('');
          csvRows.push('');
        }
      }

      // CSVファイルをダウンロード
      const csvContent = csvRows.join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `算定基礎届_${this.teijiYear}年.csv`);
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
