import { Injectable } from '@angular/core';
import { Employee } from '../models/employee.model';
import { Bonus } from '../models/bonus.model';

export interface AnnualPremiumsResult {
  healthEmployee: number;
  healthEmployer: number;
  careEmployee: number;
  careEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  exemptReasons: string[];
  salaryInsteadReasons: string[];
}

export interface MonthlyCompanyBurden {
  health: number;
  care: number;
  pension: number;
  total: number;
}

export interface MonthlyPremiumsData {
  [month: number]: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
  };
}

@Injectable({ providedIn: 'root' })
export class InsuranceCalculationService {

  getAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  isCareInsuranceEligible(age: number): boolean {
    return age >= 40 && age <= 64;
  }

  formatReasons(reasons: string[]): string[] {
    return [...new Set(reasons)];
  }

  getAnnualPremiums(
    employee: Employee,
    monthlyData: any | null,
    bonusData: Bonus[]
  ): AnnualPremiumsResult {
    let healthEmployee = 0;
    let healthEmployer = 0;
    let careEmployee = 0;
    let careEmployer = 0;
    let pensionEmployee = 0;
    let pensionEmployer = 0;
    const exemptReasons: string[] = [];
    const salaryInsteadReasons: string[] = [];

    // 賞与の年間合計を計算
    for (const bonus of bonusData) {
      // 免除が true の場合は 0 円
      if (bonus.isExempted) {
        if (bonus.exemptReason) {
          exemptReasons.push(bonus.exemptReason);
        }
        continue;
      }

      // 保険料を集計
      healthEmployee += bonus.healthEmployee || 0;
      healthEmployer += bonus.healthEmployer || 0;
      careEmployee += bonus.careEmployee || 0;
      careEmployer += bonus.careEmployer || 0;
      pensionEmployee += bonus.pensionEmployee || 0;
      pensionEmployer += bonus.pensionEmployer || 0;
    }

    // TODO: 月次給与の年間合計も追加する場合はここに実装

    return {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      exemptReasons: this.formatReasons(exemptReasons),
      salaryInsteadReasons: this.formatReasons(salaryInsteadReasons)
    };
  }

  getMonthlyCompanyBurden(
    employee: Employee,
    monthlyPremiums: MonthlyPremiumsData,
    bonusPremiums: Bonus[]
  ): { [month: number]: MonthlyCompanyBurden } {
    const result: { [month: number]: MonthlyCompanyBurden } = {};

    // 月ごとの集計を初期化
    for (let month = 1; month <= 12; month++) {
      result[month] = {
        health: 0,
        care: 0,
        pension: 0,
        total: 0
      };
    }

    // 月次給与の保険料を集計
    for (let month = 1; month <= 12; month++) {
      const premiums = monthlyPremiums[month];
      if (premiums) {
        result[month].health += premiums.healthEmployee + premiums.healthEmployer;
        result[month].care += premiums.careEmployee + premiums.careEmployer;
        result[month].pension += premiums.pensionEmployee + premiums.pensionEmployer;
      }
    }

    // 賞与の保険料を集計
    for (const bonus of bonusPremiums) {
      // 免除が true の場合は 0 円
      if (bonus.isExempted) {
        continue;
      }

      // 支給月を取得
      const payDate = new Date(bonus.payDate);
      const payMonth = payDate.getMonth() + 1;

      // 賞与保険料を加算
      const healthTotal = (bonus.healthEmployee || 0) + (bonus.healthEmployer || 0);
      const careTotal = (bonus.careEmployee || 0) + (bonus.careEmployer || 0);
      const pensionTotal = (bonus.pensionEmployee || 0) + (bonus.pensionEmployer || 0);

      result[payMonth].health += healthTotal;
      result[payMonth].care += careTotal;
      result[payMonth].pension += pensionTotal;
    }

    // 各月の合計を計算
    for (let month = 1; month <= 12; month++) {
      result[month].total =
        result[month].health +
        result[month].care +
        result[month].pension;
    }

    return result;
  }

  getTotalForYear(monthlyTotals: { [month: number]: MonthlyCompanyBurden }): number {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      total += monthlyTotals[month]?.total || 0;
    }
    return total;
  }

  getTotalHealth(monthlyTotals: { [month: number]: MonthlyCompanyBurden }): number {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      total += monthlyTotals[month]?.health || 0;
    }
    return total;
  }

  getTotalCare(monthlyTotals: { [month: number]: MonthlyCompanyBurden }): number {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      total += monthlyTotals[month]?.care || 0;
    }
    return total;
  }

  getTotalPension(monthlyTotals: { [month: number]: MonthlyCompanyBurden }): number {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      total += monthlyTotals[month]?.pension || 0;
    }
    return total;
  }
}

