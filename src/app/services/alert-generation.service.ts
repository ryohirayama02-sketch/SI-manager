import { Injectable } from '@angular/core';
import { SuijiService } from './suiji.service';
import { MonthlySalaryService } from './monthly-salary.service';
import { NotificationCalculationService } from './notification-calculation.service';
import { BonusService } from './bonus.service';
import { SettingsService } from './settings.service';
import { EmployeeChangeHistoryService } from './employee-change-history.service';
import { QualificationChangeAlertService } from './qualification-change-alert.service';
import { NotificationFormatService } from './notification-format.service';
import { OfficeService } from './office.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { SuijiKouhoResultWithDiff } from '../features/alerts-dashboard/tabs/alert-suiji-tab/alert-suiji-tab.component';
import {
  AgeAlert,
  QualificationChangeAlert,
} from '../features/alerts-dashboard/tabs/alert-age-tab/alert-age-tab.component';
import { MaternityChildcareAlert } from '../features/alerts-dashboard/tabs/alert-leave-tab/alert-leave-tab.component';
import { BonusReportAlert } from '../features/alerts-dashboard/tabs/alert-bonus-tab/alert-bonus-tab.component';
import { NotificationDecisionResult } from './notification-decision.service';
import {
  getJSTDate,
  normalizeDate,
  calculateSubmitDeadline,
  calculateDaysUntilDeadline,
  calculateAgeReachDate,
  calculateAgeAlertStartDate,
} from '../utils/alerts-helper';

export interface AlertItem {
  id: string;
  employeeName: string;
  alertType: string;
  comment: string;
  targetMonth: string;
}

@Injectable({
  providedIn: 'root',
})
export class AlertGenerationService {
  constructor(
    private suijiService: SuijiService,
    private monthlySalaryService: MonthlySalaryService,
    private notificationCalculationService: NotificationCalculationService,
    private bonusService: BonusService,
    private settingsService: SettingsService,
    private employeeChangeHistoryService: EmployeeChangeHistoryService,
    private qualificationChangeAlertService: QualificationChangeAlertService,
    private notificationFormatService: NotificationFormatService,
    private officeService: OfficeService
  ) {}

  async generateSuijiAlerts(
    employees: Employee[],
    salariesByYear: {
      [year: number]: {
        [key: string]: { total: number; fixed: number; variable: number };
      };
    },
    getSalaryKey: (employeeId: string, month: number) => string,
    getPrevMonthDiff: (
      employeeId: string,
      month: number,
      year: number
    ) => number | null,
    getSuijiAlertId: (alert: SuijiKouhoResultWithDiff) => string
  ): Promise<SuijiKouhoResultWithDiff[]> {
    const years = [2023, 2024, 2025, 2026];
    const loadedAlerts = await this.suijiService.loadAllAlerts(years);

    const validEmployeeIds = new Set(employees.map((e) => e.id));
    return loadedAlerts
      .filter((alert: any) => validEmployeeIds.has(alert.employeeId))
      .map((alert: any) => ({
        ...alert,
        diffPrev: getPrevMonthDiff(
          alert.employeeId,
          alert.changeMonth,
          alert.year || 2025
        ),
        id: alert.id || getSuijiAlertId(alert),
      }));
  }

  async generateNotificationAlerts(
    employees: Employee[],
    getNotificationTypeLabel: (type: 'teiji' | 'suiji' | 'bonus') => string
  ): Promise<{
    gradeTable: any[];
    salaryDataByEmployeeId: { [employeeId: string]: any };
    bonusesByEmployeeId: { [employeeId: string]: Bonus[] };
    notificationsByEmployee: {
      [employeeId: string]: NotificationDecisionResult[];
    };
    notificationAlerts: AlertItem[];
  }> {
    const currentYear = getJSTDate().getFullYear();
    const gradeTable = await this.settingsService.getStandardTable(currentYear);

    const salaryDataByEmployeeId: { [employeeId: string]: any } = {};
    for (const emp of employees) {
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(
        emp.id,
        currentYear
      );
      salaryDataByEmployeeId[emp.id] = salaryData;
    }

    const bonuses = await this.bonusService.loadBonus(currentYear);
    const bonusesByEmployeeId: { [employeeId: string]: Bonus[] } = {};
    for (const bonus of bonuses) {
      if (!bonusesByEmployeeId[bonus.employeeId]) {
        bonusesByEmployeeId[bonus.employeeId] = [];
      }
      bonusesByEmployeeId[bonus.employeeId].push(bonus);
    }

    const notificationsByEmployee =
      await this.notificationCalculationService.calculateNotificationsBatch(
        employees,
        currentYear,
        gradeTable,
        bonusesByEmployeeId,
        salaryDataByEmployeeId
      );

    const notificationAlerts: AlertItem[] = [];
    let alertId = 1;
    for (const emp of employees) {
      const notifications = notificationsByEmployee[emp.id] || [];
      for (const notification of notifications) {
        if (notification.required) {
          notificationAlerts.push({
            id: `alert-${alertId++}`,
            employeeName: emp.name,
            alertType: getNotificationTypeLabel(notification.type),
            comment: notification.reasons.join(' / '),
            targetMonth: notification.submitUntil
              ? `${currentYear}年${
                  new Date(notification.submitUntil).getMonth() + 1
                }月`
              : `${currentYear}年`,
          });
        }
      }
    }

    return {
      gradeTable,
      salaryDataByEmployeeId,
      bonusesByEmployeeId,
      notificationsByEmployee,
      notificationAlerts,
    };
  }

