import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BonusAlertUiService } from '../../../../services/bonus-alert-ui.service';
import { OfficeService } from '../../../../services/office.service';
import { EmployeeService } from '../../../../services/employee.service';
import { BonusService } from '../../../../services/bonus.service';
import { Employee } from '../../../../models/employee.model';
import { Office } from '../../../../models/office.model';
import { Bonus } from '../../../../models/bonus.model';

export interface BonusReportAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  bonusAmount: number;
  payDate: string; // YYYY-MM-DD
  submitDeadline: Date; // 提出期限（支給日から5日後）
  daysUntilDeadline: number; // 提出期限までの日数
}

@Component({
  selector: 'app-alert-bonus-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-bonus-tab.component.html',
  styleUrl: './alert-bonus-tab.component.css',
})
export class AlertBonusTabComponent {
  @Input() bonusReportAlerts: BonusReportAlert[] = [];
  @Input() selectedBonusReportAlertIds: Set<string> = new Set();
  @Input() employees: Employee[] = [];
  @Output() alertSelectionChange = new EventEmitter<{
    alertId: string;
    selected: boolean;
  }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  constructor(
    private bonusAlertUiService: BonusAlertUiService,
    private officeService: OfficeService,
    private employeeService: EmployeeService,
    private bonusService: BonusService
  ) {}

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    return this.bonusAlertUiService.formatDate(date);
  }

  /**
   * 支給日をフォーマット
   */
  formatPayDate(payDateStr: string): string {
    return this.bonusAlertUiService.formatPayDate(payDateStr);
  }

  /**
   * 賞与支払届アラートの選択管理
   */
  toggleBonusReportAlertSelection(alertId: string): void {
    const isSelected = this.selectedBonusReportAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllBonusReportAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isBonusReportAlertSelected(alertId: string): boolean {
    return this.selectedBonusReportAlertIds.has(alertId);
  }

  /**
   * 選択した賞与支払届アラートを削除
   */
  deleteSelectedBonusReportAlerts(): void {
    if (this.selectedBonusReportAlertIds.size === 0) {
      return;
    }
    const count = this.selectedBonusReportAlertIds.size;
    if (!confirm(`選択した${count}件のアラートを削除（非表示）しますか？`)) {
      return;
    }
    this.deleteSelected.emit();
  }

  /**
   * CSV出力
   */
  async exportToCsv(): Promise<void> {
    if (this.bonusReportAlerts.length === 0) {
      alert('出力するデータがありません。');
      return;
    }

    try {
      // CSVデータを生成
      const csvLines: string[] = [];

      // 「賞与支払届」は最初だけ
      csvLines.push('賞与支払届');
      csvLines.push('');

      // 各従業員ごとに処理
      for (let i = 0; i < this.bonusReportAlerts.length; i++) {
        const alert = this.bonusReportAlerts[i];
        const employee = this.employees.find((e) => e.id === alert.employeeId);
        if (!employee) continue;

        // 事業所情報を取得
        let office: Office | null = null;
        if (employee.officeNumber) {
          const offices = await this.officeService.getAllOffices();
          office =
            offices.find((o) => o.officeNumber === employee.officeNumber) ||
            null;
        }
        if (!office) {
          const offices = await this.officeService.getAllOffices();
          office = offices[0] || null;
        }

        // 事業所整理記号のフォーマット（例：01-イ-1234567）
        const officeCodeStr = office?.officeCode || '';
        const officeNumberStr = office?.officeNumber || '';
        const officeCodeFormatted =
          officeCodeStr && officeNumberStr
            ? `${officeCodeStr}-${officeNumberStr}`
            : officeCodeStr || officeNumberStr || '';

        // 支給日を令和YYMMDD形式に変換
        const payDateObj = new Date(alert.payDate);
        const year = payDateObj.getFullYear();
        const month = String(payDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(payDateObj.getDate()).padStart(2, '0');
        // 令和年を計算（2019年が令和1年）
        const reiwaYear = year >= 2019 ? year - 2018 : 0;
        const reiwaYearStr = String(reiwaYear).padStart(2, '0');
        const payDateFormatted = `R${reiwaYearStr}${month}${day}`;

        // 賞与データを取得（1000円未満切り捨て額を取得）
        const bonuses = await this.bonusService.getBonusesByEmployee(
          alert.employeeId,
          payDateObj
        );
        const bonus = bonuses.find((b) => b.payDate === alert.payDate);
        const standardBonusAmount =
          bonus?.standardBonusAmount ||
          Math.floor(alert.bonusAmount / 1000) * 1000;

        // 生年月日を和暦形式に変換
        const birthDate = this.formatBirthDateToEra(employee.birthDate);

        // 年齢を計算
        const age = this.calculateAge(employee.birthDate, alert.payDate);

        // 被保険者整理番号（従業員の被保険者整理番号フィールドを使用）
        const insuredNumber = employee.insuredNumber || '';

        // 個人番号と基礎年金番号を取得
        const myNumber = employee.myNumber || '';
        const basicPensionNumber = employee.basicPensionNumber || '';

        // 各従業員の情報を出力（各項目を1行ずつ）
        csvLines.push(`事業所整理記号,${officeCodeFormatted}`);
        csvLines.push(`事業所所在地,${office?.address || ''}`);
        csvLines.push(`事業所名称,${office?.officeName || ''}`);
        csvLines.push(`事業主氏名,${office?.ownerName || ''}`);
        csvLines.push(`電話番号,${office?.phoneNumber || ''}`);
        csvLines.push(`賞与支給日,${payDateFormatted}`);
        csvLines.push(`被保険者整理番号,${insuredNumber}`);
        csvLines.push(`被保険者氏名,${employee.name || ''}`);
        csvLines.push(`被保険者氏名（カナ）,${employee.nameKana || ''}`);
        csvLines.push(`生年月日,${birthDate}`);
        csvLines.push(`賞与額,${String(alert.bonusAmount)}`);
        csvLines.push(
          `賞与額（1000円未満切り捨て）,${String(standardBonusAmount)}`
        );
        csvLines.push(`個人番号,${myNumber}`);
        csvLines.push(`基礎年金番号,${basicPensionNumber}`);
        csvLines.push(`年齢,${String(age)}`);

        // 従業員情報間には2行の改行スペースを入れる（最後の従業員以外）
        if (i < this.bonusReportAlerts.length - 1) {
          csvLines.push('');
          csvLines.push('');
        }
      }

      // CSVファイルをダウンロード
      const csvContent = csvLines.join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `賞与支払届_${new Date().toISOString().split('T')[0]}.csv`
      );
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('CSV出力エラー:', error);
      alert('CSV出力中にエラーが発生しました。');
    }
  }

  /**
   * 生年月日を和暦形式に変換（例：平成8年7月6日）
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
   * 年齢を計算
   */
  private calculateAge(birthDateStr: string, referenceDateStr: string): number {
    if (!birthDateStr || !referenceDateStr) return 0;
    const birthDate = new Date(birthDateStr);
    const referenceDate = new Date(referenceDateStr);
    let age = referenceDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  }
}
