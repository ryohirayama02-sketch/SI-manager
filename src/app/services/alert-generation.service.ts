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
import { RoomIdService } from './room-id.service';
import { EmployeeWorkCategoryService } from './employee-work-category.service';
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
    private officeService: OfficeService,
    private roomIdService: RoomIdService,
    private employeeWorkCategoryService: EmployeeWorkCategoryService
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
    if (!employees || !Array.isArray(employees)) {
      return [];
    }
    try {
      const years = [2023, 2024, 2025, 2026];
      const loadedAlerts = await this.suijiService.loadAllAlerts(years);

      if (!loadedAlerts || !Array.isArray(loadedAlerts)) {
        return [];
      }

      const validEmployeeIds = new Set(
        employees.filter((e) => e && e.id).map((e) => e.id)
      );
      return loadedAlerts
        .filter((alert: any) => alert && alert.employeeId && validEmployeeIds.has(alert.employeeId))
        .map((alert: any) => {
          try {
            return {
              ...alert,
              diffPrev: getPrevMonthDiff(
                alert.employeeId,
                alert.changeMonth,
                alert.year || 2025
              ),
              id: alert.id || getSuijiAlertId(alert),
              currentStandard:
                alert.currentStandard ?? alert.currentRemuneration ?? null,
            };
          } catch (error) {
            console.error('[alert-generation] generateSuijiAlerts マッピングエラー:', error, alert);
            return null;
          }
        })
        .filter((alert): alert is SuijiKouhoResultWithDiff => alert !== null);
    } catch (error) {
      console.error('[alert-generation] generateSuijiAlertsエラー:', error);
      return [];
    }
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
    const roomId = this.roomIdService.requireRoomId();
    for (const emp of employees) {
      const monthMap: any = {};
      for (let month = 1; month <= 12; month++) {
        const monthData = await this.monthlySalaryService.getEmployeeSalary(
          roomId,
          emp.id,
          currentYear,
          month
        );
        if (monthData) {
          monthMap[month.toString()] = monthData;
        }
      }
      salaryDataByEmployeeId[emp.id] = monthMap;
    }

    const bonusesByEmployeeId: { [employeeId: string]: Bonus[] } = {};
    for (const emp of employees) {
      const empBonuses = await this.bonusService.listBonuses(
        roomId,
        emp.id,
        currentYear
      );
      if (empBonuses.length > 0) {
        bonusesByEmployeeId[emp.id] = empBonuses;
      }
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
    const deletedAlertIds =
      await this.qualificationChangeAlertService.getDeletedAlertIds();

    try {
      console.log(
        `[alerts-dashboard] 削除済みアラートID数: ${deletedAlertIds.size}`
      );

      const changeHistories =
        await this.employeeChangeHistoryService.getAllRecentChangeHistory(5);
      console.log(
        `[alerts-dashboard] 取得した変更履歴数: ${changeHistories.length}`
      );
      changeHistories.forEach((h, idx) => {
        console.log(
          `[alerts-dashboard] 履歴${idx + 1}: emp=${h.employeeId}, type=${
            h.changeType
          }, date=${h.changeDate}, old=${h.oldValue}, new=${h.newValue}`
        );
      });

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

        // 資格取得の変更履歴で、社会保険非加入（weeklyWorkHoursCategoryが'less-than-20hours'）の場合はアラートを出さない
        if (
          history.changeType === '資格取得' &&
          employee &&
          employee.weeklyWorkHoursCategory === 'less-than-20hours'
        ) {
          console.log(
            `[alerts-dashboard] 社会保険非加入のため資格取得アラートをスキップ: ${alertId}, 従業員=${employeeName}`
          );
          continue;
        }

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

    // 従業員の新規資格取得（健康保険・厚生年金）を追加でチェック
    try {
      const today = normalizeDate(getJSTDate());
      for (const emp of employees) {
        if (!emp.joinDate) continue;
        const joinDate = normalizeDate(new Date(emp.joinDate));
        const diffMs = today.getTime() - joinDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        // 入社日から5日以内のみ対象（過去分は表示しない設計に合わせる）
        if (diffDays < 0 || diffDays > 5) continue;
        // 社会保険非加入（weeklyWorkHoursCategoryが'less-than-20hours'）の場合は資格取得アラートを出さない
        if (emp.weeklyWorkHoursCategory === 'less-than-20hours') continue;

        const alertId = `acquisition_${emp.id}_${emp.joinDate}`;
        if (
          qualificationChangeAlerts.find((a) => a.id === alertId) ||
          deletedAlertIds.has(alertId)
        ) {
          continue;
        }

        const submitDeadline = calculateSubmitDeadline(joinDate);
        const daysUntilDeadline = calculateDaysUntilDeadline(
          submitDeadline,
          today
        );

        qualificationChangeAlerts.push({
          id: alertId,
          employeeId: emp.id,
          employeeName: emp.name,
          changeType: '資格取得',
          notificationNames: ['健康保険・厚生年金保険被保険者資格取得届'],
          changeDate: joinDate,
          submitDeadline: submitDeadline,
          daysUntilDeadline: daysUntilDeadline,
          details: `入社日: ${emp.joinDate}`,
        });
      }

      qualificationChangeAlerts.sort((a, b) => {
        return b.changeDate.getTime() - a.changeDate.getTime();
      });
    } catch (error) {
      console.error('[alerts-dashboard] 資格取得アラート生成エラー:', error);
    }

    // 退職（資格喪失）アラートを生成（退職日から5日以内が期限）
    try {
      for (const emp of employees) {
        if (!emp.retireDate) continue;
        const retireDate = normalizeDate(new Date(emp.retireDate));
        const alertId = `retire_${emp.id}_${emp.retireDate}`;

        if (
          qualificationChangeAlerts.find((a) => a.id === alertId) ||
          deletedAlertIds.has(alertId)
        ) {
          continue;
        }

        const submitDeadline = calculateSubmitDeadline(retireDate);
        const daysUntilDeadline = calculateDaysUntilDeadline(
          submitDeadline,
          today
        );

        qualificationChangeAlerts.push({
          id: alertId,
          employeeId: emp.id,
          employeeName: emp.name,
          changeType: '退職（資格喪失）',
          notificationNames: ['健康保険・厚生年金保険被保険者資格喪失届'],
          changeDate: retireDate,
          submitDeadline,
          daysUntilDeadline,
          details: `退職日: ${emp.retireDate}`,
        });
      }

      qualificationChangeAlerts.sort((a, b) => {
        return b.changeDate.getTime() - a.changeDate.getTime();
      });
    } catch (error) {
      console.error('[alerts-dashboard] 資格喪失アラート生成エラー:', error);
    }

    // 非加入者の収入超過アラート（固定+非固定が88,000円超）
    try {
      const today = normalizeDate(getJSTDate());
      const roomId = this.roomIdService.requireRoomId();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;

      // 過去12ヶ月分をチェック（現在の月を含む）
      // 非加入者の収入超過は過去の月でも発生する可能性があるため、過去12ヶ月をチェック
      const monthsToCheck: { year: number; month: number }[] = [];
      for (let i = 0; i < 12; i++) {
        const checkDate = new Date(currentYear, currentMonth - 1 - i, 1);
        monthsToCheck.push({
          year: checkDate.getFullYear(),
          month: checkDate.getMonth() + 1,
        });
      }
      for (const emp of employees) {
        // 社会保険未加入のみ対象
        const isNonInsured = this.employeeWorkCategoryService.isNonInsured(emp);
        if (!isNonInsured) continue;

        // 過去3ヶ月分をチェック
        for (const { year, month } of monthsToCheck) {
          const monthData = await this.monthlySalaryService.getEmployeeSalary(
            roomId,
            emp.id,
            year,
            month
          );
          if (!monthData) {
            continue;
          }

          // 月次給与データから合計を計算（複数の形式に対応）
          // 1. totalSalary/total を優先
          // 2. fixedTotal + variableTotal を計算
          // 3. fixedSalary + variableSalary を計算
          // 4. fixed + variable を計算
          const fixedTotal = monthData.fixedTotal ?? monthData.fixedSalary ?? monthData.fixed ?? 0;
          const variableTotal = monthData.variableTotal ?? monthData.variableSalary ?? monthData.variable ?? 0;
          const calculatedTotal = fixedTotal + variableTotal;
          
          const total =
            monthData.totalSalary ??
            monthData.total ??
            calculatedTotal;

          if (total <= 88000) {
            continue;
          }

          const alertId = `noninsured_income_${emp.id}_${year}_${month}`;
          const existingAlert = qualificationChangeAlerts.find(
            (a) => a.id === alertId
          );
          const isDeleted = deletedAlertIds.has(alertId);

          if (existingAlert || isDeleted) {
            continue;
          }

          // その月の1日をchangeDateとして使用
          const changeDate = normalizeDate(new Date(year, month - 1, 1));
          const submitDeadline = calculateSubmitDeadline(changeDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );

          qualificationChangeAlerts.push({
            id: alertId,
            employeeId: emp.id,
            employeeName: emp.name,
            changeType: '加入状況確認',
            notificationNames: ['加入状況の見直し'],
            changeDate,
            submitDeadline,
            daysUntilDeadline,
            details: `${year}年${month}月の月次収入が88000円を超えたので加入状況を確認してください。`,
          });
        }
      }

      qualificationChangeAlerts.sort((a, b) => {
        return b.changeDate.getTime() - a.changeDate.getTime();
      });
    } catch (error) {
      console.error(
        '[alerts-dashboard] 非加入者収入超過アラート生成エラー:',
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

        // 終了届は管理対象外とする

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

        // 育休期間確認（開始日から終了日が14日未満の場合）
        if (emp.childcareLeaveStart && emp.childcareLeaveEnd) {
          const startDate = normalizeDate(new Date(emp.childcareLeaveStart));
          const endDate = normalizeDate(new Date(emp.childcareLeaveEnd));
          // 開始日から終了日までの日数を計算（開始日と終了日を含む）
          const daysDiff =
            Math.floor(
              (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
            ) + 1;

          if (daysDiff < 14) {
            // 開始日は育児休業等終了日、提出期限は終了日から5日以内
            const submitDeadline = calculateSubmitDeadline(endDate);
            const daysUntilDeadline = calculateDaysUntilDeadline(
              submitDeadline,
              today
            );
            maternityChildcareAlerts.push({
              id: `childcare_period_check_${emp.id}_${emp.childcareLeaveEnd}`,
              employeeId: emp.id,
              employeeName: emp.name,
              alertType: '育休期間確認',
              notificationName: '育休期間確認',
              startDate: endDate,
              submitDeadline: submitDeadline,
              daysUntilDeadline: daysUntilDeadline,
              details: '育休期間が14日未満か確認',
            });
          }
        }

        // 終了届は管理対象外とする

        // 傷病手当金支給申請書の記入依頼
        if (emp.sickPayApplicationRequest) {
          const requestDateStr =
            emp.sickPayApplicationRequestDate ||
            getJSTDate().toISOString().split('T')[0];
          const startDate = normalizeDate(new Date(requestDateStr));
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          maternityChildcareAlerts.push({
            id: `sickpay_request_${emp.id}_${requestDateStr}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '傷病手当金支給申請書の記入依頼',
            notificationName: '傷病手当金支給申請書',
            startDate,
            submitDeadline,
            daysUntilDeadline,
            details: '傷病手当金支給申請書の記入依頼あり',
          });
        }

        // 育児休業関係の事業主証明書の記入依頼
        if (emp.childcareEmployerCertificateRequest) {
          const requestDateStr =
            emp.childcareEmployerCertificateRequestDate ||
            getJSTDate().toISOString().split('T')[0];
          const startDate = normalizeDate(new Date(requestDateStr));
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          maternityChildcareAlerts.push({
            id: `childcare_certificate_request_${emp.id}_${requestDateStr}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '育児休業関係の事業主証明書の記入依頼',
            notificationName: '育児休業関係の事業主証明書',
            startDate,
            submitDeadline,
            daysUntilDeadline,
            details: '育児休業関係の事業主証明書の記入依頼あり',
          });
        }

        // 出産手当金支給申請書の記入依頼
        if (emp.maternityAllowanceApplicationRequest) {
          const requestDateStr =
            emp.maternityAllowanceApplicationRequestDate ||
            getJSTDate().toISOString().split('T')[0];
          const startDate = normalizeDate(new Date(requestDateStr));
          const submitDeadline = calculateSubmitDeadline(startDate);
          const daysUntilDeadline = calculateDaysUntilDeadline(
            submitDeadline,
            today
          );
          maternityChildcareAlerts.push({
            id: `maternity_allowance_request_${emp.id}_${requestDateStr}`,
            employeeId: emp.id,
            employeeName: emp.name,
            alertType: '出産手当金支給申請書の記入依頼',
            notificationName: '出産手当金支給申請書',
            startDate,
            submitDeadline,
            daysUntilDeadline,
            details: '出産手当金支給申請書の記入依頼あり',
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

    if (!employees || !Array.isArray(employees)) {
      return bonusReportAlerts;
    }

    try {
      const currentYear = getJSTDate().getFullYear();
      const today = normalizeDate(getJSTDate());
      const roomId = this.roomIdService.requireRoomId();

      // 過去2年から将来1年までの賞与を取得（賞与支払届の提出期限は支給日の翌月10日なので、過去の賞与も対象になる可能性がある）
      const years = [
        currentYear - 2,
        currentYear - 1,
        currentYear,
        currentYear + 1,
      ];

      for (const emp of employees) {
        if (!emp || !emp.id) {
          continue;
        }

        try {
          // 複数年度の賞与を取得
          const allBonuses: any[] = [];
          for (const year of years) {
            try {
              const bonuses = await this.bonusService.listBonuses(
                roomId,
                emp.id,
                year
              );
              if (bonuses && Array.isArray(bonuses)) {
                allBonuses.push(...bonuses);
              }
            } catch (error) {
              console.error(
                `[alert-generation] 賞与取得エラー: 従業員ID=${emp?.id || '不明'}, 年度=${year}`,
                error
              );
              // エラーが発生しても処理を継続
            }
          }

          for (const bonus of allBonuses) {
            if (!bonus) {
              continue;
            }

            // bonus.amountのバリデーション
            if (bonus.amount === null || bonus.amount === undefined || bonus.amount === 0 || isNaN(bonus.amount)) {
              continue;
            }

            if (!bonus.payDate || typeof bonus.payDate !== 'string') {
              continue;
            }

            try {
              const payDate = normalizeDate(new Date(bonus.payDate));
              if (isNaN(payDate.getTime())) {
                continue;
              }

              const submitDeadline = calculateSubmitDeadline(payDate);
              submitDeadline.setHours(23, 59, 59, 999);
              const daysUntilDeadline = calculateDaysUntilDeadline(
                submitDeadline,
                today
              );

              const employeeId = bonus.employeeId || emp.id;
              if (!employeeId) {
                continue;
              }
              const alertId = `${employeeId}_${bonus.payDate}`;

              bonusReportAlerts.push({
                id: alertId,
                employeeId: employeeId,
                employeeName: emp.name || '不明',
                bonusAmount: bonus.amount || 0,
                payDate: bonus.payDate,
                submitDeadline: submitDeadline,
                daysUntilDeadline: daysUntilDeadline,
              });
            } catch (error) {
              console.error(
                `[alert-generation] 賞与アラート生成エラー: 従業員ID=${bonus?.employeeId || emp?.id || '不明'}, 支給日=${bonus?.payDate || '不明'}`,
                error
              );
              // エラーが発生しても処理を継続
            }
          }
        } catch (error) {
          console.error(
            `[alert-generation] 従業員処理エラー: ID=${emp?.id || '不明'}, 名前=${emp?.name || '不明'}`,
            error
          );
          // エラーが発生しても処理を継続
        }
      }
    } catch (error) {
      console.error('[alert-generation] generateBonusReportAlertsエラー:', error);
      // エラーが発生しても空配列を返す
    }

    // ソート処理（提出期限でソート）
    bonusReportAlerts.sort((a, b) => {
      if (!a || !b || !a.submitDeadline || !b.submitDeadline) {
        return 0;
      }
      try {
        const timeA = a.submitDeadline.getTime();
        const timeB = b.submitDeadline.getTime();
        if (isNaN(timeA) || isNaN(timeB)) {
          return 0;
        }
        return timeA - timeB;
      } catch (error) {
        console.error('[alert-generation] ソート処理エラー:', error);
        return 0;
      }
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
