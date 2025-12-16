import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QualificationChangeAlert } from '../alert-age-tab.component';
import {
  formatDate as formatDateHelper,
  getJSTDate,
} from '../../../../../utils/alerts-helper';
import { OfficeService } from '../../../../../services/office.service';
import { MonthlySalaryService } from '../../../../../services/monthly-salary.service';
import { SettingsService } from '../../../../../services/settings.service';
import { FamilyMemberService } from '../../../../../services/family-member.service';
import { EmployeeWorkCategoryService } from '../../../../../services/employee-work-category.service';
import { Employee } from '../../../../../models/employee.model';
import { Office } from '../../../../../models/office.model';
import { SalaryItem } from '../../../../../models/salary-item.model';
import { RoomIdService } from '../../../../../services/room-id.service';

@Component({
  selector: 'app-qualification-change-alert-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './qualification-change-alert-list.component.html',
  styleUrl: './qualification-change-alert-list.component.css',
})
export class QualificationChangeAlertListComponent {
  @Input() qualificationChangeAlerts: QualificationChangeAlert[] = [];
  @Input() selectedQualificationChangeAlertIds: Set<string> = new Set();
  @Input() employees: Employee[] = [];
  @Output() alertSelectionChange = new EventEmitter<{
    alertId: string;
    selected: boolean;
  }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  constructor(
    private officeService: OfficeService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private familyMemberService: FamilyMemberService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService,
    private roomIdService: RoomIdService
  ) {}