  async generateAgeAlerts(employees: Employee[]): Promise<AgeAlert[]> {
    const ageAlerts: AgeAlert[] = [];
    const today = normalizeDate(getJSTDate());

    for (const emp of employees) {
      if (!emp.birthDate) continue;

      const birthDate = normalizeDate(new Date(emp.birthDate));

      const age70Date = calculateAgeReachDate(birthDate, 70);
      const age70AlertStartDate = calculateAgeAlertStartDate(age70Date);

      if (today >= age70AlertStartDate && today < age70Date) {
        const submitDeadline = calculateSubmitDeadline(age70Date);
        const daysUntilDeadline = calculateDaysUntilDeadline(
          submitDeadline,
          today
        );

        ageAlerts.push({
          id: `age70_${emp.id}`,
          employeeId: emp.id,
          employeeName: emp.name,
          alertType: '70歳到達',
          notificationName: '厚生年金 資格喪失届、70歳以上被用者該当届',
          birthDate: emp.birthDate,
          reachDate: age70Date,
          submitDeadline: submitDeadline,
          daysUntilDeadline: daysUntilDeadline,
        });
      }

      const age75Date = calculateAgeReachDate(birthDate, 75);
      const age75AlertStartDate = calculateAgeAlertStartDate(age75Date);

      if (today >= age75AlertStartDate && today < age75Date) {
        const submitDeadline = calculateSubmitDeadline(age75Date);
        const daysUntilDeadline = calculateDaysUntilDeadline(
          submitDeadline,
          today
        );

        ageAlerts.push({
          id: `age75_${emp.id}`,
          employeeId: emp.id,
          employeeName: emp.name,
          alertType: '75歳到達',
          notificationName: '健保 資格喪失届',
          birthDate: emp.birthDate,
          reachDate: age75Date,
          submitDeadline: submitDeadline,
          daysUntilDeadline: daysUntilDeadline,
        });
      }
    }

    ageAlerts.sort(
      (a, b) => a.submitDeadline.getTime() - b.submitDeadline.getTime()
    );
    return ageAlerts;
  }

