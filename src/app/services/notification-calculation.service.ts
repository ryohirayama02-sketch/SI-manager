import { Injectable } from '@angular/core';
import { BonusService } from './bonus.service';
import {
  SalaryCalculationService,
  TeijiKetteiResult,
  SuijiKouhoResult,
} from './salary-calculation.service';
import {
  NotificationDecisionService,
  NotificationDecisionResult,
} from './notification-decision.service';
import { MonthlySalaryService } from './monthly-salary.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';
import { RoomIdService } from './room-id.service';

/**
 * 届出要否の計算ロジックを担当するサービス
 * 定時決定、随時改定、賞与支払届、資格取得届の要否判定を計算
 */
@Injectable({ providedIn: 'root' })
export class NotificationCalculationService {
  constructor(
    private bonusService: BonusService,
    private salaryCalculationService: SalaryCalculationService,
    private notificationDecisionService: NotificationDecisionService,
    private monthlySalaryService: MonthlySalaryService,
    private roomIdService: RoomIdService
  ) {}

  /**
   * 従業員の届出要否を計算する
   * @param employee 従業員情報
   * @param salaryData 給与データ
   * @param year 年
   * @param gradeTable 標準報酬月額テーブル
   * @returns 届出要否判定結果の配列
   */
  async calculateNotifications(
    employee: Employee,
    salaryData: any,
    year: number,
    gradeTable: any[],
    bonusesByEmployeeId?: { [employeeId: string]: Bonus[] }
  ): Promise<NotificationDecisionResult[]> {
    const notifications: NotificationDecisionResult[] = [];

    // 1. 定時決定の届出要否判定
    if (salaryData) {
      const salaries: {
        [key: string]: {
          total: number;
          fixed: number;
          variable: number;
          workingDays?: number;
        };
      } = {};
      for (let month = 1; month <= 12; month++) {
        const monthKey = this.salaryCalculationService.getSalaryKey(
          employee.id,
          month
        );
        const monthSalaryData = salaryData[monthKey];
        if (monthSalaryData) {
          salaries[monthKey] = {
            total: monthSalaryData.totalSalary ?? monthSalaryData.total ?? 0,
            fixed: monthSalaryData.fixedSalary ?? monthSalaryData.fixed ?? 0,
            variable:
              monthSalaryData.variableSalary ?? monthSalaryData.variable ?? 0,
            workingDays: monthSalaryData.workingDays, // 支払基礎日数
          };
        }
      }

      // 定時決定を計算
      const currentStandard = employee.currentStandardMonthlyRemuneration || 0;
      const currentGrade =
        currentStandard > 0
          ? this.salaryCalculationService.findGrade(gradeTable, currentStandard)
              ?.grade || 0
          : 0;

      const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
        employee.id,
        salaries,
        gradeTable,
        currentStandard
      );

      if (teijiResult.grade > 0) {
        const teijiNotification =
          this.notificationDecisionService.checkTeijiNotification(
            teijiResult,
            currentGrade,
            year
          );
        notifications.push(teijiNotification);
      }

      // 2. 随時改定の届出要否判定
      const suijiResults = this.salaryCalculationService.checkRehabSuiji(
        employee.id,
        salaries,
        gradeTable,
        [employee],
        year.toString(),
        { [employee.id]: teijiResult }
      );

      for (const suijiResult of suijiResults) {
        if (suijiResult.isEligible) {
          const suijiNotification =
            this.notificationDecisionService.checkSuijiNotification(
              suijiResult,
              suijiResult.changeMonth,
              year
            );
          notifications.push(suijiNotification);
        }
      }
    }

    // 3. 賞与支払届の届出要否判定（キャッシュから取得、なければ読み込み）
    const bonuses =
      bonusesByEmployeeId?.[employee.id] ||
      (await this.bonusService.listBonuses(
        this.roomIdService.requireRoomId(),
        employee.id,
        year
      ));
    for (const bonus of bonuses) {
      if (bonus.payDate && bonus.amount) {
        const payDate = new Date(bonus.payDate);
        const bonusNotification =
          this.notificationDecisionService.checkBonusNotification(
            bonus.amount,
            payDate,
            bonus.isRetiredNoLastDay || false,
            bonus.isExempted || false,
            bonus.isOverAge75 || false,
            bonus.isSalaryInsteadOfBonus || false
          );
        notifications.push(bonusNotification);
      }
    }

