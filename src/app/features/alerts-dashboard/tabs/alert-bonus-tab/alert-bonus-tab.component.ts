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
  styleUrl: './alert-bonus-tab.component.css'
})
export class AlertBonusTabComponent {
  @Input() bonusReportAlerts: BonusReportAlert[] = [];
  @Input() selectedBonusReportAlertIds: Set<string> = new Set();
  @Input() employees: Employee[] = [];
  @Output() alertSelectionChange = new EventEmitter<{ alertId: string; selected: boolean }>();
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
      // 事業所情報を取得（最初の従業員の事業所を使用）
      const firstEmployee = this.employees.find(e => 
        this.bonusReportAlerts.some(a => a.employeeId === e.id)
      );
      let office: Office | null = null;
      if (firstEmployee?.officeNumber) {
        const offices = await this.officeService.getAllOffices();
        office = offices.find(o => o.officeNumber === firstEmployee.officeNumber) || offices[0] || null;
      } else {
        const offices = await this.officeService.getAllOffices();
        office = offices[0] || null;
      }

      // 支給日ごとにグループ化
      const alertsByPayDate: { [payDate: string]: BonusReportAlert[] } = {};
      for (const alert of this.bonusReportAlerts) {
        if (!alertsByPayDate[alert.payDate]) {
          alertsByPayDate[alert.payDate] = [];
        }
        alertsByPayDate[alert.payDate].push(alert);
      }

      // CSVデータを生成
      const csvLines: string[] = [];

      // 支給日ごとに処理
      for (const payDate of Object.keys(alertsByPayDate).sort()) {
        const alerts = alertsByPayDate[payDate];
        
        // ① ヘッダー情報（1支給日に1度）
        csvLines.push('賞与支払届');
        // 事業所整理記号のフォーマット（例：01-イ）
        const officeCodeStr = office?.officeCode || '';
        const officeNumberStr = office?.officeNumber || '';
        const officeCodeFormatted = officeCodeStr && officeNumberStr ? `${officeCodeStr}-${officeNumberStr}` : (officeCodeStr || officeNumberStr || '');
        csvLines.push(`事業所整理記号,${officeCodeFormatted}`);
        csvLines.push(`事業所所在地,${office?.address || ''}`);
        csvLines.push(`事業所名称,${office?.officeName || ''}`);
        csvLines.push(`事業主氏名,${office?.ownerName || ''}`);
        csvLines.push(`電話番号,${office?.phoneNumber || ''}`);
        
        // 支給日を令和YYMMDD形式に変換
        const payDateObj = new Date(payDate);
        const year = payDateObj.getFullYear();
        const month = String(payDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(payDateObj.getDate()).padStart(2, '0');
        // 令和年を計算（2019年が令和1年）
        const reiwaYear = year >= 2019 ? year - 2018 : 0;
        const reiwaYearStr = String(reiwaYear).padStart(2, '0');
        csvLines.push(`賞与支給日,R${reiwaYearStr}${month}${day}`);
        csvLines.push(''); // 空行

        // ② 従業員ごとのデータ
        csvLines.push('被保険者整理番号,被保険者氏名,生年月日,賞与額,賞与額（1000円未満切り捨て）,個人番号,基礎年金番号,年齢');
        
        for (const alert of alerts) {
          const employee = this.employees.find(e => e.id === alert.employeeId);
          if (!employee) continue;

          // 賞与データを取得（1000円未満切り捨て額を取得）
          const payDateObj = new Date(payDate);
          const bonuses = await this.bonusService.getBonusesByEmployee(alert.employeeId, payDateObj);
          const bonus = bonuses.find(b => b.payDate === payDate);
          const standardBonusAmount = bonus?.standardBonusAmount || Math.floor(alert.bonusAmount / 1000) * 1000;

          // 生年月日を和暦形式に変換
          const birthDate = this.formatBirthDateToEra(employee.birthDate);
          
          // 年齢を計算
          const age = this.calculateAge(employee.birthDate, payDate);

          // 被保険者整理番号（従業員の被保険者整理番号フィールドを使用）
          const insuredNumber = employee.insuredNumber || '';

          // 個人番号と基礎年金番号を取得
          const myNumber = employee.myNumber || '';
          const basicPensionNumber = employee.basicPensionNumber || '';

          csvLines.push([
            insuredNumber,
            employee.name || '',
            birthDate,
            String(alert.bonusAmount), // 賞与額（カンマなし）
            String(standardBonusAmount), // 賞与額（1000円未満切り捨て）（カンマなし）
            myNumber, // 個人番号
            basicPensionNumber, // 基礎年金番号
            String(age)
          ].join(','));
        }

        csvLines.push(''); // 支給日ごとの区切り空行
      }

      // CSVファイルをダウンロード
      const csvContent = csvLines.join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `賞与支払届_${new Date().toISOString().split('T')[0]}.csv`);
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
    if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
}



