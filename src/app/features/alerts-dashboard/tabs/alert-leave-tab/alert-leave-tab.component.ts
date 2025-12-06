import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeaveAlertUiService } from '../../../../services/leave-alert-ui.service';
import { OfficeService } from '../../../../services/office.service';
import { EmployeeService } from '../../../../services/employee.service';
import { FamilyMemberService } from '../../../../services/family-member.service';
import { AlertsDashboardStateService } from '../../../../services/alerts-dashboard-state.service';
import { Employee } from '../../../../models/employee.model';
import { Office } from '../../../../models/office.model';
import { FamilyMember } from '../../../../models/family-member.model';
import {
  getJSTDate,
  normalizeDate,
  calculateSubmitDeadline,
  calculateDaysUntilDeadline,
  formatDate,
} from '../../../../utils/alerts-helper';

export interface MaternityChildcareAlert {
  id: string;
  employeeId: string;
  employeeName: string;
  alertType:
    | '産前産後休業取得者申出書'
    | '産前産後休業取得者変更（終了）届'
    | '育児休業等取得者申出書'
    | '育児休業等取得者終了届'
    | '傷病手当金支給申請書の記入依頼'
    | '育児休業関係の事業主証明書の記入依頼'
    | '出産手当金支給申請書の記入依頼'
    | '出産育児一時金支給申請書の記入依頼';
  notificationName: string;
  startDate: Date; // 開始日（産休開始日、育休開始日、産休終了日の翌日、育休終了日の翌日、賞与支給日、申請書記入依頼日）
  submitDeadline: Date; // 提出期限（開始日から5日後、または申請書記入依頼日から1週間後）
  daysUntilDeadline: number; // 提出期限までの日数
  details: string; // 詳細情報
}

@Component({
  selector: 'app-alert-leave-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-leave-tab.component.html',
  styleUrl: './alert-leave-tab.component.css',
})
export class AlertLeaveTabComponent implements OnInit {
  @Input() set maternityChildcareAlerts(value: MaternityChildcareAlert[]) {
    this._maternityChildcareAlerts = value || [];
  }
  get maternityChildcareAlerts(): MaternityChildcareAlert[] {
    return this._maternityChildcareAlerts;
  }
  private _maternityChildcareAlerts: MaternityChildcareAlert[] = [];

  @Input() selectedMaternityChildcareAlertIds: Set<string> = new Set();
  @Input() employees: Employee[] = [];
  @Output() alertSelectionChange = new EventEmitter<{
    alertId: string;
    selected: boolean;
  }>();
  @Output() selectAllChange = new EventEmitter<boolean>();
  @Output() deleteSelected = new EventEmitter<void>();

  constructor(
    private leaveAlertUiService: LeaveAlertUiService,
    private officeService: OfficeService,
    private employeeService: EmployeeService,
    private familyMemberService: FamilyMemberService,
    private state: AlertsDashboardStateService
  ) {}

  async ngOnInit(): Promise<void> {
    // @Input()でmaternityChildcareAlertsが渡されていない場合、自分でロードする
    // ただし、state.maternityChildcareAlertsが既に設定されている場合はそれを使用
    if (
      this.state.maternityChildcareAlerts &&
      this.state.maternityChildcareAlerts.length > 0
    ) {
      this._maternityChildcareAlerts = this.state.maternityChildcareAlerts;
    } else if (
      !this._maternityChildcareAlerts ||
      this._maternityChildcareAlerts.length === 0
    ) {
      this.employees = await this.employeeService.getAllEmployees();
      await this.loadMaternityChildcareAlerts();
    }
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    return this.leaveAlertUiService.formatDate(date);
  }

