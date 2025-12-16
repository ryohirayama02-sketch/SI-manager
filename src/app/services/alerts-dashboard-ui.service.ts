import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { SuijiKouhoResultWithDiff } from '../features/alerts-dashboard/tabs/alert-suiji-tab/alert-suiji-tab.component';
import { AgeAlert, QualificationChangeAlert } from '../features/alerts-dashboard/tabs/alert-age-tab/alert-age-tab.component';
import { MaternityChildcareAlert } from '../features/alerts-dashboard/tabs/alert-leave-tab/alert-leave-tab.component';
import { BonusReportAlert } from '../features/alerts-dashboard/tabs/alert-bonus-tab/alert-bonus-tab.component';
import { AlertGenerationService, AlertItem } from './alert-generation.service';
import { AlertsDashboardStateService } from './alerts-dashboard-state.service';

@Injectable({
  providedIn: 'root'
})
export class AlertsDashboardUiService {
  constructor(
    private alertGenerationService: AlertGenerationService,
    private state: AlertsDashboardStateService
  ) {}


  /**
   * 全アラートを読み込む
   */
  async loadAlertsAll(
    loadSuijiAlerts: () => Promise<void>,
    loadNotificationAlerts: () => Promise<void>,
    loadAgeAlerts: () => Promise<void>,
    loadQualificationChangeAlerts: () => Promise<void>,
    loadMaternityChildcareAlerts: () => Promise<void>,
    loadBonusReportAlerts: () => Promise<void>
  ): Promise<void> {
    try {
      await loadSuijiAlerts();
      this.state.updateScheduleData();
    } catch (error) {
      console.error('[alerts-dashboard-ui] loadSuijiAlertsエラー:', error);
    }
    
    try {
      await loadNotificationAlerts();
      this.state.updateScheduleData();
    } catch (error) {
      console.error('[alerts-dashboard-ui] loadNotificationAlertsエラー:', error);
    }
    
    try {
      await loadAgeAlerts();
      this.state.updateScheduleData();
    } catch (error) {
      console.error('[alerts-dashboard-ui] loadAgeAlertsエラー:', error);
    }
    
    try {
      await loadQualificationChangeAlerts();
      this.state.updateScheduleData();
    } catch (error) {
      console.error('[alerts-dashboard-ui] loadQualificationChangeAlertsエラー:', error);
    }
    
    try {
      await loadMaternityChildcareAlerts();
      this.state.updateScheduleData();
    } catch (error) {
      console.error('[alerts-dashboard-ui] loadMaternityChildcareAlertsエラー:', error);
    }
    
    try {
      await loadBonusReportAlerts();
      this.state.updateScheduleData();
    } catch (error) {
      console.error('[alerts-dashboard-ui] loadBonusReportAlertsエラー:', error);
    }
  }

  async loadSuijiAlerts(
    employees: Employee[],
    salariesByYear: { [year: number]: { [key: string]: { total: number; fixed: number; variable: number } } },
    getSalaryKey: (employeeId: string, month: number) => string,
    getPrevMonthDiff: (employeeId: string, month: number, year: number) => number | null,
    getSuijiAlertId: (alert: SuijiKouhoResultWithDiff) => string
  ): Promise<SuijiKouhoResultWithDiff[]> {
    return await this.alertGenerationService.generateSuijiAlerts(
      employees,
      salariesByYear,
      getSalaryKey,
      getPrevMonthDiff,
      getSuijiAlertId
    );
  }

  async loadNotificationAlerts(
    employees: Employee[],
    getNotificationTypeLabel: (type: 'teiji' | 'suiji' | 'bonus') => string
  ): Promise<{
    gradeTable: any[];
    salaryDataByEmployeeId: { [employeeId: string]: any };
    bonusesByEmployeeId: { [employeeId: string]: any[] };
    notificationsByEmployee: { [employeeId: string]: any[] };
    notificationAlerts: AlertItem[];
  }> {
    return await this.alertGenerationService.generateNotificationAlerts(
      employees,
      getNotificationTypeLabel
    );
  }

  async loadAgeAlerts(
    employees: Employee[]
  ): Promise<AgeAlert[]> {
    return await this.alertGenerationService.generateAgeAlerts(employees);
  }

  async loadQualificationChangeAlerts(
    employees: Employee[]
  ): Promise<QualificationChangeAlert[]> {
    return await this.alertGenerationService.generateQualificationChangeAlerts(employees);
  }

  async loadMaternityChildcareAlerts(
    employees: Employee[],
    formatDate: (date: Date) => string
  ): Promise<MaternityChildcareAlert[]> {
    return await this.alertGenerationService.generateMaternityChildcareAlerts(employees, formatDate);
  }

  async loadBonusReportAlerts(
    employees: Employee[]
  ): Promise<BonusReportAlert[]> {
    return await this.alertGenerationService.generateBonusReportAlerts(employees);
  }
}

