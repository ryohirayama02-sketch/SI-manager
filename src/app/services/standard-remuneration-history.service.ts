import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
} from '@angular/fire/firestore';
import {
  StandardRemunerationHistory,
  InsuranceStatusHistory,
} from '../models/standard-remuneration-history.model';
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
  async saveStandardRemunerationHistory(
    history: StandardRemunerationHistory
  ): Promise<void> {
    // IDが指定されている場合は既存の履歴を更新、なければ新規作成
    const docId = history.id || `temp_${Date.now()}`;
    const ref = doc(this.firestore, 'standardRemunerationHistories', docId);

    // 既存のドキュメントを取得してcreatedAtを保持
    const existingSnap = await getDoc(ref);
    let existingCreatedAt: Date;
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      if (existingData['createdAt']?.toDate) {
        existingCreatedAt = existingData['createdAt'].toDate();
      } else if (existingData['createdAt'] instanceof Date) {
        existingCreatedAt = existingData['createdAt'];
      } else {
        existingCreatedAt = history.createdAt || new Date();
      }
    } else {
      existingCreatedAt = history.createdAt || new Date();
    }

    // undefinedのフィールドを削除（Firestoreはundefinedをサポートしていない）
    const data: any = {
      employeeId: history.employeeId,
      applyStartYear: history.applyStartYear,
      applyStartMonth: history.applyStartMonth,
      grade: history.grade,
      standardMonthlyRemuneration: history.standardMonthlyRemuneration,
      determinationReason: history.determinationReason,
      updatedAt: new Date(),
      createdAt: existingCreatedAt,
    };

    // 値がある場合のみ追加
    if (history.memo) {
      data.memo = history.memo;
    }

    await setDoc(ref, data, { merge: true });
  }

  /**
   * 従業員の標準報酬履歴を取得
   */
  async getStandardRemunerationHistories(
    employeeId: string
  ): Promise<StandardRemunerationHistory[]> {
    const ref = collection(this.firestore, 'standardRemunerationHistories');
    const q = query(ref, where('employeeId', '==', employeeId));
    const snapshot = await getDocs(q);
    const histories = snapshot.docs.map((doc) => {
      const data = doc.data();
      // FirestoreのTimestampをDateに変換
      let createdAt: Date | undefined;
      if (data['createdAt']) {
        if (data['createdAt'].toDate) {
          createdAt = data['createdAt'].toDate();
        } else if (data['createdAt'] instanceof Date) {
          createdAt = data['createdAt'];
        }
      }
      let updatedAt: Date | undefined;
      if (data['updatedAt']) {
        if (data['updatedAt'].toDate) {
          updatedAt = data['updatedAt'].toDate();
        } else if (data['updatedAt'] instanceof Date) {
          updatedAt = data['updatedAt'];
        }
      }
      return {
        id: doc.id,
        ...data,
        createdAt,
        updatedAt,
      } as StandardRemunerationHistory;
    });
    // クライアント側でソート（applyStartYear, applyStartMonthで降順ソート）
    return histories.sort((a, b) => {
      if (a.applyStartYear !== b.applyStartYear) {
        return b.applyStartYear - a.applyStartYear;
      }
      return b.applyStartMonth - a.applyStartMonth;
    });
  }

  /**
   * 指定された年月に適用される標準報酬月額を取得
   * @param employeeId 従業員ID
   * @param year 年
   * @param month 月（1-12）
   * @returns 標準報酬月額（見つからない場合はnull）
   */
  async getStandardRemunerationForMonth(
    employeeId: string,
    year: number,
    month: number
  ): Promise<number | null> {
    const histories = await this.getStandardRemunerationHistories(employeeId);

    // 指定された年月以前で最も新しい履歴を取得
    // 履歴は降順ソートされているので、最初に見つかったものが該当する
    for (const history of histories) {
      if (
        history.applyStartYear < year ||
        (history.applyStartYear === year && history.applyStartMonth <= month)
      ) {
        return history.standardMonthlyRemuneration;
      }
    }

    return null;
  }

  /**
   * 月次給与データから標準報酬履歴を自動生成
   */
  async generateStandardRemunerationHistory(
    employeeId: string,
    employee: Employee
  ): Promise<void> {
    const currentYear = new Date().getFullYear();
    const years = [
      currentYear - 2,
      currentYear - 1,
      currentYear,
      currentYear + 1,
    ]; // 過去2年から将来1年まで

    for (const year of years) {
      const salaryData = await this.monthlySalaryService.getEmployeeSalary(
        employeeId,
        year
      );
      if (!salaryData) continue;

      // 給与データを整形
      const salaries: {
        [key: string]: {
          total: number;
          fixed: number;
          variable: number;
          workingDays?: number;
        };
      } = {};
      for (let month = 1; month <= 12; month++) {
        const monthKey = month.toString();
        const monthData = salaryData[monthKey];
        if (monthData) {
          const key = this.salaryCalculationService.getSalaryKey(
            employeeId,
            month
          );
          salaries[key] = {
            total: monthData.totalSalary ?? monthData.total ?? 0,
            fixed: monthData.fixedSalary ?? monthData.fixed ?? 0,
            variable: monthData.variableSalary ?? monthData.variable ?? 0,
            workingDays: monthData.workingDays, // 支払基礎日数
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
        const existingHistories = await this.getStandardRemunerationHistories(
          employeeId
        );
        const existingHistory = existingHistories.find(
          (h) =>
            h.applyStartYear === year &&
            h.applyStartMonth === 9 &&
            h.determinationReason === 'teiji'
        );

        // 既存の履歴がない場合、または計算結果が異なる場合は保存/更新
        if (
          !existingHistory ||
          existingHistory.standardMonthlyRemuneration !==
            teijiResult.standardMonthlyRemuneration ||
          existingHistory.grade !== teijiResult.grade
        ) {
          await this.saveStandardRemunerationHistory({
            id: existingHistory?.id, // 既存のIDがあれば使用（更新）、なければ新規作成
            employeeId,
            applyStartYear: year,
            applyStartMonth: 9,
            grade: teijiResult.grade,
            standardMonthlyRemuneration:
              teijiResult.standardMonthlyRemuneration,
            determinationReason: 'teiji',
            memo: `定時決定（${year}年4〜6月平均）`,
            createdAt: existingHistory?.createdAt, // 既存の履歴がある場合は元の作成日時を保持
          });
        }
      }
    }
  }

  /**
   * 社保加入履歴を保存
   */
  async saveInsuranceStatusHistory(
    history: InsuranceStatusHistory
  ): Promise<void> {
    // 一意のIDを生成（employeeId_year_month）
    const docId =
      history.id || `${history.employeeId}_${history.year}_${history.month}`;
    const ref = doc(this.firestore, 'insuranceStatusHistories', docId);
    // undefinedのフィールドを削除（Firestoreはundefinedをサポートしていない）
    const data: any = {
      employeeId: history.employeeId,
      year: history.year,
      month: history.month,
      healthInsuranceStatus: history.healthInsuranceStatus,
      careInsuranceStatus: history.careInsuranceStatus,
      pensionInsuranceStatus: history.pensionInsuranceStatus,
      updatedAt: new Date(),
      createdAt: history.createdAt || new Date(),
    };

    // 値がある場合のみ追加
    if (history.ageMilestone !== null && history.ageMilestone !== undefined) {
      data.ageMilestone = history.ageMilestone;
    }

    await setDoc(ref, data, { merge: true });
  }

  /**
   * 従業員の社保加入履歴を取得
   */
  async getInsuranceStatusHistories(
    employeeId: string,
    year?: number
  ): Promise<InsuranceStatusHistory[]> {
    const ref = collection(this.firestore, 'insuranceStatusHistories');
    let q;
    if (year) {
      q = query(
        ref,
        where('employeeId', '==', employeeId),
        where('year', '==', year)
      );
    } else {
      q = query(ref, where('employeeId', '==', employeeId));
    }
    const snapshot = await getDocs(q);
    const histories = snapshot.docs.map((doc) => {
      const data = doc.data();
      // FirestoreのTimestampをDateに変換
      let createdAt: Date | undefined;
      if (data['createdAt']) {
        if (data['createdAt'].toDate) {
          createdAt = data['createdAt'].toDate();
        } else if (data['createdAt'] instanceof Date) {
          createdAt = data['createdAt'];
        }
      }
      let updatedAt: Date | undefined;
      if (data['updatedAt']) {
        if (data['updatedAt'].toDate) {
          updatedAt = data['updatedAt'].toDate();
        } else if (data['updatedAt'] instanceof Date) {
          updatedAt = data['updatedAt'];
        }
      }
      return {
        id: doc.id,
        ...data,
        createdAt,
        updatedAt,
      } as InsuranceStatusHistory;
    });

    // 同じ年月の重複を排除（最新のupdatedAtを持つものを優先、なければcreatedAt）
    const uniqueMap = new Map<string, InsuranceStatusHistory>();
    for (const history of histories) {
      const key = `${history.year}_${history.month}`;
      const existing = uniqueMap.get(key);

      if (!existing) {
        uniqueMap.set(key, history);
      } else {
        // より新しい更新日時を持つものを採用
        const existingTime =
          existing.updatedAt || existing.createdAt || new Date(0);
        const currentTime =
          history.updatedAt || history.createdAt || new Date(0);
        if (currentTime > existingTime) {
          uniqueMap.set(key, history);
        }
      }
    }

    // Mapから配列に変換してソート（year, monthで降順ソート）
    const uniqueHistories = Array.from(uniqueMap.values());
    return uniqueHistories.sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year;
      }
      return b.month - a.month;
    });
  }

  /**
   * 従業員情報から社保加入履歴を自動生成
   */
  async generateInsuranceStatusHistory(
    employeeId: string,
    employee: Employee,
    years?: number[]
  ): Promise<void> {
    // 年度が指定されていない場合は、選択可能な年度すべてを生成（2023-2026）
    if (!years) {
      years = [2023, 2024, 2025, 2026];
    }

    for (const year of years) {
      for (let month = 1; month <= 12; month++) {
        // 年齢計算（簡易版）
        const birthDate = new Date(employee.birthDate);
        const targetDate = new Date(year, month - 1, 1);
        let age = targetDate.getFullYear() - birthDate.getFullYear();
        const monthDiff = targetDate.getMonth() - birthDate.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && targetDate.getDate() < birthDate.getDate())
        ) {
          age--;
        }

        // 年齢到達の判定
        let ageMilestone: 40 | 65 | 70 | 75 | undefined;
        if (age === 40) ageMilestone = 40;
        if (age === 65) ageMilestone = 65;
        if (age === 70) ageMilestone = 70;
        if (age === 75) ageMilestone = 75;

        // 健康保険状態
        let healthStatus:
          | 'joined'
          | 'lost'
          | 'exempt_maternity'
          | 'exempt_childcare' = 'joined';
        if (age >= 75) {
          healthStatus = 'lost';
        } else if (this.isInMaternityLeave(employee, year, month)) {
          healthStatus = 'exempt_maternity';
        } else if (this.isInChildcareLeave(employee, year, month)) {
          healthStatus = 'exempt_childcare';
        } else if (employee.retireDate) {
          const retireDate = new Date(employee.retireDate);
          if (
            year === retireDate.getFullYear() &&
            month > retireDate.getMonth() + 1
          ) {
            healthStatus = 'lost';
          }
        }

        // 介護保険状態
        let careStatus:
          | 'joined'
          | 'lost'
          | 'exempt_maternity'
          | 'exempt_childcare'
          | 'type1' = 'joined';
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
        let pensionStatus:
          | 'joined'
          | 'lost'
          | 'exempt_maternity'
          | 'exempt_childcare' = 'joined';
        if (age >= 70) {
          pensionStatus = 'lost';
        } else if (this.isInMaternityLeave(employee, year, month)) {
          pensionStatus = 'exempt_maternity';
        } else if (this.isInChildcareLeave(employee, year, month)) {
          pensionStatus = 'exempt_childcare';
        } else if (employee.retireDate) {
          const retireDate = new Date(employee.retireDate);
          if (
            year === retireDate.getFullYear() &&
            month > retireDate.getMonth() + 1
          ) {
            pensionStatus = 'lost';
          }
        }

        // 既存の履歴を確認（employeeId + year + monthで一意に特定）
        const existingDocId = `${employeeId}_${year}_${month}`;
        const existingRef = doc(
          this.firestore,
          'insuranceStatusHistories',
          existingDocId
        );
        const existingSnap = await getDoc(existingRef);

        // 既存の履歴がない場合も、ある場合も更新（状態が変わっている可能性があるため）
        // IDを指定することで、同じ年月の履歴が重複しないようにする
        await this.saveInsuranceStatusHistory({
          id: existingDocId,
          employeeId,
          year,
          month,
          healthInsuranceStatus: healthStatus,
          careInsuranceStatus: careStatus,
          pensionInsuranceStatus: pensionStatus,
          ageMilestone,
        });
      }
    }
  }

  private isInMaternityLeave(
    employee: Employee,
    year: number,
    month: number
  ): boolean {
    if (!employee.maternityLeaveStart || !employee.maternityLeaveEnd)
      return false;
    const start = new Date(employee.maternityLeaveStart);
    const end = new Date(employee.maternityLeaveEnd);
    const target = new Date(year, month - 1, 1);
    return target >= start && target <= end;
  }

  private isInChildcareLeave(
    employee: Employee,
    year: number,
    month: number
  ): boolean {
    if (!employee.childcareLeaveStart || !employee.childcareLeaveEnd)
      return false;
    const start = new Date(employee.childcareLeaveStart);
    const end = new Date(employee.childcareLeaveEnd);
    const target = new Date(year, month - 1, 1);
    return target >= start && target <= end;
  }
}