  formatDate(date: Date): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return '';
    }
    return formatDateHelper(date);
  }

  toggleQualificationChangeAlertSelection(alertId: string): void {
    if (!alertId) {
      return;
    }
    if (!this.selectedQualificationChangeAlertIds) {
      return;
    }
    const isSelected = this.selectedQualificationChangeAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllQualificationChangeAlertsChange(event: Event): void {
    if (!event || !event.target) {
      return;
    }
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isQualificationChangeAlertSelected(alertId: string): boolean {
    if (!alertId || !this.selectedQualificationChangeAlertIds) {
      return false;
    }
    return this.selectedQualificationChangeAlertIds.has(alertId);
  }

  deleteSelectedQualificationChangeAlerts(): void {
    if (!this.selectedQualificationChangeAlertIds || this.selectedQualificationChangeAlertIds.size === 0) {
      return;
    }
    // 確認ダイアログは親側（stateハンドラ）で行うよう統一し、ここではイベントのみ発火
    this.deleteSelected.emit();
  }

  /**
   * CSV出力（資格変更アラート）
   */
  async exportToCsv(alert: QualificationChangeAlert | null | undefined): Promise<void> {
    if (!alert || !alert.employeeId) {
      window.alert('アラート情報が不正です');
      return;
    }

    try {
      const employee = this.employees.find((e) => e && e.id === alert.employeeId) as
        | Employee
        | undefined;
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
        console.error(`[qualification-change-alert-list] 事業所情報取得エラー: 従業員ID=${employee.id}`, error);
      }

      // 適応日（変更日）を取得
      const changeDate = alert.changeDate;
      if (!changeDate || !(changeDate instanceof Date) || isNaN(changeDate.getTime())) {
        window.alert('変更日の情報が不正です');
        return;
      }
      const changeYear = changeDate.getFullYear();
      if (changeYear < 1900 || changeYear > 2100) {
        window.alert('変更年の情報が不正です');
        return;
      }
      const changeMonth = changeDate.getMonth() + 1;
      const changeDay = changeDate.getDate();

      // イベント発生日の前月の報酬月額を取得
      const prevMonth = changeMonth - 1;
      const prevYear = prevMonth < 1 ? changeYear - 1 : changeYear;
      const actualPrevMonth = prevMonth < 1 ? 12 : prevMonth;
      const roomId = this.roomIdService.requireRoomId();

      // 給与データを取得
      let prevMonthData = null;
      try {
        prevMonthData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          employee.id,
          prevYear,
          actualPrevMonth
        );
      } catch (error) {
        console.error(`[qualification-change-alert-list] 給与データ取得エラー: 従業員ID=${employee.id}, 年=${prevYear}, 月=${actualPrevMonth}`, error);
      }

      // 給与項目マスタを取得
      let salaryItems: SalaryItem[] = [];
      try {
        salaryItems = await this.settingsService.loadSalaryItems(prevYear);
      } catch (error) {
        console.error(`[qualification-change-alert-list] 給与項目マスタ取得エラー: 年=${prevYear}`, error);
      }

      // 報酬月額を計算
      let remunerationAmount = 0;
      if (prevMonthData) {
        // 給与項目データを準備
        const salaryItemData: { [key: string]: { [itemId: string]: number } } =
          {};
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

      // 被扶養者の有無を確認
      let familyMembers: any[] = [];
      try {
        familyMembers = await this.familyMemberService.getFamilyMembersByEmployeeId(
          employee.id
        ) || [];
      } catch (error) {
        console.error(`[qualification-change-alert-list] 扶養情報取得エラー: 従業員ID=${employee.id}`, error);
      }
      const hasDependents = familyMembers && Array.isArray(familyMembers) && familyMembers.length > 0;

      // 性別を取得（変更詳細から取得、または従業員の現在の性別を取得）
      const gender = this.getGender(employee, alert);

      // 勤務区分を取得
      const category =
        this.employeeWorkCategoryService.getWorkCategory(employee);
      const categoryLabel =
        category === 'full-time'
          ? 'フルタイム（週30時間以上）'
          : category === 'short-time-worker'
          ? '短時間労働者（特定適用）'
          : '社会保険非加入（週20時間未満または要件未達）';

      // CSVデータを生成
      const csvRows: string[] = [];

      csvRows.push('資格変更アラート');
      csvRows.push('');
      csvRows.push('基本情報');
      csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
      csvRows.push(`事業所番号,${office?.officeNumber || ''}`);
      csvRows.push(`事業所所在地,${office?.address || ''}`);
      csvRows.push(
        `事業所名称,${office?.officeName || '株式会社　伊藤忠商事'}`
      );
      csvRows.push(
        `事業主氏名,${office?.ownerName || '代表取締役社長　田中太郎'}`
      );
      csvRows.push(`電話番号,${office?.phoneNumber || '03-5432-6789'}`);
      csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
      csvRows.push(`被保険者氏名,${employee.name || ''}`);
      csvRows.push(`被保険者氏名（カナ）,${employee.nameKana || ''}`);
      csvRows.push(`性別,${gender}`);
      csvRows.push(`生年月日,${this.formatBirthDateToEra(employee.birthDate)}`);
      csvRows.push(`住所,${employee.address || ''}`);
      csvRows.push(`個人番号,${employee.myNumber || ''}`);
      csvRows.push(`基礎年金番号,${employee.basicPensionNumber || ''}`);
      csvRows.push(`被保険者番号,${employee.insuredNumber || ''}`);
      csvRows.push(
        `適応日,${this.formatJapaneseEra(changeYear, changeMonth, changeDay)}`
      );
      csvRows.push(`被扶養者,${hasDependents ? '有' : '無'}`);
      csvRows.push(`報酬月額,${remunerationAmount.toString()}`);
      csvRows.push(`勤務区分,${categoryLabel}`);

      // CSVファイルをダウンロード
      if (csvRows.length === 0) {
        window.alert('出力するデータがありません。');
        return;
      }
      const csvContent = csvRows.join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `資格変更アラート_${employee.name || '不明'}_${changeYear}年${changeMonth}月${changeDay}日.csv`
      );
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error('[qualification-change-alert-list] CSVダウンロード後のクリーンアップエラー:', error);
        }
      }, 100);
    } catch (error) {
      console.error('[qualification-change-alert-list] CSV出力エラー:', error);
      window.alert('CSV出力中にエラーが発生しました');
    }
  }

  /**
   * 生年月日をフォーマット（昭和30年1月2日形式）
   */
  private formatBirthDateToEra(birthDate: string | null | undefined): string {
    if (!birthDate || typeof birthDate !== 'string') {
      return '';
    }
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
  }

  /**
   * 年月日を元号形式でフォーマット（令和6年8月15日形式）
   */
  private formatJapaneseEra(year: number, month: number, day: number): string {
    if (isNaN(year) || year < 1900 || year > 2100 || 
        isNaN(month) || month < 1 || month > 12 ||
        isNaN(day) || day < 1 || day > 31) {
      return '';
    }
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
   * 報酬月額を計算（総支給額 - 欠勤控除 - 賞与）
   */
  private calculateRemuneration(
    monthData: any,
    key: string,
    salaryItemData?: { [key: string]: { [itemId: string]: number } },
    salaryItems?: SalaryItem[]
  ): number {
    if (!monthData || !key) {
      return 0;
    }
    const total = monthData.totalSalary ?? monthData.total ?? 0;
    if (isNaN(total)) {
      return 0;
    }

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
            absenceDeduction += itemData[item.id] || 0;
          }
        }

        // 給与項目マスタから「賞与」という名前の項目を探す
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
            bonusAmount += itemData[item.id] || 0;
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
   * 性別を取得（変更詳細から取得、または従業員の現在の性別を取得）
   */
  private getGender(
    employee: Employee,
    alert: QualificationChangeAlert
  ): string {
    // 変更種別が「性別変更」の場合は変更詳細から新しい値を取得
    if (alert.changeType === '性別変更') {
      // 変更詳細は「男性 → 女性」のような形式
      const details = alert.details;
      if (details && details.includes(' → ')) {
        const parts = details.split(' → ');
        if (parts.length >= 2) {
          return parts[1].trim(); // →の後の部分（新しい値）
        }
      }
    }

    // それ以外の場合は、Employeeモデルから取得（存在する場合）
    return this.formatGenderValue(employee.gender) || '';
  }

  /**
   * 性別のコード値を表示用の文字に変換
   */
  private formatGenderValue(value: string | null | undefined): string {
    if (!value) return '';
    const genderMap: { [key: string]: string } = {
      female: '女性',
      male: '男性',
      女性: '女性',
      男性: '男性',
      F: '女性',
      M: '男性',
    };
    return genderMap[value.toLowerCase()] || value;
  }

  /**
   * 週の所定労働時間を取得
   */
  private getWeeklyWorkHours(employee: Employee): string {
    const category = this.employeeWorkCategoryService.getWorkCategory(employee);
    if (category === 'full-time') {
      return 'フルタイム（週30時間以上）';
    }
    if (category === 'short-time-worker') {
      return '短時間労働者（特定適用）';
    }
    return '社会保険非加入（週20時間未満または要件未達）';
  }
}