  async generateQualificationChangeAlerts(
    employees: Employee[]
  ): Promise<QualificationChangeAlert[]> {
    const qualificationChangeAlerts: QualificationChangeAlert[] = [];
    const today = normalizeDate(getJSTDate());

    try {
      const deletedAlertIds =
        await this.qualificationChangeAlertService.getDeletedAlertIds();
      console.log(
        `[alerts-dashboard] 削除済みアラートID数: ${deletedAlertIds.size}`
      );

      const changeHistories =
        await this.employeeChangeHistoryService.getAllRecentChangeHistory(5);
      console.log(
        `[alerts-dashboard] 取得した変更履歴数: ${changeHistories.length}`
      );

      for (const history of changeHistories) {
        const alertId =
          history.id ||
          `${history.employeeId}_${history.changeType}_${history.changeDate}`;
        console.log(
          `[alerts-dashboard] 変更履歴を処理: ID=${alertId}, 従業員ID=${history.employeeId}, 変更種別=${history.changeType}, 変更日=${history.changeDate}`
        );

        if (deletedAlertIds.has(alertId)) {
          console.log(
            `[alerts-dashboard] 削除済みアラートのためスキップ: ${alertId}`
          );
          continue;
        }

        const changeDate = normalizeDate(new Date(history.changeDate));
        const submitDeadline = calculateSubmitDeadline(changeDate);
        const daysUntilDeadline = calculateDaysUntilDeadline(
          submitDeadline,
          today
        );

        const employee = employees.find((emp) => emp.id === history.employeeId);
        const employeeName = employee?.name || '不明';

        let details = '';
        if (history.changeType === '氏名変更') {
          details = `${history.oldValue} → ${history.newValue}`;
        } else if (history.changeType === '住所変更') {
          details = `${history.oldValue} → ${history.newValue}`;
        } else if (history.changeType === '生年月日訂正') {
          details = `${history.oldValue} → ${history.newValue}`;
        } else if (history.changeType === '性別変更') {
          const oldValueDisplay = this.formatGenderValue(history.oldValue);
          const newValueDisplay = this.formatGenderValue(history.newValue);
          details = `${oldValueDisplay} → ${newValueDisplay}`;
        } else if (history.changeType === '所属事業所変更') {
          // 事業所番号の場合は事業所名を取得し、都道府県を漢字に変換
          const oldValueDisplay = await this.formatOfficeValue(
            history.oldValue
          );
          const newValueDisplay = await this.formatOfficeValue(
            history.newValue
          );
          details = `${oldValueDisplay} → ${newValueDisplay}`;
        } else if (history.changeType === '適用区分変更') {
          const oldValueDisplay = this.formatApplicableCategoryValue(
            history.oldValue
          );
          const newValueDisplay = this.formatApplicableCategoryValue(
            history.newValue
          );
          details = `${oldValueDisplay} → ${newValueDisplay}`;
        }

        const existingAlert = qualificationChangeAlerts.find(
          (alert) =>
            alert.id === alertId ||
            (alert.employeeId === history.employeeId &&
              alert.changeType === history.changeType &&
              alert.changeDate.getTime() === changeDate.getTime())
        );

        if (!existingAlert) {
          console.log(
            `[alerts-dashboard] 新しいアラートを追加: ${alertId}, 従業員=${employeeName}`
          );
          qualificationChangeAlerts.push({
            id: alertId,
            employeeId: history.employeeId,
            employeeName: employeeName,
            changeType: history.changeType,
            notificationNames: history.notificationNames,
            changeDate: changeDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: details,
          });
        } else {
          console.log(
            `[alerts-dashboard] 既存のアラートのためスキップ: ${alertId}`
          );
        }
      }

      qualificationChangeAlerts.sort((a, b) => {
        return b.changeDate.getTime() - a.changeDate.getTime();
      });
    } catch (error) {
      console.error(
        '[alerts-dashboard] loadQualificationChangeAlertsエラー:',
        error
      );
    }
    return qualificationChangeAlerts;
  }

