import { Injectable } from '@angular/core';
import { Firestore, collection, doc, setDoc, getDoc, getDocs, query, where, orderBy } from '@angular/fire/firestore';
import { StandardRemunerationHistory, InsuranceStatusHistory } from '../models/standard-remuneration-history.model';
import { Employee } from '../models/employee.model';
import { MonthlySalaryService } from './monthly-salary.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class StandardRemunerationHistoryService {
  constructor(
    private firestore: Firestore,
    private monthlySalaryService: MonthlySalaryService,
    private salaryCalculationService: SalaryCalculationService,
    private settingsService: SettingsService
  ) {}

  /**
   * 標準報酬履歴を保存
   */
  async saveStandardRemunerationHistory(history: StandardRemunerationHistory): Promise<void> {
    const ref = doc(this.firestore, 'standardRemunerationHistories', history.id || `temp_${Date.now()}`);
    const data = {
      ...history,
      updatedAt: new Date(),
      createdAt: history.createdAt || new Date()
    };
    await setDoc(ref, data, { merge: true });
  }

  /**
   * 従業員の標準報酬履歴を取得
   */
  async getStandardRemunerationHistories(employeeId: string): Promise<StandardRemunerationHistory[]> {
    const ref = collection(this.firestore, 'standardRemunerationHistories');
    const q = query(ref, where('employeeId', '==', employeeId), orderBy('applyStartYear', 'desc'), orderBy('applyStartMonth', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StandardRemunerationHistory));
  }

  /**
   * 月次給与データから標準報酬履歴を自動生成
   */
  async generateStandardRemunerationHistory(employeeId: string, employee: Employee): Promise<void> {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]; // 過去2年から将来1年まで

    for (const year of years) {
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(employeeId, year);
      if (!salaryData) continue;

      // 給与データを整形
      const salaries: { [key: string]: { total: number; fixed: number; variable: number } } = {};
      for (let month = 1; month <= 12; month++) {
        const monthKey = month.toString();
        const monthData = salaryData[monthKey];
        if (monthData) {
          const key = this.salaryCalculationService.getSalaryKey(employeeId, month);
          salaries[key] = {
            total: monthData.totalSalary ?? monthData.total ?? 0,
            fixed: monthData.fixedSalary ?? monthData.fixed ?? 0,
            variable: monthData.variableSalary ?? monthData.variable ?? 0
          };
        }
      }

      // 標準報酬等級表を取得
      const gradeTable = await this.settingsService.getStandardTable(year);
      
      // 定時決定を計算
      const teijiResult = this.salaryCalculationService.calculateTeijiKettei(
        employeeId,
        salaries,
        gradeTable,
        year
      );

      if (teijiResult.standardMonthlyRemuneration > 0) {
        // 既存の履歴を確認
        const existingHistories = await this.getStandardRemunerationHistories(employeeId);
        const exists = existingHistories.some(h => 
          h.applyStartYear === year && h.applyStartMonth === 9 && h.determinationReason === 'teiji'
        );

        if (!exists) {
          await this.saveStandardRemunerationHistory({
            employeeId,
            applyStartYear: year,
            applyStartMonth: 9,
            grade: teijiResult.grade,
            standardMonthlyRemuneration: teijiResult.standardMonthlyRemuneration,
            determinationReason: 'teiji',
            memo: `定時決定（${year}年4〜6月平均）`
          });
        }
      }
    }
  }

  /**
   * 社保加入履歴を保存
   */
  async saveInsuranceStatusHistory(history: InsuranceStatusHistory): Promise<void> {
    const ref = doc(this.firestore, 'insuranceStatusHistories', history.id || `temp_${Date.now()}`);
    const data = {
      ...history,
      updatedAt: new Date(),
      createdAt: history.createdAt || new Date()
    };
    await setDoc(ref, data, { merge: true });
  }

  /**
   * 従業員の社保加入履歴を取得
   */
  async getInsuranceStatusHistories(employeeId: string, year?: number): Promise<InsuranceStatusHistory[]> {
    const ref = collection(this.firestore, 'insuranceStatusHistories');
    let q = query(ref, where('employeeId', '==', employeeId), orderBy('year', 'desc'), orderBy('month', 'desc'));
    if (year) {
      q = query(ref, where('employeeId', '==', employeeId), where('year', '==', year), orderBy('month', 'desc'));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InsuranceStatusHistory));
  }

  /**
   * 従業員情報から社保加入履歴を自動生成
   */
  async generateInsuranceStatusHistory(employeeId: string, employee: Employee): Promise<void> {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

    for (const year of years) {
      for (let month = 1; month <= 12; month++) {
        // 年齢計算（簡易版）
        const birthDate = new Date(employee.birthDate);
        const targetDate = new Date(year, month - 1, 1);
        let age = targetDate.getFullYear() - birthDate.getFullYear();
        const monthDiff = targetDate.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && targetDate.getDate() < birthDate.getDate())) {
          age--;
        }
        
        // 年齢到達の判定
        let ageMilestone: 40 | 65 | 70 | 75 | undefined;
        if (age === 40) ageMilestone = 40;
        if (age === 65) ageMilestone = 65;
        if (age === 70) ageMilestone = 70;
        if (age === 75) ageMilestone = 75;

        // 健康保険状態
        let healthStatus: 'joined' | 'lost' | 'exempt_maternity' | 'exempt_childcare' = 'joined';
        if (age >= 75) {
          healthStatus = 'lost';
        } else if (this.isInMaternityLeave(employee, year, month)) {
          healthStatus = 'exempt_maternity';
        } else if (this.isInChildcareLeave(employee, year, month)) {
          healthStatus = 'exempt_childcare';
        } else if (employee.retireDate) {
          const retireDate = new Date(employee.retireDate);
          if (year === retireDate.getFullYear() && month > retireDate.getMonth() + 1) {
            healthStatus = 'lost';
          }
        }

        // 介護保険状態
        let careStatus: 'joined' | 'lost' | 'exempt_maternity' | 'exempt_childcare' | 'type1' = 'joined';
        if (age >= 75) {
          careStatus = 'lost';
        } else if (age >= 65) {
          careStatus = 'type1';
        } else if (age < 40) {
          careStatus = 'lost';
        } else if (this.isInMaternityLeave(employee, year, month)) {
          careStatus = 'exempt_maternity';
        } else if (this.isInChildcareLeave(employee, year, month)) {
          careStatus = 'exempt_childcare';
        }

        // 厚生年金状態
        let pensionStatus: 'joined' | 'lost' | 'exempt_maternity' | 'exempt_childcare' = 'joined';
        if (age >= 70) {
          pensionStatus = 'lost';
        } else if (this.isInMaternityLeave(employee, year, month)) {
          pensionStatus = 'exempt_maternity';
        } else if (this.isInChildcareLeave(employee, year, month)) {
          pensionStatus = 'exempt_childcare';
        } else if (employee.retireDate) {
          const retireDate = new Date(employee.retireDate);
          if (year === retireDate.getFullYear() && month > retireDate.getMonth() + 1) {
            pensionStatus = 'lost';
          }
        }

        // 既存の履歴を確認
        const existingHistories = await this.getInsuranceStatusHistories(employeeId, year);
        const exists = existingHistories.some(h => h.year === year && h.month === month);

        if (!exists) {
          await this.saveInsuranceStatusHistory({
            employeeId,
            year,
            month,
            healthInsuranceStatus: healthStatus,
            careInsuranceStatus: careStatus,
            pensionInsuranceStatus: pensionStatus,
            ageMilestone
          });
        }
      }
    }
  }

  private isInMaternityLeave(employee: Employee, year: number, month: number): boolean {
    if (!employee.maternityLeaveStart || !employee.maternityLeaveEnd) return false;
    const start = new Date(employee.maternityLeaveStart);
    const end = new Date(employee.maternityLeaveEnd);
    const target = new Date(year, month - 1, 1);
    return target >= start && target <= end;
  }

  private isInChildcareLeave(employee: Employee, year: number, month: number): boolean {
    if (!employee.childcareLeaveStart || !employee.childcareLeaveEnd) return false;
    const start = new Date(employee.childcareLeaveStart);
    const end = new Date(employee.childcareLeaveEnd);
    const target = new Date(year, month - 1, 1);
    return target >= start && target <= end;
  }
}

