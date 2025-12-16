import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BonusAlertUiService } from '../../../../services/bonus-alert-ui.service';
import { OfficeService } from '../../../../services/office.service';
import { EmployeeService } from '../../../../services/employee.service';
import { BonusService } from '../../../../services/bonus.service';
import { Employee } from '../../../../models/employee.model';
import { Office } from '../../../../models/office.model';
import { RoomIdService } from '../../../../services/room-id.service';

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
    private bonusService: BonusService,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return '-';
    }
    try {
      return this.bonusAlertUiService.formatDate(date);
    } catch (error) {
      console.error('[alert-bonus-tab] formatDateエラー:', error);
      return '-';
    }
  }

  /**
   * 支給日をフォーマット
   */
  formatPayDate(payDateStr: string): string {
    if (!payDateStr) {
      return '-';
    }
    try {
      return this.bonusAlertUiService.formatPayDate(payDateStr);
    } catch (error) {
      console.error('[alert-bonus-tab] formatPayDateエラー:', error);
      return '-';
    }
  }

  /**
   * 賞与支払届アラートの選択管理
   */
  toggleBonusReportAlertSelection(alertId: string): void {
    if (!alertId) {
      console.warn('[alert-bonus-tab] toggleBonusReportAlertSelection: alertIdが無効です');
      return;
    }
    if (!this.selectedBonusReportAlertIds) {
      this.selectedBonusReportAlertIds = new Set();
    }
    const isSelected = this.selectedBonusReportAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllBonusReportAlertsChange(event: Event): void {
    if (!event || !event.target) {
      console.warn('[alert-bonus-tab] toggleAllBonusReportAlertsChange: eventが無効です');
      return;
    }
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isBonusReportAlertSelected(alertId: string): boolean {
    if (!alertId || !this.selectedBonusReportAlertIds) {
      return false;
    }
    return this.selectedBonusReportAlertIds.has(alertId);
  }

  /**
   * 選択した賞与支払届アラートを削除
   */
  deleteSelectedBonusReportAlerts(): void {
    if (!this.selectedBonusReportAlertIds || this.selectedBonusReportAlertIds.size === 0) {
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
      const roomId = this.roomIdService.requireRoomId();
      // CSVデータを生成
      const csvLines: string[] = [];

      // 「賞与支払届」は最初だけ
      csvLines.push('賞与支払届');
      csvLines.push('');

      // 各従業員ごとに処理
      for (let i = 0; i < this.bonusReportAlerts.length; i++) {
        const alert = this.bonusReportAlerts[i];
        if (!alert || !alert.employeeId) {
          console.warn(`[alert-bonus-tab] 無効なアラート: インデックス=${i}`);
          continue;
        }

        const employee = this.employees.find((e) => e.id === alert.employeeId);
        if (!employee) {
          console.warn(`[alert-bonus-tab] 従業員が見つかりません: ID=${alert.employeeId}`);
          continue;
        }

        // 事業所情報を取得
        let office: Office | null = null;
        try {
          if (employee.officeNumber) {
            const offices = await this.officeService.getAllOffices();
            if (offices && Array.isArray(offices)) {
              office =
                offices.find((o) => o.officeNumber === employee.officeNumber) ||
                null;
            }
          }
          if (!office) {
            const offices = await this.officeService.getAllOffices();
            if (offices && Array.isArray(offices) && offices.length > 0) {
              office = offices[0] || null;
            }
          }
        } catch (error) {
          console.error(`[alert-bonus-tab] 事業所情報取得エラー: 従業員ID=${employee.id}`, error);
          // エラーが発生しても処理を継続（officeはnullのまま）
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
        if (isNaN(payDateObj.getTime())) {
          console.error(`[alert-bonus-tab] 無効な支給日: ${alert.payDate}`);
          continue;
        }
        const year = payDateObj.getFullYear();
        const month = String(payDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(payDateObj.getDate()).padStart(2, '0');
        // 令和年を計算（2019年が令和1年）
        const reiwaYear = year >= 2019 ? year - 2018 : 0;
        if (reiwaYear <= 0) {
          console.error(`[alert-bonus-tab] 無効な年: ${year}`);
          continue;
        }
        const reiwaYearStr = String(reiwaYear).padStart(2, '0');
        const payDateFormatted = `R${reiwaYearStr}${month}${day}`;

        // 賞与データを取得（1000円未満切り捨て額を取得）
        let standardBonusAmount = Math.floor(alert.bonusAmount / 1000) * 1000;
        try {
          const bonuses = await this.bonusService.listBonuses(
            roomId,
            alert.employeeId,
            year
          );
          if (bonuses && Array.isArray(bonuses)) {
            const bonus = bonuses.find((b) => b && b.payDate === alert.payDate);
            if (bonus && bonus.standardBonusAmount !== undefined) {
              standardBonusAmount = bonus.standardBonusAmount;
            }
          }
        } catch (error) {
          console.error(
            `[alert-bonus-tab] 賞与データ取得エラー: 従業員ID=${alert.employeeId}, 年度=${year}`,
            error
          );
          // エラーが発生してもデフォルト値を使用
        }

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
      if (csvLines.length === 0) {
        alert('出力するデータがありません。');
        return;
      }

      const csvContent = csvLines.join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      link.setAttribute(
        'download',
        `賞与支払届_${dateStr}.csv`
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
          console.error('[alert-bonus-tab] CSVダウンロード後のクリーンアップエラー:', error);
        }
      }, 100);
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
    try {
      const date = new Date(birthDateStr);
      if (isNaN(date.getTime())) {
        return '';
      }
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
    } catch (error) {
      console.error('[alert-bonus-tab] formatBirthDateToEraエラー:', error);
      return '';
    }
  }

  /**
   * 年齢を計算
   */
  private calculateAge(birthDateStr: string, referenceDateStr: string): number {
    if (!birthDateStr || !referenceDateStr) return 0;
    try {
      const birthDate = new Date(birthDateStr);
      const referenceDate = new Date(referenceDateStr);
      
      if (isNaN(birthDate.getTime()) || isNaN(referenceDate.getTime())) {
        return 0;
      }
      
      let age = referenceDate.getFullYear() - birthDate.getFullYear();
      const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())
      ) {
        age--;
      }
      
      // 年齢が負の値や異常に大きい値の場合は0を返す
      if (age < 0 || age > 150) {
        return 0;
      }
      
      return age;
    } catch (error) {
      console.error('[alert-bonus-tab] calculateAgeエラー:', error);
      return 0;
    }
  }
}
