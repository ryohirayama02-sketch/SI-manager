import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
import { SalaryCalculationService, TeijiKetteiResult, SuijiCandidate, RehabSuijiCandidate, ExcludedSuijiReason } from '../../services/salary-calculation.service';
import { Employee } from '../../models/employee.model';

@Component({
  selector: 'app-monthly-salaries-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './monthly-salaries-page.component.html',
  styleUrl: './monthly-salaries-page.component.css'
})
export class MonthlySalariesPageComponent implements OnInit {
  employees: Employee[] = [];
  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // 各従業員×各月の給与データを保持（employeeId-month をキーにする）
  salaryData: { [key: string]: number | null } = {};
  salaries: { [key: string]: { total: number; fixed: number; variable: number } } = {};
  prefecture = 'tokyo';
  year = '2025';
  rates: any = null;
  gradeTable: any[] = [];
  results: { [employeeId: string]: TeijiKetteiResult } = {};
  suijiCandidates: SuijiCandidate[] = [];
  excludedSuijiReasons: ExcludedSuijiReason[] = [];
  rehabSuijiCandidates: RehabSuijiCandidate[] = [];
  
  // エラー・警告メッセージ（従業員IDをキーとする）
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};

  constructor(
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService,
    private salaryCalculationService: SalaryCalculationService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    
    // エラー・警告メッセージを初期化
    for (const emp of this.employees) {
      this.errorMessages[emp.id] = [];
      this.warningMessages[emp.id] = [];
    }
    
    // 都道府県別料率を読み込む
    this.rates = await this.settingsService.getRates(this.year, this.prefecture);
    
    // 標準報酬月額テーブルを読み込む
    this.gradeTable = await this.settingsService.getStandardTable(this.year);
    
    // 全従業員×全月のsalariesオブジェクトを初期化
    for (const emp of this.employees) {
      for (const month of this.months) {
        const key = this.getSalaryKey(emp.id, month);
        if (!this.salaries[key]) {
          this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
        }
      }
    }
    
    await this.loadExistingSalaries();
    
    // 全従業員の定時決定を計算
    for (const emp of this.employees) {
      this.calculateTeijiKettei(emp.id);
    }
  }

  async reloadRates(): Promise<void> {
    this.rates = await this.settingsService.getRates(this.year, this.prefecture);
  }

  onPrefectureChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.prefecture = select.value;
    this.reloadRates();
  }

  getSalaryKey(employeeId: string, month: number): string {
    return this.salaryCalculationService.getSalaryKey(employeeId, month);
  }

  getSalaryData(employeeId: string, month: number): { total: number; fixed: number; variable: number } {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    return this.salaries[key];
  }

  async onSalaryChange(employeeId: string, month: number): Promise<void> {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    
    // バリデーション実行
    this.validateSalaryData(employeeId);
    
    // 4〜6月の入力が変更された場合は定時決定を再計算
    if (month >= 4 && month <= 6) {
      this.calculateTeijiKettei(employeeId);
    }
    
    this.updateRehabSuiji(employeeId);
  }

  onSalaryTotalChange(employeeId: string, month: number, value: string | number): void {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    this.salaries[key].total = value ? Number(value) : 0;
    this.onSalaryChange(employeeId, month);
  }

  onSalaryFixedChange(employeeId: string, month: number, value: string | number): void {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    this.salaries[key].fixed = value ? Number(value) : 0;
    this.onFixedChange(employeeId, month);
  }

  onSalaryVariableChange(employeeId: string, month: number, value: string | number): void {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    this.salaries[key].variable = value ? Number(value) : 0;
    this.onSalaryChange(employeeId, month);
  }

  onFixedChange(employeeId: string, month: number): void {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    
    // バリデーション実行
    this.validateSalaryData(employeeId);
    
    // 前月と比較して変動を検出
    if (month > 1) {
      const prevKey = this.getSalaryKey(employeeId, month - 1);
      const prev = this.salaries[prevKey]?.fixed || 0;
      const cur = this.salaries[key].fixed || 0;
      
      // 固定的賃金の変動を検出（前月と異なり、かつ今月が0より大きい）
      if (prev !== cur && cur > 0) {
        this.updateSuijiKettei(employeeId, month);
      }
      
      // 3. 極端に不自然な固定的賃金の変動チェック（前月比50%以上）
      if (prev > 0 && cur > 0) {
        const changeRate = Math.abs((cur - prev) / prev);
        if (changeRate >= 0.5) {
          if (!this.warningMessages[employeeId]) {
            this.warningMessages[employeeId] = [];
          }
          const emp = this.employees.find(e => e.id === employeeId);
          const empName = emp?.name || '';
          const warningMsg = `${month}月：固定的賃金が前月から極端に変動しています（前月: ${prev.toLocaleString()}円 → 今月: ${cur.toLocaleString()}円）`;
          if (!this.warningMessages[employeeId].includes(warningMsg)) {
            this.warningMessages[employeeId].push(warningMsg);
          }
        }
      }
    }
    
    this.updateRehabSuiji(employeeId);
  }

  calculateInsurancePremiumsForEmployee(employeeId: string, month: number): void {
    // 仮実装：後で実装
    console.log('保険料計算', employeeId, month);
  }

  getSalaryDataKey(employeeId: string, month: number): string {
    return `${employeeId}-${month}`;
  }

  getSalaryValue(employeeId: string, month: number): number | null {
    const key = this.getSalaryDataKey(employeeId, month);
    return this.salaryData[key] || null;
  }

  setSalaryValue(employeeId: string, month: number, value: number | null): void {
    const key = this.getSalaryDataKey(employeeId, month);
    this.salaryData[key] = value;
  }

  onSalaryInput(employeeId: string, month: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const numValue = value ? Number(value) : null;
    this.setSalaryValue(employeeId, month, numValue);
  }

  getEmployeeMonthlySalaries() {
    return this.employees.map(emp => {
      const salaries: { [month: number]: number | null } = {};

      for (const month of this.months) {
        const key = this.getSalaryDataKey(emp.id, month);
        salaries[month] = this.salaryData[key] ?? null;
      }

      return {
        ...emp,
        salaries,
      };
    });
  }

  getAverageForAprToJun(
    salaries: { [month: number]: number | null }
  ): number | null {
    // 4-6月の値を取得
    const values = [
      salaries[4],
      salaries[5],
      salaries[6]
    ].filter(v => v !== null) as number[];

    if (values.length !== 3) return null;

    // サービスメソッドを使用して平均を計算（除外月なし）
    // calculateAverageの新しいシグネチャに合わせて、total/fixed/variable形式に変換
    const salaryDataArray = values.map(total => ({ total, fixed: total, variable: 0 }));
    const result = this.salaryCalculationService.calculateAverage(salaryDataArray, []);
    return result.averageSalary > 0 ? result.averageSalary : null;
  }

  getStandardMonthlyRemuneration(avg: number | null) {
    if (avg === null) return null;
    const result = this.salaryCalculationService.findGrade(this.gradeTable, avg);
    if (!result) return null;
    return { rank: result.grade, standard: result.remuneration };
  }

  calculateInsurancePremiums(
    standard: number,
    age: number
  ) {
    if (!this.rates) return null;
    // このメソッドは後でcalculateMonthlyPremiumsに置き換えられる予定
    const r = this.rates;
    const health_employee = r.health_employee;
    const health_employer = r.health_employer;
    const care_employee = age >= 40 && age <= 64 ? r.care_employee : 0;
    const care_employer = age >= 40 && age <= 64 ? r.care_employer : 0;
    const pension_employee = r.pension_employee;
    const pension_employer = r.pension_employer;

    return {
      health_employee: Math.floor(standard * health_employee),
      health_employer: Math.floor(standard * health_employer),
      care_employee: Math.floor(standard * care_employee),
      care_employer: Math.floor(standard * care_employer),
      pension_employee: Math.floor(standard * pension_employee),
      pension_employer: Math.floor(standard * pension_employer),
    };
  }

  calculateAge(birthDate: string): number {
    return this.salaryCalculationService.calculateAge(birthDate);
  }

  async saveAllSalaries(): Promise<void> {
    const structured = this.getEmployeeMonthlySalaries();

    for (const emp of structured) {
      const avg = this.getAverageForAprToJun(emp.salaries);
      const standardResult = avg !== null ? this.getStandardMonthlyRemuneration(avg) : null;
      const standard = standardResult ? standardResult.standard : null;

      const age = this.calculateAge(emp.birthDate);
      const premiums =
        standard !== null ? this.calculateInsurancePremiums(standard, age) : null;

      const payload = {
        salaries: emp.salaries,
        averageAprToJun: avg,
        standardMonthlyRemuneration: standard,
        premiums
      };

      await this.monthlySalaryService.saveEmployeeSalary(emp.id, 2025, payload);
    }
  }

  async loadExistingSalaries(): Promise<void> {
    for (const emp of this.employees) {
      const data = await this.monthlySalaryService.getEmployeeSalary(emp.id, 2025);
      if (!data || !data.salaries) continue;

      for (const month of this.months) {
        const value = data.salaries[month] ?? null;
        const key = this.getSalaryDataKey(emp.id, month);
        this.salaryData[key] = value;
        // 新しいテーブル用にも読み込む
        const newKey = this.getSalaryKey(emp.id, month);
        if (value !== null) {
          // 既存データはtotalとして扱う
          if (!this.salaries[newKey]) {
            this.salaries[newKey] = { total: 0, fixed: 0, variable: 0 };
          }
          this.salaries[newKey].total = typeof value === 'number' ? value : 0;
        }
      }
    }
  }

  getCalculatedInfo(emp: any) {
    // 新しいテーブル用：salaries オブジェクトから値を取得
    const salaries: { [month: number]: number | null } = {};
    for (const month of this.months) {
      const key = this.getSalaryKey(emp.id, month);
      const salaryData = this.salaries[key];
      salaries[month] = salaryData?.total || null;
    }

    const avg = this.getAverageForAprToJun(salaries);
    const stdResult = avg !== null ? this.getStandardMonthlyRemuneration(avg) : null;
    const standard = stdResult ? stdResult.standard : null;
    const rank = stdResult ? stdResult.rank : null;

    const age = this.calculateAge(emp.birthDate);
    const premiums = standard !== null 
      ? this.salaryCalculationService.calculateMonthlyPremiums(emp, standard, this.rates)
      : null;

    // エラーチェック
    this.checkEmployeeErrors(emp, age, premiums);

    return {
      avg,
      standard,
      rank,
      premiums
    };
  }

  checkEmployeeErrors(emp: any, age: number, premiums: any): void {
    if (!this.errorMessages[emp.id]) {
      this.errorMessages[emp.id] = [];
    }
    if (!this.warningMessages[emp.id]) {
      this.warningMessages[emp.id] = [];
    }

    // 4. 70歳以上なのに厚生年金の保険料が計算されている
    if (age >= 70 && premiums && premiums.pension_employee > 0) {
      const errorMsg = `70歳以上は厚生年金保険料は発生しません`;
      if (!this.errorMessages[emp.id].includes(errorMsg)) {
        this.errorMessages[emp.id].push(errorMsg);
      }
    }

    // 5. 75歳以上なのに健康保険・介護保険が計算されている
    if (age >= 75 && premiums && (premiums.health_employee > 0 || premiums.care_employee > 0)) {
      const errorMsg = `75歳以上は健康保険・介護保険は発生しません`;
      if (!this.errorMessages[emp.id].includes(errorMsg)) {
        this.errorMessages[emp.id].push(errorMsg);
      }
    }
  }

  validateSalaryData(employeeId: string): void {
    if (!this.errorMessages[employeeId]) {
      this.errorMessages[employeeId] = [];
    }
    if (!this.warningMessages[employeeId]) {
      this.warningMessages[employeeId] = [];
    }

    const emp = this.employees.find(e => e.id === employeeId);
    if (!emp) return;

    // 各月の給与データをチェック
    for (const month of this.months) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = this.salaries[key];
      if (!salaryData) continue;

      const total = salaryData.total || 0;
      const fixed = salaryData.fixed || 0;
      const variable = salaryData.variable || 0;

      // 報酬月額の整合性チェック（固定+非固定=総支給）
      if (total > 0 && Math.abs((fixed + variable) - total) > 1) {
        const errorMsg = `${month}月：固定的賃金と非固定的賃金の合計が総支給と一致しません（総支給: ${total.toLocaleString()}円、合計: ${(fixed + variable).toLocaleString()}円）`;
        if (!this.errorMessages[employeeId].includes(errorMsg)) {
          this.errorMessages[employeeId].push(errorMsg);
        }
      }

      // 等級が算出できない場合のチェック（標準報酬月額が算出できない）
      if (total > 0) {
        const stdResult = this.getStandardMonthlyRemuneration(total);
        if (!stdResult || !stdResult.standard) {
          const warningMsg = `${month}月：標準報酬月額テーブルに該当する等級が見つかりません（報酬: ${total.toLocaleString()}円）`;
          if (!this.warningMessages[employeeId].includes(warningMsg)) {
            this.warningMessages[employeeId].push(warningMsg);
          }
        }
      }
    }
  }

  // 定時決定ロジック
  calculateTeijiKettei(employeeId: string): void {
    this.results[employeeId] = this.salaryCalculationService.calculateTeijiKettei(
      employeeId,
      this.salaries,
      this.gradeTable
    );
  }

  // 随時改定ロジック
  updateSuijiKettei(employeeId: string, changedMonth: number): void {
    const result = this.salaryCalculationService.calculateSuijiKettei(
      employeeId,
      changedMonth,
      this.salaries,
      this.gradeTable,
      this.employees,
      this.year,
      this.results
    );

    if (result.excludedReason) {
      // 既に追加されていないかチェック
      const exists = this.excludedSuijiReasons.find(
        ex => ex.employeeId === employeeId && ex.reason === result.excludedReason!.reason
      );
      if (!exists) {
        this.excludedSuijiReasons.push(result.excludedReason);
      }
      return;
    }

    if (result.candidate) {
      // 重複チェック
      const exists = this.suijiCandidates.find(
        c => c.employeeId === employeeId && c.changedMonth === changedMonth
      );
      if (!exists) {
        this.suijiCandidates.push(result.candidate);
      }
    }
  }

  updateRehabSuiji(employeeId: string): void {
    const candidates = this.salaryCalculationService.checkRehabSuiji(
      employeeId,
      this.salaries,
      this.gradeTable,
      this.employees,
      this.year,
      this.results
    );

    // 既存の候補を削除してから新しい候補を追加
    this.rehabSuijiCandidates = this.rehabSuijiCandidates.filter(
      c => c.employeeId !== employeeId
    );

    for (const candidate of candidates) {
      // 重複チェック
      const exists = this.rehabSuijiCandidates.find(
        c => c.employeeId === candidate.employeeId && c.changedMonth === candidate.changedMonth
      );
      if (!exists) {
        this.rehabSuijiCandidates.push(candidate);
      }
    }
  }

  getRehabHighlightMonths(employee: Employee): number[] {
    return this.salaryCalculationService.getRehabHighlightMonths(employee, this.year);
  }
}