  async generateMaternityChildcareAlerts(
    employees: Employee[],
    formatDate: (date: Date) => string
  ): Promise<MaternityChildcareAlert[]> {
    const maternityChildcareAlerts: MaternityChildcareAlert[] = [];
    const today = normalizeDate(getJSTDate());

    try {
      for (const emp of employees) {
        // 申請書記入依頼の日時フィールドはEmployee仕様から削除されたため、
        // ここでの関連アラート生成はスキップする。

        if (emp.maternityLeaveStart) {
          const startDate = normalizeDate(new Date(emp.maternityLeaveStart));
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          maternityChildcareAlerts.push({
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

        if (emp.maternityLeaveEnd) {
          const endDate = normalizeDate(new Date(emp.maternityLeaveEnd));
          const startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() + 1);
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          maternityChildcareAlerts.push({
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

        if (emp.childcareLeaveStart) {
          const startDate = normalizeDate(new Date(emp.childcareLeaveStart));
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          maternityChildcareAlerts.push({
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

        if (emp.childcareLeaveEnd) {
          const endDate = normalizeDate(new Date(emp.childcareLeaveEnd));
          const startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() + 1);
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          maternityChildcareAlerts.push({
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

      maternityChildcareAlerts.sort((a, b) => {
        return b.startDate.getTime() - a.startDate.getTime();
      });
    } catch (error) {
      console.error(
        '[alerts-dashboard] loadMaternityChildcareAlertsエラー:',
        error
      );
    }
    return maternityChildcareAlerts;
  }

  async generateBonusReportAlerts(
    employees: Employee[]
  ): Promise<BonusReportAlert[]> {
    const bonusReportAlerts: BonusReportAlert[] = [];

    const currentYear = getJSTDate().getFullYear();
    const today = normalizeDate(getJSTDate());

    for (const emp of employees) {
      const bonuses = await this.bonusService.loadBonus(currentYear, emp.id);

      for (const bonus of bonuses) {
        if (!bonus.amount || bonus.amount === 0) {
          continue;
        }

        if (!bonus.payDate) {
          continue;
        }

        const payDate = normalizeDate(new Date(bonus.payDate));
        const submitDeadline = calculateSubmitDeadline(payDate);
        submitDeadline.setHours(23, 59, 59, 999);
        const daysUntilDeadline = calculateDaysUntilDeadline(
          submitDeadline,
          today
        );

        const alertId = `${bonus.employeeId}_${bonus.payDate}`;

        bonusReportAlerts.push({
          id: alertId,
          employeeId: bonus.employeeId,
          employeeName: emp.name,
          bonusAmount: bonus.amount,
          payDate: bonus.payDate,
          submitDeadline: submitDeadline,
          daysUntilDeadline: daysUntilDeadline,
        });
      }
    }

    bonusReportAlerts.sort((a, b) => {
      return a.submitDeadline.getTime() - b.submitDeadline.getTime();
    });
    return bonusReportAlerts;
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
   * 事業所番号を事業所名に変換（都道府県も漢字に変換）
   */
  private async formatOfficeValue(
    value: string | null | undefined
  ): Promise<string> {
    if (!value) return '';

    // 値が「事業所番号 (都道府県)」の形式かどうかをチェック
    const match = value.match(/^(\d+)\s*\(([^)]+)\)$/);
    if (match) {
      const officeNumber = match[1];
      const prefecture = match[2];
      const prefectureKanji = this.formatPrefectureValue(prefecture);

      // 事業所番号から事業所名を取得
      try {
        const offices = await this.officeService.getAllOffices();
        const office = offices.find((o) => o.officeNumber === officeNumber);
        if (office && office.officeName) {
          return `${office.officeName} (${prefectureKanji})`;
        }
      } catch (error) {
        console.error('事業所情報の取得エラー:', error);
      }

      // 事業所名が取得できない場合は、事業所番号と都道府県（漢字）を返す
      return `${officeNumber} (${prefectureKanji})`;
    }

    // 事業所番号のみの場合
    try {
      const offices = await this.officeService.getAllOffices();
      const office = offices.find((o) => o.officeNumber === value);
      if (office && office.officeName) {
        return office.officeName;
      }
    } catch (error) {
      console.error('事業所情報の取得エラー:', error);
    }
    return value;
  }

  /**
   * 都道府県のローマ字を漢字に変換
   */
  private formatPrefectureValue(value: string | null | undefined): string {
    if (!value) return '';
    const prefectureMap: { [key: string]: string } = {
      tokyo: '東京都',
      kanagawa: '神奈川県',
      saitama: '埼玉県',
      chiba: '千葉県',
      osaka: '大阪府',
      kyoto: '京都府',
      hyogo: '兵庫県',
      aichi: '愛知県',
      fukuoka: '福岡県',
      hokkaido: '北海道',
      miyagi: '宮城県',
      hiroshima: '広島県',
      okinawa: '沖縄県',
      shizuoka: '静岡県',
      ibaraki: '茨城県',
      tochigi: '栃木県',
      gunma: '群馬県',
      niigata: '新潟県',
      toyama: '富山県',
      ishikawa: '石川県',
      fukui: '福井県',
      yamanashi: '山梨県',
      nagano: '長野県',
      gifu: '岐阜県',
      mie: '三重県',
      shiga: '滋賀県',
      nara: '奈良県',
      wakayama: '和歌山県',
      tottori: '鳥取県',
      shimane: '島根県',
      okayama: '岡山県',
      yamaguchi: '山口県',
      tokushima: '徳島県',
      kagawa: '香川県',
      ehime: '愛媛県',
      kochi: '高知県',
      saga: '佐賀県',
      nagasaki: '長崎県',
      kumamoto: '熊本県',
      oita: '大分県',
      miyazaki: '宮崎県',
      kagoshima: '鹿児島県',
    };
    return prefectureMap[value.toLowerCase()] || value;
  }

  /**
   * 適用区分のコード値を表示用の文字に変換
   */
  private formatApplicableCategoryValue(
    value: string | null | undefined
  ): string {
    if (!value) return '';
    const categoryMap: { [key: string]: string } = {
      'full-time': 'フルタイム',
      'part-time': 'パートタイム',
      'short-time': '短時間労働者',
      フルタイム: 'フルタイム',
      パートタイム: 'パートタイム',
      短時間労働者: '短時間労働者',
      '30hours-or-more': '30時間以上',
      '20-30hours': '20-30時間',
      'less-than-20hours': '20時間未満',
    };
    return categoryMap[value] || value;
  }
}
