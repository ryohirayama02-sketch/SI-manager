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
import { AgeAlert, QualificationChangeAlert } from '../features/alerts-dashboard/tabs/alert-age-tab/alert-age-tab.component';
import { MaternityChildcareAlert } from '../features/alerts-dashboard/tabs/alert-leave-tab/alert-leave-tab.component';
import { BonusReportAlert } from '../features/alerts-dashboard/tabs/alert-bonus-tab/alert-bonus-tab.component';
import { NotificationDecisionResult } from './notification-decision.service';
import { getJSTDate, normalizeDate, calculateSubmitDeadline, calculateDaysUntilDeadline, calculateAgeReachDate, calculateAgeAlertStartDate } from '../utils/alerts-helper';

export interface AlertItem {
  id: string;
  employeeName: string;
  alertType: string;
  comment: string;
  targetMonth: string;
}

@Injectable({
  providedIn: 'root'
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
    salariesByYear: { [year: number]: { [key: string]: { total: number; fixed: number; variable: number } } },
    getSalaryKey: (employeeId: string, month: number) => string,
    getPrevMonthDiff: (employeeId: string, month: number, year: number) => number | null,
    getSuijiAlertId: (alert: SuijiKouhoResultWithDiff) => string
  ): Promise<SuijiKouhoResultWithDiff[]> {
    const years = [2023, 2024, 2025, 2026];
    const loadedAlerts = await this.suijiService.loadAllAlerts(years);
    
    const validEmployeeIds = new Set(employees.map(e => e.id));
    return loadedAlerts
      .filter((alert: any) => validEmployeeIds.has(alert.employeeId))
      .map((alert: any) => ({
        ...alert,
        diffPrev: getPrevMonthDiff(alert.employeeId, alert.changeMonth, alert.year || 2025),
        id: alert.id || getSuijiAlertId(alert)
      }));
  }

  async generateNotificationAlerts(
    employees: Employee[],
    getNotificationTypeLabel: (type: 'teiji' | 'suiji' | 'bonus') => string
  ): Promise<{
    gradeTable: any[];
    salaryDataByEmployeeId: { [employeeId: string]: any };
    bonusesByEmployeeId: { [employeeId: string]: Bonus[] };
    notificationsByEmployee: { [employeeId: string]: NotificationDecisionResult[] };
    notificationAlerts: AlertItem[];
  }> {
    const currentYear = getJSTDate().getFullYear();
    const gradeTable = await this.settingsService.getStandardTable(currentYear);
    
    const salaryDataByEmployeeId: { [employeeId: string]: any } = {};
    for (const emp of employees) {
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(emp.id, currentYear);
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
    
    const notificationsByEmployee = await this.notificationCalculationService.calculateNotificationsBatch(
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
              ? `${currentYear}年${new Date(notification.submitUntil).getMonth() + 1}月`
              : `${currentYear}年`
          });
        }
      }
    }

    return {
      gradeTable,
      salaryDataByEmployeeId,
      bonusesByEmployeeId,
      notificationsByEmployee,
      notificationAlerts
    };
  }

  async generateAgeAlerts(
    employees: Employee[]
  ): Promise<AgeAlert[]> {
    const ageAlerts: AgeAlert[] = [];
    const today = normalizeDate(getJSTDate());

    for (const emp of employees) {
      if (!emp.birthDate) continue;

      const birthDate = normalizeDate(new Date(emp.birthDate));
      
      const age70Date = calculateAgeReachDate(birthDate, 70);
      const age70AlertStartDate = calculateAgeAlertStartDate(age70Date);
      
      if (today >= age70AlertStartDate && today < age70Date) {
        const submitDeadline = calculateSubmitDeadline(age70Date);
        const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
        
        ageAlerts.push({
          id: `age70_${emp.id}`,
          employeeId: emp.id,
          employeeName: emp.name,
          alertType: '70歳到達',
          notificationName: '厚生年金 資格喪失届',
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
        const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
        
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

    ageAlerts.sort((a, b) => a.submitDeadline.getTime() - b.submitDeadline.getTime());
    return ageAlerts;
  }

  async generateQualificationChangeAlerts(
    employees: Employee[]
  ): Promise<QualificationChangeAlert[]> {
    const qualificationChangeAlerts: QualificationChangeAlert[] = [];
    const today = normalizeDate(getJSTDate());

    try {
      const deletedAlertIds = await this.qualificationChangeAlertService.getDeletedAlertIds();
      console.log(`[alerts-dashboard] 削除済みアラートID数: ${deletedAlertIds.size}`);

      const changeHistories = await this.employeeChangeHistoryService.getAllRecentChangeHistory(5);
      console.log(`[alerts-dashboard] 取得した変更履歴数: ${changeHistories.length}`);

      for (const history of changeHistories) {
        const alertId = history.id || `${history.employeeId}_${history.changeType}_${history.changeDate}`;
        console.log(`[alerts-dashboard] 変更履歴を処理: ID=${alertId}, 従業員ID=${history.employeeId}, 変更種別=${history.changeType}, 変更日=${history.changeDate}`);
        
        if (deletedAlertIds.has(alertId)) {
          console.log(`[alerts-dashboard] 削除済みアラートのためスキップ: ${alertId}`);
          continue;
        }

        const changeDate = normalizeDate(new Date(history.changeDate));
        const submitDeadline = calculateSubmitDeadline(changeDate);
        const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);

        const employee = employees.find(emp => emp.id === history.employeeId);
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
          // 事業所番号の場合は事業所名を取得
          const oldValueDisplay = await this.formatOfficeValue(history.oldValue);
          const newValueDisplay = await this.formatOfficeValue(history.newValue);
          details = `${oldValueDisplay} → ${newValueDisplay}`;
        } else if (history.changeType === '適用区分変更') {
          const oldValueDisplay = this.formatApplicableCategoryValue(history.oldValue);
          const newValueDisplay = this.formatApplicableCategoryValue(history.newValue);
          details = `${oldValueDisplay} → ${newValueDisplay}`;
        }

        const existingAlert = qualificationChangeAlerts.find(
          alert => alert.id === alertId || 
          (alert.employeeId === history.employeeId && 
           alert.changeType === history.changeType && 
           alert.changeDate.getTime() === changeDate.getTime())
        );
        
        if (!existingAlert) {
          console.log(`[alerts-dashboard] 新しいアラートを追加: ${alertId}, 従業員=${employeeName}`);
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
          console.log(`[alerts-dashboard] 既存のアラートのためスキップ: ${alertId}`);
        }
      }

      qualificationChangeAlerts.sort((a, b) => {
        return b.changeDate.getTime() - a.changeDate.getTime();
      });
    } catch (error) {
      console.error('[alerts-dashboard] loadQualificationChangeAlertsエラー:', error);
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
      const currentYear = today.getFullYear();
      const allBonuses = await this.bonusService.loadBonus(currentYear);

      for (const emp of employees) {
        // 傷病手当金支給申請書の記入依頼アラート
        if (emp.sickPayApplicationRequest && emp.sickPayApplicationRequestDate) {
          const requestDate = normalizeDate(new Date(emp.sickPayApplicationRequestDate));
          const submitDeadline = new Date(requestDate);
          submitDeadline.setDate(submitDeadline.getDate() + 7); // 1週間後
          const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
          
          maternityChildcareAlerts.push({
            id: `sick_pay_application_${emp.id}_${emp.sickPayApplicationRequestDate}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '傷病手当金支給申請書の記入依頼',
            notificationName: '傷病手当金支給申請書の記入依頼',
            startDate: requestDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: '', // 一旦未記入
          });
        }

        // 育児休業関係の事業主証明書の記入依頼アラート
        if (emp.childcareEmployerCertificateRequest && emp.childcareEmployerCertificateRequestDate) {
          const requestDate = normalizeDate(new Date(emp.childcareEmployerCertificateRequestDate));
          const submitDeadline = new Date(requestDate);
          submitDeadline.setDate(submitDeadline.getDate() + 7); // 1週間後
          const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
          
          maternityChildcareAlerts.push({
            id: `childcare_employer_certificate_${emp.id}_${emp.childcareEmployerCertificateRequestDate}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '育児休業関係の事業主証明書の記入依頼',
            notificationName: '育児休業関係の事業主証明書の記入依頼',
            startDate: requestDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: '', // 一旦未記入
          });
        }

        // 出産手当金支給申請書の記入依頼アラート
        if (emp.maternityAllowanceApplicationRequest && emp.maternityAllowanceApplicationRequestDate) {
          const requestDate = normalizeDate(new Date(emp.maternityAllowanceApplicationRequestDate));
          const submitDeadline = new Date(requestDate);
          submitDeadline.setDate(submitDeadline.getDate() + 7); // 1週間後
          const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
          
          maternityChildcareAlerts.push({
            id: `maternity_allowance_application_${emp.id}_${emp.maternityAllowanceApplicationRequestDate}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '出産手当金支給申請書の記入依頼',
            notificationName: '出産手当金支給申請書の記入依頼',
            startDate: requestDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: '', // 一旦未記入
          });
        }

        // 出産育児一時金支給申請書の記入依頼アラート
        if (emp.childbirthAllowanceApplicationRequest && emp.childbirthAllowanceApplicationRequestDate) {
          const requestDate = normalizeDate(new Date(emp.childbirthAllowanceApplicationRequestDate));
          const submitDeadline = new Date(requestDate);
          submitDeadline.setDate(submitDeadline.getDate() + 7); // 1週間後
          const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
          
          maternityChildcareAlerts.push({
            id: `childbirth_allowance_application_${emp.id}_${emp.childbirthAllowanceApplicationRequestDate}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '出産育児一時金支給申請書の記入依頼',
            notificationName: '出産育児一時金支給申請書の記入依頼',
            startDate: requestDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: '', // 一旦未記入
          });
        }
        if (emp.maternityLeaveStart) {
          const startDate = normalizeDate(new Date(emp.maternityLeaveStart));
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
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
          const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
          maternityChildcareAlerts.push({
            id: `maternity_end_${emp.id}_${emp.maternityLeaveEnd}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '産前産後休業終了届',
            notificationName: '産前産後休業終了届',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `産休終了日: ${formatDate(endDate)}`,
          });
        }

        if (emp.childcareLeaveStart) {
          const startDate = normalizeDate(new Date(emp.childcareLeaveStart));
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
          maternityChildcareAlerts.push({
            id: `childcare_start_${emp.id}_${emp.childcareLeaveStart}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '育児休業等取得者申出書（保険料免除開始）',
            notificationName: '育児休業等取得者申出書（保険料免除開始）',
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
          const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
          maternityChildcareAlerts.push({
            id: `childcare_end_${emp.id}_${emp.childcareLeaveEnd}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '育児休業等終了届（免除終了）',
            notificationName: '育児休業等終了届（免除終了）',
            startDate: startDate,
            submitDeadline: submitDeadline,
            daysUntilDeadline: daysUntilDeadline,
            details: `育休終了日: ${formatDate(endDate)}`,
          });
        }

        if (!emp.childcareLivingTogether) {
          const employeeBonuses = allBonuses.filter(b => b.employeeId === emp.id && b.amount > 0);
          
          for (const bonus of employeeBonuses) {
            if (bonus.payDate) {
              const payDate = normalizeDate(new Date(bonus.payDate));
              const submitDeadline = calculateSubmitDeadline(payDate);
              const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
              maternityChildcareAlerts.push({
                id: `childcare_bonus_${emp.id}_${bonus.id}`,
                employeeId: emp.id,
                employeeName: emp.name,
                alertType: '育児休業等取得者申出書（賞与用）',
                notificationName: '育児休業等取得者申出書（賞与用）',
                startDate: payDate,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
                details: `賞与支給日: ${formatDate(payDate)}, 賞与額: ${bonus.amount.toLocaleString('ja-JP')}円`,
              });
            }
          }
        }
      }

      maternityChildcareAlerts.sort((a, b) => {
        return b.startDate.getTime() - a.startDate.getTime();
      });
    } catch (error) {
      console.error('[alerts-dashboard] loadMaternityChildcareAlertsエラー:', error);
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
        const daysUntilDeadline = calculateDaysUntilDeadline(submitDeadline, today);
        
        const alertId = `${bonus.employeeId}_${bonus.payDate}`;
        
        bonusReportAlerts.push({
          id: alertId,
          employeeId: bonus.employeeId,
          employeeName: emp.name,
          bonusAmount: bonus.amount,
          payDate: bonus.payDate,
          submitDeadline: submitDeadline,
          daysUntilDeadline: daysUntilDeadline
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
   * 事業所番号を事業所名に変換
   */
  private async formatOfficeValue(value: string | null | undefined): Promise<string> {
    if (!value) return '';
    // 事業所番号の場合は事業所名を取得
    try {
      const offices = await this.officeService.getAllOffices();
      const office = offices.find(o => o.officeNumber === value);
      if (office && office.officeName) {
        return office.officeName;
      }
    } catch (error) {
      console.error('事業所情報の取得エラー:', error);
    }
    return value;
  }

  /**
   * 適用区分のコード値を表示用の文字に変換
   */
  private formatApplicableCategoryValue(value: string | null | undefined): string {
    if (!value) return '';
    const categoryMap: { [key: string]: string } = {
      'full-time': 'フルタイム',
      'part-time': 'パートタイム',
      'short-time': '短時間労働者',
      'フルタイム': 'フルタイム',
      'パートタイム': 'パートタイム',
      '短時間労働者': '短時間労働者',
      '30hours-or-more': '30時間以上',
      '20-30hours': '20-30時間',
      'less-than-20hours': '20時間未満',
    };
    return categoryMap[value] || value;
  }
}


