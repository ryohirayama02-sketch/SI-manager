import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../services/employee.service';
import { MonthlySalaryService } from '../../services/monthly-salary.service';
import { SettingsService } from '../../services/settings.service';
import { Employee } from '../../models/employee.model';

@Component({
  selector: 'app-monthly-salaries-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  results: { [employeeId: string]: {
    average46: number;
    excludedMonths: number[];
    grade: number;
    standardMonthlyRemuneration: number;
  } } = {};
  suijiCandidates: Array<{
    employeeId: string;
    name: string;
    changedMonth: number;
    avgFixed: number;
    currentGrade: number;
    newGrade: number;
    gradeDiff: number;
    applyMonth: number;
    excludedMonths: number[];
    fixedValues: number[];
  }> = [];
  excludedSuijiReasons: Array<{
    employeeId: string;
    name: string;
    reason: string;
  }> = [];
  rehabSuijiCandidates: Array<{
    employeeId: string;
    name: string;
    changedMonth: number;
    fixedValues: number[];
    avgFixed: number;
    currentGrade: number;
    newGrade: number;
    gradeDiff: number;
    applyMonth: number;
  }> = [];
  
  // エラー・警告メッセージ（従業員IDをキーとする）
  errorMessages: { [employeeId: string]: string[] } = {};
  warningMessages: { [employeeId: string]: string[] } = {};

  constructor(
    private employeeService: EmployeeService,
    private monthlySalaryService: MonthlySalaryService,
    private settingsService: SettingsService
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

  getSalaryKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
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
    
    // 4〜6月の入力が変更された場合は定時決定を再計算
    if (month >= 4 && month <= 6) {
      this.calculateTeijiKettei(employeeId);
    }
    
    this.checkRehabSuiji(employeeId);
  }

  onFixedChange(employeeId: string, month: number): void {
    const key = this.getSalaryKey(employeeId, month);
    if (!this.salaries[key]) {
      this.salaries[key] = { total: 0, fixed: 0, variable: 0 };
    }
    
    // 前月と比較して変動を検出
    if (month > 1) {
      const prevKey = this.getSalaryKey(employeeId, month - 1);
      const prev = this.salaries[prevKey]?.fixed || 0;
      const cur = this.salaries[key].fixed || 0;
      
      // 固定的賃金の変動を検出（前月と異なり、かつ今月が0より大きい）
      if (prev !== cur && cur > 0) {
        this.calculateSuijiKettei(employeeId, month);
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
          const warningMsg = `${empName}の${month}月：固定的賃金が前月から極端に変動しています（前月: ${prev.toLocaleString()}円 → 今月: ${cur.toLocaleString()}円）`;
          if (!this.warningMessages[employeeId].includes(warningMsg)) {
            this.warningMessages[employeeId].push(warningMsg);
          }
        }
      }
    }
    
    this.checkRehabSuiji(employeeId);
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
    const values = [
      salaries[4],
      salaries[5],
      salaries[6]
    ].filter(v => v !== null) as number[];

    if (values.length !== 3) return null;

    const total = values.reduce((sum, v) => sum + v, 0);
    return Math.round(total / 3);
  }

  // 協会けんぽ（一般）標準報酬月額テーブル（簡略化版）
  private readonly STANDARD_TABLE = [
    { rank: 1,  lower: 58000,  upper: 63000,  standard: 58000 },
    { rank: 2,  lower: 63000,  upper: 68000,  standard: 63000 },
    { rank: 3,  lower: 68000,  upper: 73000,  standard: 68000 },
    { rank: 4,  lower: 73000,  upper: 79000,  standard: 73000 },
    { rank: 5,  lower: 79000,  upper: 85000,  standard: 79000 },
    { rank: 6,  lower: 85000,  upper: 91000,  standard: 85000 },
    { rank: 7,  lower: 91000,  upper: 97000,  standard: 91000 },
    { rank: 8,  lower: 97000,  upper: 103000, standard: 97000 },
    { rank: 9,  lower: 103000, upper: 109000, standard: 103000 },
    { rank: 10, lower: 109000, upper: 115000, standard: 109000 },
    { rank: 11, lower: 115000, upper: 122000, standard: 115000 },
    { rank: 12, lower: 122000, upper: 129000, standard: 122000 },
    { rank: 13, lower: 129000, upper: 137000, standard: 129000 },
    // 必要に応じて後続等級も追加可能
  ];

  getStandardMonthlyRemuneration(avg: number | null) {
    if (avg === null) return null;

    const row = this.STANDARD_TABLE.find(
      r => avg >= r.lower && avg < r.upper
    );

    return row ? { rank: row.rank, standard: row.standard } : null;
  }

  calculateInsurancePremiums(
    standard: number,
    age: number
  ) {
    if (!this.rates) return null;

    const r = this.rates;

    const health_employee = r.health_employee;
    const health_employer = r.health_employer;

    const care_employee = age >= 40 && age <= 64 ? r.care_employee : 0;
    const care_employer = age >= 40 && age <= 64 ? r.care_employer : 0;

    // 厚生年金は全国共通（都道府県に依存しない）
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
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
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
    const premiums =
      standard !== null ? this.calculateInsurancePremiums(standard, age) : null;

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

    // 4. 70歳以上なのに厚生年金の保険料が計算されている
    if (age >= 70 && premiums && premiums.pension_employee > 0) {
      const errorMsg = `${emp.name}：70歳以上は厚生年金保険料は発生しません`;
      if (!this.errorMessages[emp.id].includes(errorMsg)) {
        this.errorMessages[emp.id].push(errorMsg);
      }
    }

    // 5. 75歳以上なのに健康保険・介護保険が計算されている
    if (age >= 75 && premiums && (premiums.health_employee > 0 || premiums.care_employee > 0)) {
      const errorMsg = `${emp.name}：75歳以上は健康保険・介護保険は発生しません`;
      if (!this.errorMessages[emp.id].includes(errorMsg)) {
        this.errorMessages[emp.id].push(errorMsg);
      }
    }
  }

  // 定時決定ロジック
  getAprilToJuneValues(employeeId: string): number[] {
    const values: number[] = [];
    for (const month of [4, 5, 6]) {
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = this.salaries[key];
      const value = salaryData?.total || 0;
      values.push(value);
    }
    return values;
  }

  getExcludedMonths(employeeId: string, values: number[]): number[] {
    const excluded: number[] = [];
    const months = [4, 5, 6];
    
    // 4月は前月（3月）と比較
    if (values[0] > 0) {
      const key3 = this.getSalaryKey(employeeId, 3);
      const salaryData3 = this.salaries[key3];
      const prevValue = salaryData3?.total || 0;
      if (prevValue > 0 && values[0] < prevValue * 0.8) {
        excluded.push(4);
      }
    }
    
    // 5月は4月と比較
    if (values[1] > 0 && values[0] > 0 && values[1] < values[0] * 0.8) {
      excluded.push(5);
    }
    
    // 6月は5月と比較
    if (values[2] > 0 && values[1] > 0 && values[2] < values[1] * 0.8) {
      excluded.push(6);
    }
    
    return excluded;
  }

  calculateAverage(values: number[], excludedMonths: number[]): number {
    const months = [4, 5, 6];
    const validValues: number[] = [];
    
    for (let i = 0; i < values.length; i++) {
      const month = months[i];
      if (!excludedMonths.includes(month) && values[i] > 0) {
        validValues.push(values[i]);
      }
    }
    
    if (validValues.length === 0) return 0;
    
    const total = validValues.reduce((sum, v) => sum + v, 0);
    return Math.round(total / validValues.length);
  }

  findGrade(average: number): { grade: number; remuneration: number } | null {
    if (this.gradeTable.length === 0) {
      // Firestoreから読み込めない場合はハードコードされたテーブルを使用
      const row = this.STANDARD_TABLE.find(
        r => average >= r.lower && average < r.upper
      );
      return row ? { grade: row.rank, remuneration: row.standard } : null;
    }
    
    // Firestoreから読み込んだテーブルを使用
    const row = this.gradeTable.find(
      (r: any) => average >= r.lower && average < r.upper
    );
    return row ? { grade: row.rank, remuneration: row.standard } : null;
  }

  calculateTeijiKettei(employeeId: string): void {
    const values = this.getAprilToJuneValues(employeeId);
    const excludedMonths = this.getExcludedMonths(employeeId, values);
    const average46 = this.calculateAverage(values, excludedMonths);
    const gradeResult = this.findGrade(average46);
    
    if (gradeResult) {
      this.results[employeeId] = {
        average46,
        excludedMonths,
        grade: gradeResult.grade,
        standardMonthlyRemuneration: gradeResult.remuneration
      };
    } else {
      this.results[employeeId] = {
        average46,
        excludedMonths,
        grade: 0,
        standardMonthlyRemuneration: 0
      };
    }
  }

  // 随時改定ロジック
  getFixed3Months(employeeId: string, changedMonth: number): number[] {
    const values: number[] = [];
    // changedMonthを含む3ヶ月を取得
    for (let i = 0; i < 3; i++) {
      const month = changedMonth + i;
      if (month > 12) break;
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = this.salaries[key];
      const value = salaryData?.fixed || 0;
      values.push(value);
    }
    return values;
  }

  getExcludedMonthsForSuiji(employeeId: string, months: number[]): number[] {
    const excluded: number[] = [];
    
    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      const key = this.getSalaryKey(employeeId, month);
      const salaryData = this.salaries[key];
      const fixed = salaryData?.fixed || 0;
      const total = salaryData?.total || 0;
      
      // 1. 無給月（total 0）
      if (total === 0) {
        excluded.push(month);
        continue;
      }
      
      // 2. 欠勤控除：前月比20%以上低下
      if (i > 0) {
        const prevMonth = months[i - 1];
        const prevKey = this.getSalaryKey(employeeId, prevMonth);
        const prevSalaryData = this.salaries[prevKey];
        const prevFixed = prevSalaryData?.fixed || 0;
        
        if (prevFixed > 0 && fixed < prevFixed * 0.8) {
          excluded.push(month);
          continue;
        }
      }
      
      // 3. 産前産後休業月（実装簡略化：totalが0の場合は既に除外）
      // 4. 育児休業月（実装簡略化：totalが0の場合は既に除外）
      // 5. 休職月（実装簡略化：totalが0の場合は既に除外）
    }
    
    return excluded;
  }

  calculateAverageForSuiji(fixedValues: number[], excludedMonths: number[], months: number[]): number | null {
    const validValues: number[] = [];
    
    for (let i = 0; i < fixedValues.length; i++) {
      const month = months[i];
      if (!excludedMonths.includes(month) && fixedValues[i] > 0) {
        validValues.push(fixedValues[i]);
      }
    }
    
    // 特例対応
    if (validValues.length === 0) return null;
    if (validValues.length === 1) return validValues[0];
    if (validValues.length === 2) {
      return Math.round((validValues[0] + validValues[1]) / 2);
    }
    // 3ヶ月揃えば平均
    const total = validValues.reduce((sum, v) => sum + v, 0);
    return Math.round(total / validValues.length);
  }

  isWithin3MonthsAfterJoin(employeeId: string, changedMonth: number): boolean {
    const emp = this.employees.find(e => e.id === employeeId);
    if (!emp || !emp.joinDate) return false;
    
    const joinDate = new Date(emp.joinDate);
    const joinYear = joinDate.getFullYear();
    const joinMonth = joinDate.getMonth() + 1;
    
    // 変動月が入社年と同じ場合のみ判定
    if (parseInt(this.year) === joinYear) {
      const monthsDiff = changedMonth - joinMonth;
      return monthsDiff >= 1 && monthsDiff <= 3;
    }
    
    return false;
  }

  calculateSuijiKettei(employeeId: string, changedMonth: number): void {
    // ⑥ 入社後3ヶ月以内rule
    if (this.isWithin3MonthsAfterJoin(employeeId, changedMonth)) {
      const emp = this.employees.find(e => e.id === employeeId);
      const name = emp?.name || '';
      // 既に追加されていないかチェック
      const exists = this.excludedSuijiReasons.find(
        ex => ex.employeeId === employeeId && ex.reason === '資格取得後3か月以内'
      );
      if (!exists) {
        this.excludedSuijiReasons.push({
          employeeId,
          name,
          reason: '資格取得後3か月以内'
        });
      }
      return;
    }
    
    // ② 変動月を含む3ヶ月のfixedを取得
    const fixedValues = this.getFixed3Months(employeeId, changedMonth);
    const months = [];
    for (let i = 0; i < 3; i++) {
      const month = changedMonth + i;
      if (month > 12) break;
      months.push(month);
    }
    
    if (fixedValues.length === 0) return;
    
    // ③ 除外月判定
    const excludedMonths = this.getExcludedMonthsForSuiji(employeeId, months);
    
    // ④ 平均計算（特例対応）
    const avgFixed = this.calculateAverageForSuiji(fixedValues, excludedMonths, months);
    if (avgFixed === null || avgFixed === 0) return;
    
    // ⑤ 現行等級と新等級の比較
    const currentResult = this.results[employeeId];
    const currentGrade = currentResult?.grade || 0;
    
    const newGradeResult = this.findGrade(avgFixed);
    if (!newGradeResult) return;
    
    const newGrade = newGradeResult.grade;
    const gradeDiff = Math.abs(newGrade - currentGrade);
    
    // 2等級以上なら随時改定候補とする
    if (gradeDiff >= 2) {
      const emp = this.employees.find(e => e.id === employeeId);
      const name = emp?.name || '';
      
      // 適用開始月＝変動月 + 4ヶ月
      let applyMonth = changedMonth + 4;
      if (applyMonth > 12) {
        applyMonth = applyMonth - 12;
      }
      
      // ⑦ suijiCandidates[]の更新
      this.suijiCandidates.push({
        employeeId,
        name,
        changedMonth,
        avgFixed,
        currentGrade,
        newGrade,
        gradeDiff,
        applyMonth,
        excludedMonths,
        fixedValues
      });
    }
  }

  checkRehabSuiji(employeeId: string): void {
    const emp = this.employees.find(e => e.id === employeeId);
    if (!emp || !emp.returnFromLeaveDate) return;
    
    const returnDate = new Date(emp.returnFromLeaveDate);
    const returnYear = returnDate.getFullYear();
    const returnMonth = returnDate.getMonth() + 1;
    
    // 復職年が現在の年と異なる場合はスキップ
    if (parseInt(this.year) !== returnYear) return;
    
    // 復職月・翌月・翌々月を監視対象とする
    const targetMonths = [returnMonth, returnMonth + 1, returnMonth + 2].filter(m => m <= 12);
    
    for (const month of targetMonths) {
      // 重複チェック
      const exists = this.rehabSuijiCandidates.find(
        r => r.employeeId === employeeId && r.changedMonth === month
      );
      if (exists) continue;
      
      // 変動月を含む3ヶ月のfixedを取得
      const fixedValues = this.getFixed3Months(employeeId, month);
      if (fixedValues.length < 3) continue;
      
      // 3ヶ月平均を計算
      const total = fixedValues.reduce((sum, v) => sum + v, 0);
      const avgFixed = Math.round(total / 3);
      if (avgFixed === 0) continue;
      
      // 現行等級と新等級の比較
      const currentResult = this.results[employeeId];
      const currentGrade = currentResult?.grade || 0;
      
      const newGradeResult = this.findGrade(avgFixed);
      if (!newGradeResult) continue;
      
      const newGrade = newGradeResult.grade;
      const gradeDiff = Math.abs(newGrade - currentGrade);
      
      // 2等級以上なら復職関連の随時改定候補に追加
      if (gradeDiff >= 2) {
        const name = emp.name || '';
        
        // 適用開始月＝変動月 + 4ヶ月
        let applyMonth = month + 4;
        if (applyMonth > 12) {
          applyMonth = applyMonth - 12;
        }
        
        this.rehabSuijiCandidates.push({
          employeeId,
          name,
          changedMonth: month,
          fixedValues,
          avgFixed,
          currentGrade,
          newGrade,
          gradeDiff,
          applyMonth
        });
      }
    }
  }

  getRehabHighlightMonths(employee: Employee): number[] {
    if (!employee.returnFromLeaveDate) return [];
    
    const returnDate = new Date(employee.returnFromLeaveDate);
    const returnYear = returnDate.getFullYear();
    const returnMonth = returnDate.getMonth() + 1;
    
    // 復職年が現在の年と異なる場合は空配列
    if (parseInt(this.year) !== returnYear) return [];
    
    // 復職月・翌月・翌々月を返す（12月を超えたら無視）
    const result: number[] = [];
    for (let i = 0; i < 3; i++) {
      const month = returnMonth + i;
      if (month <= 12) {
        result.push(month);
      }
    }
    return result;
  }
}

