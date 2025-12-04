import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgeAlert } from '../alert-age-tab.component';
import { formatDate as formatDateHelper, getJSTDate } from '../../../../../utils/alerts-helper';
import { OfficeService } from '../../../../../services/office.service';
import { MonthlySalaryService } from '../../../../../services/monthly-salary.service';
import { SettingsService } from '../../../../../services/settings.service';
import { FamilyMemberService } from '../../../../../services/family-member.service';
import { Employee } from '../../../../../models/employee.model';
import { Office } from '../../../../../models/office.model';
import { SalaryItem } from '../../../../../models/salary-item.model';

@Component({
  selector: 'app-age-alert-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './age-alert-list.component.html',
  styleUrl: './age-alert-list.component.css'
})
export class AgeAlertListComponent {
  @Input() ageAlerts: AgeAlert[] = [];
  @Input() selectedAgeAlertIds: Set<string> = new Set();
  @Input() employees: Employee[] = [];
  @Output() alertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  constructor(
    private officeService: OfficeService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private familyMemberService: FamilyMemberService
  ) {}

  formatDate(date: Date): string {
    return formatDateHelper(date);
  }

  formatBirthDate(birthDateString: string): string {
    const date = new Date(birthDateString);
    return formatDateHelper(date);
  }

  toggleAgeAlertSelection(alertId: string): void {
    const isSelected = this.selectedAgeAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllAgeAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isAgeAlertSelected(alertId: string): boolean {
    return this.selectedAgeAlertIds.has(alertId);
  }

  deleteSelectedAgeAlerts(): void {
    this.deleteSelected.emit();
  }

  /**
   * CSV出力（70歳到達厚生年金喪失届 / 75歳到達健保資格喪失届）
   */
  async exportToCsv(alert: AgeAlert): Promise<void> {
    if (alert.alertType !== '70歳到達' && alert.alertType !== '75歳到達') {
      return;
    }

    try {
      const employee = this.employees.find((e) => e.id === alert.employeeId) as Employee | undefined;
      if (!employee) {
        window.alert('従業員情報が見つかりません');
        return;
      }

      // 事業所情報を取得
      let office: Office | null = null;
      if (employee.officeNumber) {
        const offices = await this.officeService.getAllOffices();
        office = offices.find((o) => o.officeNumber === employee.officeNumber) || null;
      }
      if (!office) {
        const offices = await this.officeService.getAllOffices();
        office = offices[0] || null;
      }

      // 到達日を取得
      const reachDate = alert.reachDate;
      const reachYear = reachDate.getFullYear();
      const reachMonth = reachDate.getMonth() + 1;
      const reachDay = reachDate.getDate();

      // CSVデータを生成
      const csvRows: string[] = [];

      if (alert.alertType === '70歳到達') {
        // 70歳到達厚生年金喪失届
        // 喪失年月日と該当年月日は70歳到達の誕生日の前日（reachDateが既に前日を表している）
        const lossDate = reachDate;

        // 70歳到達月の前月の報酬月額を取得
        const prevMonth = reachMonth - 1;
        const prevYear = prevMonth < 1 ? reachYear - 1 : reachYear;
        const actualPrevMonth = prevMonth < 1 ? 12 : prevMonth;

        // 給与データを取得
        const salaryData = await this.monthlySalaryService.getEmployeeSalary(employee.id, prevYear);
        const prevMonthData = salaryData?.[actualPrevMonth.toString()];

        // 給与項目マスタを取得
        const salaryItems = await this.settingsService.loadSalaryItems(prevYear);

        // 報酬月額を計算
        let remunerationAmount = 0;
        if (prevMonthData) {
          // 給与項目データを準備
          const salaryItemData: { [key: string]: { [itemId: string]: number } } = {};
          if (prevMonthData.salaryItems) {
            const key = `${employee.id}_${actualPrevMonth}`;
            salaryItemData[key] = {};
            for (const item of prevMonthData.salaryItems) {
              salaryItemData[key][item.itemId] = item.amount;
            }
          }

          remunerationAmount = this.calculateRemuneration(
            prevMonthData,
            `${employee.id}_${actualPrevMonth}`,
            salaryItemData,
            salaryItems
          );
        }

        // 性別を取得
        const gender = this.getGender(employee);

        // 扶養の有無を確認
        const familyMembers = await this.familyMemberService.getFamilyMembersByEmployeeId(employee.id);
        const hasDependents = familyMembers.length > 0;
        const dependentStatus = hasDependents ? '有' : '無';

        // 70歳到達の誕生日の翌日を計算（reachDateは前日なので、そこから2日後）
        const birthDate = new Date(employee.birthDate);
        const age70Birthday = new Date(birthDate.getFullYear() + 70, birthDate.getMonth(), birthDate.getDate());
        const nextDay = new Date(age70Birthday);
        nextDay.setDate(nextDay.getDate() + 1);

        csvRows.push('70歳到達厚生年金喪失届');
        csvRows.push('');
        csvRows.push('70歳以上被用者該当届');
        csvRows.push('');
        csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
        csvRows.push(`事業所番号,${office?.officeNumber || ''}`);
        csvRows.push(`事業所所在地,${office?.address || ''}`);
        csvRows.push(`事業所名称,${office?.officeName || '株式会社　伊藤忠商事'}`);
        csvRows.push(`事業主氏名,${office?.ownerName || '代表取締役社長　田中太郎'}`);
        csvRows.push(`電話番号,${office?.phoneNumber || '03-5432-6789'}`);
        csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
        csvRows.push(`被保険者氏名,${employee.name || ''}`);
        csvRows.push(`生年月日,${this.formatBirthDateToEra(employee.birthDate)}`);
        csvRows.push(`性別,${gender}`);
        csvRows.push(`個人番号,${employee.myNumber || ''}`);
        csvRows.push(`基礎年金番号,${employee.basicPensionNumber || ''}`);
        csvRows.push(`喪失年月日,${this.formatJapaneseEra(lossDate.getFullYear(), lossDate.getMonth() + 1, lossDate.getDate())}`);
        csvRows.push(`該当年月日,${this.formatJapaneseEra(lossDate.getFullYear(), lossDate.getMonth() + 1, lossDate.getDate())}`);
        csvRows.push(`報酬月額,${remunerationAmount.toString()}`);
        csvRows.push(`扶養,${dependentStatus}`);
        csvRows.push(`70歳以上被用者該当届,${this.formatJapaneseEra(nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate())}`);

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
          `70歳到達厚生年金喪失届_${employee.name}_${reachYear}年${reachMonth}月.csv`
        );
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (alert.alertType === '75歳到達') {
        // 75歳到達健保資格喪失届
        // 喪失年月日は75歳到達の誕生日（reachDateから1日後を計算）
        // 生年月日から75歳到達日を計算
        const birthDate = new Date(employee.birthDate);
        const lossDate = new Date(birthDate.getFullYear() + 75, birthDate.getMonth(), birthDate.getDate());

        csvRows.push('75歳到達健保資格喪失届');
        csvRows.push('');
        csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
        csvRows.push(`事業所番号,${office?.officeNumber || ''}`);
        csvRows.push(`事業所所在地,${office?.address || ''}`);
        csvRows.push(`事業所名称,${office?.officeName || '株式会社　伊藤忠商事'}`);
        csvRows.push(`事業主氏名,${office?.ownerName || '代表取締役社長　田中太郎'}`);
        csvRows.push(`電話番号,${office?.phoneNumber || '03-5432-6789'}`);
        csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
        csvRows.push(`被保険者氏名,${employee.name || ''}`);
        csvRows.push(`生年月日,${this.formatBirthDateToEra(employee.birthDate)}`);
        csvRows.push(`個人番号,${employee.myNumber || ''}`);
        csvRows.push(`基礎年金番号,${employee.basicPensionNumber || ''}`);
        csvRows.push(`喪失年月日,${this.formatJapaneseEra(lossDate.getFullYear(), lossDate.getMonth() + 1, lossDate.getDate())}`);

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
          `75歳到達健保資格喪失届_${employee.name}_${lossDate.getFullYear()}年${lossDate.getMonth() + 1}月.csv`
        );
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('CSV出力エラー:', error);
      window.alert('CSV出力中にエラーが発生しました');
    }
  }

  /**
   * 生年月日を和暦形式に変換（昭和30年1月2日形式）
   */
  private formatBirthDateToEra(birthDateStr: string): string {
    if (!birthDateStr) return '';
    const date = new Date(birthDateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    let era = '';
    let eraYear = 0;

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
   * 年月日を元号形式でフォーマット（令和7年1月1日形式）
   */
  private formatJapaneseEra(year: number, month: number, day: number): string {
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
   * 性別を取得
   */
  private getGender(employee: Employee): string {
    return this.formatGenderValue(employee.gender) || '';
  }

  /**
   * 性別のコード値を表示用の文字に変換
   */
  private formatGenderValue(value: string | null | undefined): string {
    if (!value) return '';
    const genderMap: { [key: string]: string } = {
      'female': '女性',
      'male': '男性',
      '女性': '女性',
      '男性': '男性',
      'F': '女性',
      'M': '男性',
    };
    return genderMap[value.toLowerCase()] || value;
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
        const deductionItems = salaryItems.filter((item) => item.type === 'deduction');
        for (const item of deductionItems) {
          absenceDeduction += itemData[item.id] || 0;
        }

        // 給与項目マスタから「賞与」という名前の項目を探す
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
}