    return notifications;
  }

  /**
   * 定時決定の届出要否を計算する
   * @param employee 従業員情報
   * @param salaryData 給与データ
   * @param year 年
   * @param gradeTable 標準報酬月額テーブル
   * @returns 定時決定の届出要否判定結果
   */
  calculateTeijiReport(
    employee: Employee,
    salaryData: any,
    year: number,
    gradeTable: any[]
  ): NotificationDecisionResult | null {
    if (!salaryData) {
      return null;
    }

    const salaries: {
      [key: string]: {
        total: number;
        fixed: number;
        variable: number;
        workingDays?: number;
      };
    } = {};
    for (let month = 1; month <= 12; month++) {
      const monthKey = this.salaryCalculationService.getSalaryKey(
        employee.id,
        month
      );
      const monthSalaryData = salaryData[monthKey];
      if (monthSalaryData) {
        salaries[monthKey] = {
          total: monthSalaryData.totalSalary ?? monthSalaryData.total ?? 0,
          fixed: monthSalaryData.fixedSalary ?? monthSalaryData.fixed ?? 0,
          variable:
            monthSalaryData.variableSalary ?? monthSalaryData.variable ?? 0,
          workingDays: monthSalaryData.workingDays, // 支払基礎日数
        };
      }
    }

    const currentStandard = employee.currentStandardMonthlyRemuneration || 0;
    const currentGrade =
      currentStandard > 0
        ? this.salaryCalculationService.findGrade(gradeTable, currentStandard)
            ?.grade || 0
        : 0;

    const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
      employee.id,
      salaries,
      gradeTable,
      currentStandard
    );

    if (teijiResult.grade > 0) {
      return this.notificationDecisionService.checkTeijiNotification(
        teijiResult,
        currentGrade,
        year
      );
    }

    return null;
  }

  /**
   * 随時改定の届出要否を計算する
   * @param employee 従業員情報
   * @param salaryData 給与データ
   * @param year 年
   * @param gradeTable 標準報酬月額テーブル
   * @param teijiResult 定時決定の結果
   * @returns 随時改定の届出要否判定結果の配列
   */
  calculateSuijiReport(
    employee: Employee,
    salaryData: any,
    year: number,
    gradeTable: any[],
    teijiResult: TeijiKetteiResult
  ): NotificationDecisionResult[] {
    if (!salaryData) {
      return [];
    }

    const salaries: {
      [key: string]: { total: number; fixed: number; variable: number };
    } = {};
    for (let month = 1; month <= 12; month++) {
      const monthKey = this.salaryCalculationService.getSalaryKey(
        employee.id,
        month
      );
      const monthSalaryData = salaryData[monthKey];
      if (monthSalaryData) {
        salaries[monthKey] = {
          total: monthSalaryData.totalSalary ?? monthSalaryData.total ?? 0,
          fixed: monthSalaryData.fixedSalary ?? monthSalaryData.fixed ?? 0,
          variable:
            monthSalaryData.variableSalary ?? monthSalaryData.variable ?? 0,
        };
      }
    }

    const suijiResults = this.salaryCalculationService.checkRehabSuiji(
      employee.id,
      salaries,
      gradeTable,
      [employee],
      year.toString(),
      { [employee.id]: teijiResult }
    );

    const notifications: NotificationDecisionResult[] = [];
    for (const suijiResult of suijiResults) {
      if (suijiResult.isEligible) {
        const suijiNotification =
          this.notificationDecisionService.checkSuijiNotification(
            suijiResult,
            suijiResult.changeMonth,
            year
          );
        notifications.push(suijiNotification);
      }
    }

    return notifications;
  }

  /**
   * 賞与支払届の届出要否を計算する
   * @param employeeId 従業員ID
   * @param year 年
   * @returns 賞与支払届の届出要否判定結果の配列
   */
  async calculateBonusReport(
    employeeId: string,
    year: number
  ): Promise<NotificationDecisionResult[]> {
    const bonuses = await this.bonusService.listBonuses(
      this.roomIdService.requireRoomId(),
      employeeId,
      year
    );
    const notifications: NotificationDecisionResult[] = [];

    for (const bonus of bonuses) {
      if (bonus.payDate && bonus.amount) {
        const payDate = new Date(bonus.payDate);
        const bonusNotification =
          this.notificationDecisionService.checkBonusNotification(
            bonus.amount,
            payDate,
            bonus.isRetiredNoLastDay || false,
            bonus.isExempted || false,
            bonus.isOverAge75 || false,
            bonus.isSalaryInsteadOfBonus || false
          );
        notifications.push(bonusNotification);
      }
    }

    return notifications;
  }

  /**
   * 資格取得届の届出要否を計算する
   * @param employee 従業員情報
   * @param shikakuResult 資格取得時決定の結果
   * @returns 資格取得届の届出要否判定結果
   */
  calculateShikakuReport(
    employee: Employee,
    shikakuResult: any
  ): { required: boolean; deadline: string; reason: string } | null {
    return this.notificationDecisionService.getShikakuShutokuDecision(
      employee,
      shikakuResult
    );
  }

  /**
   * 届出提出期限を計算する
   * @param type 届出種類
   * @param year 年
   * @param month 月
   * @param changeMonth 変動月（随時改定の場合）
   * @returns 提出期限（yyyy-mm-dd形式）
   */
  calculateReportDeadline(
    type: 'teiji' | 'suiji' | 'bonus',
    year: number,
    month?: number,
    changeMonth?: number
  ): string | null {
    switch (type) {
      case 'teiji':
        // 定時決定：7月10日
        return `${year}-07-10`;
      case 'suiji':
        // 随時改定：適用開始月の7日（変動月+3ヶ月後が適用開始月）
        if (changeMonth) {
          const applyYear = changeMonth + 3 > 12 ? year + 1 : year;
          const applyMonth =
            changeMonth + 3 > 12 ? changeMonth + 3 - 12 : changeMonth + 3;
          const submitDate = new Date(applyYear, applyMonth - 1, 7); // 適用開始月の7日（月は0ベースなので-1）
          return submitDate.toISOString().split('T')[0];
        }
        return null;
      case 'bonus':
        // 賞与支払届：支給日の翌月10日
        if (month) {
          const submitDate = new Date(year, month, 10);
          return submitDate.toISOString().split('T')[0];
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * 複数の従業員の届出要否を一括計算する
   * @param employees 従業員リスト
   * @param year 年
   * @param gradeTable 標準報酬月額テーブル
   * @returns 従業員ごとの届出要否判定結果
   */
  async calculateNotificationsBatch(
    employees: Employee[],
    year: number,
    gradeTable: any[],
    bonusesByEmployeeId?: { [employeeId: string]: Bonus[] },
    salaryDataByEmployeeId?: { [employeeId: string]: any }
  ): Promise<{ [employeeId: string]: NotificationDecisionResult[] }> {
    const notificationsByEmployee: {
      [employeeId: string]: NotificationDecisionResult[];
    } = {};

    const roomId = this.roomIdService.requireRoomId();

    for (const emp of employees) {
      let salaryData = salaryDataByEmployeeId?.[emp.id];
      if (!salaryData) {
        const monthMap: any = {};
        for (let month = 1; month <= 12; month++) {
          const monthData = await this.monthlySalaryService.getEmployeeSalary(
            roomId,
            emp.id,
            year,
            month
          );
          if (monthData) {
            monthMap[month.toString()] = monthData;
          }
        }
        salaryData = monthMap;
      }
      notificationsByEmployee[emp.id] = await this.calculateNotifications(
        emp,
        salaryData,
        year,
        gradeTable,
        bonusesByEmployeeId
      );
    }

    return notificationsByEmployee;
  }
}