  /**
   * 産休・育休・休職アラートを読み込む
   */
  async loadMaternityChildcareAlerts(): Promise<void> {
    const alerts: MaternityChildcareAlert[] = [];
    const today = normalizeDate(getJSTDate());

    try {
      for (const emp of this.employees) {
        // 申請書記入依頼の日時フィールドはEmployee仕様から削除されたため、
        // ここでのアラート生成はスキップする。

        // 産前産後休業取得者申出書
        if (emp.maternityLeaveStart) {
          const startDate = normalizeDate(new Date(emp.maternityLeaveStart));
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          alerts.push({
            id: `maternity_start_${emp.id}_${emp.maternityLeaveStart}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '産前産後休業取得者申出書',
            notificationName: '産前産後休業取得者申出書',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `産休開始日: ${formatDate(startDate)}`,
          });
        }

        // 産前産後休業取得者変更（終了）届
        if (emp.maternityLeaveEnd) {
          const endDate = normalizeDate(new Date(emp.maternityLeaveEnd));
          const startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() + 1);
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          alerts.push({
            id: `maternity_end_${emp.id}_${emp.maternityLeaveEnd}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '産前産後休業取得者変更（終了）届',
            notificationName: '産前産後休業取得者変更（終了）届',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `産休終了日: ${formatDate(endDate)}`,
          });
        }

        // 育児休業等取得者申出書
        if (emp.childcareLeaveStart) {
          const startDate = normalizeDate(new Date(emp.childcareLeaveStart));
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          alerts.push({
            id: `childcare_start_${emp.id}_${emp.childcareLeaveStart}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '育児休業等取得者申出書',
            notificationName: '育児休業等取得者申出書',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `育休開始日: ${formatDate(startDate)}`,
          });
        }

        // 育児休業等取得者終了届
        if (emp.childcareLeaveEnd) {
          const endDate = normalizeDate(new Date(emp.childcareLeaveEnd));
          const startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() + 1);
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          alerts.push({
            id: `childcare_end_${emp.id}_${emp.childcareLeaveEnd}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '育児休業等取得者終了届',
            notificationName: '育児休業等取得者終了届',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `育休終了日: ${formatDate(endDate)}`,
          });
        }
      }

      alerts.sort((a, b) => {
        return b.startDate.getTime() - a.startDate.getTime();
      });

      // @Input()で渡されていない場合、自分で設定
      if (
        !this._maternityChildcareAlerts ||
        this._maternityChildcareAlerts.length === 0
      ) {
        this._maternityChildcareAlerts = alerts;
      }

      // state.maternityChildcareAlertsも更新（届出スケジュールで使用されるため）
      this.state.maternityChildcareAlerts = alerts;
      this.state.updateScheduleData();
    } catch (error) {
      console.error(
        '[alert-leave-tab] loadMaternityChildcareAlertsエラー:',
        error
      );
    }
  }

  // 産休育休アラートの選択管理
  toggleMaternityChildcareAlertSelection(alertId: string): void {
    const isSelected = this.selectedMaternityChildcareAlertIds.has(alertId);
    this.alertSelectionChange.emit({ alertId, selected: !isSelected });
  }

  toggleAllMaternityChildcareAlertsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectAllChange.emit(target.checked);
  }

  isMaternityChildcareAlertSelected(alertId: string): boolean {
    return this.selectedMaternityChildcareAlertIds.has(alertId);
  }

  // 産休育休アラートの削除
  deleteSelectedMaternityChildcareAlerts(): void {
    if (this.selectedMaternityChildcareAlertIds.size === 0) {
      return;
    }
    const count = this.selectedMaternityChildcareAlertIds.size;
    if (!confirm(`選択した${count}件のアラートを削除（非表示）しますか？`)) {
      return;
    }

    // @Input()でmaternityChildcareAlertsが渡されている場合は親に委譲
    // そうでない場合は自分で削除処理を行う
    if (
      this._maternityChildcareAlerts &&
      this._maternityChildcareAlerts.length > 0 &&
      this._maternityChildcareAlerts === this.state.maternityChildcareAlerts
    ) {
      // 親経由で削除（state経由）
      this.deleteSelected.emit();
    } else {
      // 自分でロードしたアラートを削除
      const selectedIds = Array.from(this.selectedMaternityChildcareAlertIds);

      this._maternityChildcareAlerts = this._maternityChildcareAlerts.filter(
        (alert) => !selectedIds.includes(alert.id)
      );
      this.selectedMaternityChildcareAlertIds.clear();

      // stateも更新
      this.state.maternityChildcareAlerts = this._maternityChildcareAlerts;
      this.state.updateScheduleData();
    }
  }

  /**
   * CSV出力（産前産後休業取得者申出書 / 産前産後休業取得者変更（終了）届 / 育児休業等取得者申出書 / 育児休業等取得者終了届 / 傷病手当金支給申請書の記入依頼）
   */
  async exportToCsv(alert: MaternityChildcareAlert): Promise<void> {
    try {
      const employee = this.employees.find((e) => e.id === alert.employeeId) as
        | Employee
        | undefined;
      let emp: Employee | null = null;

      if (!employee) {
        // employeesにない場合は、EmployeeServiceから取得
        const fetchedEmp = await this.employeeService.getEmployeeById(
          alert.employeeId
        );
        if (!fetchedEmp) {
          window.alert('従業員情報が見つかりません');
          return;
        }
        emp = fetchedEmp as Employee;
      } else {
        emp = employee;
      }

      if (
        alert.alertType === '産前産後休業取得者申出書' ||
        alert.alertType === '産前産後休業取得者変更（終了）届'
      ) {
        await this.generateCsvForMaternityLeave(alert, emp);
      } else if (
        alert.alertType === '育児休業等取得者申出書' ||
        alert.alertType === '育児休業等取得者終了届'
      ) {
        await this.generateCsvForChildcareLeave(alert, emp);
      } else if (alert.alertType === '傷病手当金支給申請書の記入依頼') {
        await this.generateCsvForSickPayApplication(alert, emp);
      } else if (alert.alertType === '育児休業関係の事業主証明書の記入依頼') {
        await this.generateCsvForChildcareEmployerCertificate(alert, emp);
      } else if (alert.alertType === '出産手当金支給申請書の記入依頼') {
        await this.generateCsvForMaternityAllowanceApplication(alert, emp);
      }
    } catch (error) {
      console.error('CSV出力エラー:', error);
      window.alert('CSV出力中にエラーが発生しました');
    }
  }

  /**
   * 産前産後休業のCSVを生成
   */
  private async generateCsvForMaternityLeave(
    alert: MaternityChildcareAlert,
    employee: Employee
  ): Promise<void> {
    // 事業所情報を取得
    let office: Office | null = null;
    if (employee.officeNumber) {
      const offices = await this.officeService.getAllOffices();
      office =
        offices.find((o) => o.officeNumber === employee.officeNumber) || null;
    }
    if (!office) {
      const offices = await this.officeService.getAllOffices();
      office = offices[0] || null;
    }

    // CSVデータを生成
    const csvRows: string[] = [];

    csvRows.push('産前産後休業取得者申出書');
    csvRows.push('');
    csvRows.push('産前産後休業取得者変更（終了）届');
    csvRows.push('');
    csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
    csvRows.push(`事業所番号,${office?.officeNumber || ''}`);
    csvRows.push(`事業所所在地,${office?.address || ''}`);
    csvRows.push(`事業所名称,${office?.officeName || '株式会社　伊藤忠商事'}`);
    csvRows.push(
      `事業主氏名,${office?.ownerName || '代表取締役社長　田中太郎'}`
    );
    csvRows.push(`電話番号,${office?.phoneNumber || '03-5432-6789'}`);
    csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
    csvRows.push(`個人番号,${employee.myNumber || ''}`);
    csvRows.push(`被保険者氏名,${employee.name || ''}`);
    csvRows.push(`被保険者氏名（カナ）,${employee.nameKana || ''}`);
    csvRows.push(`生年月日,${this.formatBirthDateToEra(employee.birthDate)}`);

    // 出産予定日
    const expectedDeliveryDate = (employee as any).expectedDeliveryDate;
    csvRows.push(
      `出産予定日,${
        expectedDeliveryDate
          ? this.formatJapaneseEraFromString(expectedDeliveryDate)
          : ''
      }`
    );

    // 産前産後休業開始日
    const maternityLeaveStart = employee.maternityLeaveStart;
    csvRows.push(
      `産前産後休業開始日,${
        maternityLeaveStart
          ? this.formatJapaneseEraFromString(maternityLeaveStart)
          : ''
      }`
    );

    // 産前産後休業終了予定日
    const maternityLeaveEndExpected = (employee as any)
      .maternityLeaveEndExpected;
    csvRows.push(
      `産前産後休業終了予定日,${
        maternityLeaveEndExpected
          ? this.formatJapaneseEraFromString(maternityLeaveEndExpected)
          : ''
      }`
    );

    // 出産日
    const actualDeliveryDate = (employee as any).actualDeliveryDate;
    csvRows.push(
      `出産日,${
        actualDeliveryDate
          ? this.formatJapaneseEraFromString(actualDeliveryDate)
          : ''
      }`
    );

    // 産前産後休業終了日
    const maternityLeaveEnd = employee.maternityLeaveEnd;
    csvRows.push(
      `産前産後休業終了日,${
        maternityLeaveEnd
          ? this.formatJapaneseEraFromString(maternityLeaveEnd)
          : ''
      }`
    );

    // CSVファイルをダウンロード
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    link.setAttribute(
      'download',
      `${alert.alertType}_${employee.name}_${year}年${month}月.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * 生年月日を和暦形式に変換（昭和30年1月2日形式）
   */
  private formatBirthDateToEra(birthDateStr: string): string {
    const date = new Date(birthDateStr);
    return this.formatJapaneseEra(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate()
    );
  }

  /**
   * 日付文字列（YYYY-MM-DD）を和暦形式に変換
   */
  private formatJapaneseEraFromString(dateStr: string): string {
    const date = new Date(dateStr);
    return this.formatJapaneseEra(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate()
    );
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
   * 傷病手当金支給申請書のCSVを生成
   */
  private async generateCsvForSickPayApplication(
    alert: MaternityChildcareAlert,
    employee: Employee
  ): Promise<void> {
    // 事業所情報を取得
    let office: Office | null = null;
    if (employee.officeNumber) {
      const offices = await this.officeService.getAllOffices();
      office =
        offices.find((o) => o.officeNumber === employee.officeNumber) || null;
    }
    if (!office) {
      const offices = await this.officeService.getAllOffices();
      office = offices[0] || null;
    }

    // 性別を取得
    const gender = this.getGender(employee);

    // CSVデータを生成
    const csvRows: string[] = [];

    csvRows.push(`被保険者氏名,${employee.name || ''}`);
    csvRows.push(`被保険者氏名（カナ）,${employee.nameKana || ''}`);
    csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
    csvRows.push(`生年月日,${this.formatBirthDateToEra(employee.birthDate)}`);
    csvRows.push(`性別,${gender}`);
    csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
    csvRows.push(`事業所番号,${office?.officeNumber || ''}`);
    csvRows.push(`事業所所在地,${office?.address || ''}`);
    csvRows.push(`事業所名称,${office?.officeName || '株式会社　伊藤忠商事'}`);
    csvRows.push(
      `事業主氏名,${office?.ownerName || '代表取締役社長　田中太郎'}`
    );
    csvRows.push(`電話番号,${office?.phoneNumber || '03-5432-6789'}`);

    // CSVファイルをダウンロード
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    link.setAttribute(
      'download',
      `傷病手当金支給申請書_${employee.name}_${year}年${month}月.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
   * 育児休業関係の事業主証明書のCSVを生成
   */
  private async generateCsvForChildcareEmployerCertificate(
    alert: MaternityChildcareAlert,
    employee: Employee
  ): Promise<void> {
    // 事業所情報を取得
    let office: Office | null = null;
    if (employee.officeNumber) {
      const offices = await this.officeService.getAllOffices();
      office =
        offices.find((o) => o.officeNumber === employee.officeNumber) || null;
    }
    if (!office) {
      const offices = await this.officeService.getAllOffices();
      office = offices[0] || null;
    }

    // 性別を取得
    const gender = this.getGender(employee);

    // CSVデータを生成
    const csvRows: string[] = [];

    csvRows.push('育児休業関係の事業主証明書');
    csvRows.push('');
    csvRows.push(`被保険者氏名,${employee.name || ''}`);
    csvRows.push(`被保険者氏名（カナ）,${employee.nameKana || ''}`);
    csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
    csvRows.push(`生年月日,${this.formatBirthDateToEra(employee.birthDate)}`);
    csvRows.push(`性別,${gender}`);
    csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
    csvRows.push(`事業所番号,${office?.officeNumber || ''}`);
    csvRows.push(`事業所所在地,${office?.address || ''}`);
    csvRows.push(`事業所名称,${office?.officeName || '株式会社　伊藤忠商事'}`);
    csvRows.push(
      `事業主氏名,${office?.ownerName || '代表取締役社長　田中太郎'}`
    );
    csvRows.push(`電話番号,${office?.phoneNumber || '03-5432-6789'}`);

    // CSVファイルをダウンロード
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    link.setAttribute(
      'download',
      `育児休業関係の事業主証明書_${employee.name}_${year}年${month}月.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * 出産手当金支給申請書のCSVを生成
   */
  private async generateCsvForMaternityAllowanceApplication(
    alert: MaternityChildcareAlert,
    employee: Employee
  ): Promise<void> {
    // 事業所情報を取得
    let office: Office | null = null;
    if (employee.officeNumber) {
      const offices = await this.officeService.getAllOffices();
      office =
        offices.find((o) => o.officeNumber === employee.officeNumber) || null;
    }
    if (!office) {
      const offices = await this.officeService.getAllOffices();
      office = offices[0] || null;
    }

    // 性別を取得
    const gender = this.getGender(employee);

    // CSVデータを生成
    const csvRows: string[] = [];

    csvRows.push('出産手当金支給申請書');
    csvRows.push('');
    csvRows.push(`被保険者氏名,${employee.name || ''}`);
    csvRows.push(`被保険者氏名（カナ）,${employee.nameKana || ''}`);
    csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
    csvRows.push(`生年月日,${this.formatBirthDateToEra(employee.birthDate)}`);
    csvRows.push(`性別,${gender}`);
    csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
    csvRows.push(`事業所番号,${office?.officeNumber || ''}`);
    csvRows.push(`事業所所在地,${office?.address || ''}`);
    csvRows.push(`事業所名称,${office?.officeName || '株式会社　伊藤忠商事'}`);
    csvRows.push(
      `事業主氏名,${office?.ownerName || '代表取締役社長　田中太郎'}`
    );
    csvRows.push(`電話番号,${office?.phoneNumber || '03-5432-6789'}`);

    // CSVファイルをダウンロード
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    link.setAttribute(
      'download',
      `出産手当金支給申請書_${employee.name}_${year}年${month}月.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * 育児休業等のCSVを生成
   */
  private async generateCsvForChildcareLeave(
    alert: MaternityChildcareAlert,
    employee: Employee
  ): Promise<void> {
    // 事業所情報を取得
    let office: Office | null = null;
    if (employee.officeNumber) {
      const offices = await this.officeService.getAllOffices();
      office =
        offices.find((o) => o.officeNumber === employee.officeNumber) || null;
    }
    if (!office) {
      const offices = await this.officeService.getAllOffices();
      office = offices[0] || null;
    }

    // 養育する子の情報を取得（Employeeモデルから取得、なければ家族情報から取得）
    let childName = (employee as any).childcareChildName || '';
    let childBirthDate = (employee as any).childcareChildBirthDate || '';

    // Employeeモデルに情報がない場合は、家族情報から取得
    if (!childName || !childBirthDate) {
      const familyMembers =
        await this.familyMemberService.getFamilyMembersByEmployeeId(
          employee.id
        );
      // 子の情報を取得（relationshipに「子」が含まれるもの）
      const children = familyMembers.filter((member) => {
        const relationship = (member.relationship || '').toLowerCase();
        return relationship.includes('子') || relationship.includes('child');
      });

      // 最初の子の情報を使用（複数の子がいる場合は最初の1人）
      const child = children.length > 0 ? children[0] : null;
      if (child) {
        childName = childName || child.name || '';
        childBirthDate = childBirthDate || child.birthDate || '';
      }
    }

    // CSVデータを生成
    const csvRows: string[] = [];

    csvRows.push('育児休業等取得者申出書(新規・延長)/終了届');
    csvRows.push('');
    csvRows.push(`事業所整理記号,${office?.officeCode || ''}`);
    csvRows.push(`事業所番号,${office?.officeNumber || ''}`);
    csvRows.push(`事業所所在地,${office?.address || ''}`);
    csvRows.push(`事業所名称,${office?.officeName || '株式会社　伊藤忠商事'}`);
    csvRows.push(
      `事業主氏名,${office?.ownerName || '代表取締役社長　田中太郎'}`
    );
    csvRows.push(`電話番号,${office?.phoneNumber || '03-5432-6789'}`);
    csvRows.push(`被保険者整理番号,${employee.insuredNumber || ''}`);
    csvRows.push(`個人番号,${employee.myNumber || ''}`);
    csvRows.push(`被保険者氏名,${employee.name || ''}`);
    csvRows.push(`被保険者氏名（カナ）,${employee.nameKana || ''}`);
    csvRows.push(`生年月日,${this.formatBirthDateToEra(employee.birthDate)}`);
    csvRows.push(`養育する子の氏名,${childName}`);
    csvRows.push(
      `養育する子の生年月日,${
        childBirthDate ? this.formatJapaneseEraFromString(childBirthDate) : ''
      }`
    );

    // 育児休業等開始日
    const childcareLeaveStart = employee.childcareLeaveStart;
    csvRows.push(
      `育児休業等開始日,${
        childcareLeaveStart
          ? this.formatJapaneseEraFromString(childcareLeaveStart)
          : ''
      }`
    );

    // 育児休業等終了予定日（フィールドが存在する場合）
    const childcareLeaveEndExpected = (employee as any)
      .childcareLeaveEndExpected;
    csvRows.push(
      `育児休業等終了予定日,${
        childcareLeaveEndExpected
          ? this.formatJapaneseEraFromString(childcareLeaveEndExpected)
          : ''
      }`
    );

    // 育児休業等終了日
    const childcareLeaveEnd = employee.childcareLeaveEnd;
    csvRows.push(
      `育児休業等終了日,${
        childcareLeaveEnd
          ? this.formatJapaneseEraFromString(childcareLeaveEnd)
          : ''
      }`
    );

    // CSVファイルをダウンロード
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    link.setAttribute(
      'download',
      `${alert.alertType}_${employee.name}_${year}年${month}月.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
