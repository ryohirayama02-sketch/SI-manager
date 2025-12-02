import { Injectable } from '@angular/core';
import { EmployeeLifecycleService } from './employee-lifecycle.service';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';

/**
 * PaymentSummaryDataPreparationService
 * 
 * 保険料サマリー計算のデータ準備を担当するサービス
 * 賞与データのグループ化、年齢キャッシュの計算を提供
 */
@Injectable({ providedIn: 'root' })
export class PaymentSummaryDataPreparationService {
  constructor(
    private employeeLifecycleService: EmployeeLifecycleService
  ) {}

  /**
   * 賞与データを月ごとにグループ化
   */
  groupBonusesByMonth(bonuses: Bonus[]): { [month: number]: Bonus[] } {
    const bonusByMonth: { [month: number]: Bonus[] } = {};
    for (const bonus of bonuses) {
      const month = bonus.month;
      if (month >= 1 && month <= 12) {
        if (!bonusByMonth[month]) {
          bonusByMonth[month] = [];
        }
        bonusByMonth[month].push(bonus);
      }
    }
    return bonusByMonth;
  }

  /**
   * 賞与データを従業員ごとにグループ化
   */
  groupBonusesByEmployee(bonuses: Bonus[]): { [employeeId: string]: Bonus[] } {
    const bonusesByEmployee: { [employeeId: string]: Bonus[] } = {};
    for (const bonus of bonuses) {
      if (!bonusesByEmployee[bonus.employeeId]) {
        bonusesByEmployee[bonus.employeeId] = [];
      }
      bonusesByEmployee[bonus.employeeId].push(bonus);
    }
    return bonusesByEmployee;
  }

  /**
   * 年齢キャッシュを事前計算
   */
  calculateAgeCache(employees: Employee[], year: number): { [employeeId: string]: { [month: number]: number } } {
    const ageCacheByEmployee: { [employeeId: string]: { [month: number]: number } } = {};
    for (const emp of employees) {
      const birthDate = new Date(emp.birthDate);
      ageCacheByEmployee[emp.id] = {};
      for (let m = 1; m <= 12; m++) {
        ageCacheByEmployee[emp.id][m] = 
          this.employeeLifecycleService.getAgeAtMonth(birthDate, year, m);
      }
    }
    return ageCacheByEmployee;
  }
}

