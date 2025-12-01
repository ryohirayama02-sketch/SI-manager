import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { SettingsService } from '../../services/settings.service';
import { BonusCalculationService, BonusCalculationResult } from '../../services/bonus-calculation.service';
import { SalaryCalculationService } from '../../services/salary-calculation.service';
import { EmployeeEligibilityService } from '../../services/employee-eligibility.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';
import { BonusInputTableComponent } from './components/bonus-input-table/bonus-input-table.component';
import { BonusCsvImportComponent } from './components/bonus-csv-import/bonus-csv-import.component';


@Component({
  selector: 'app-bonus-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BonusInputTableComponent,
    BonusCsvImportComponent
  ],
  templateUrl: './bonus-page.component.html',
  styleUrl: './bonus-page.component.css'
})
export class BonusPageComponent implements OnInit, OnDestroy {
  employees: Employee[] = [];
  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  // 賞与データ: { employeeId_month: amount }
  bonusData: { [key: string]: number } = {};
  year: number = new Date().getFullYear();
  availableYears: number[] = [];
  rates: any = null;
  prefecture: string = 'tokyo';

  // CSVインポート関連
  csvImportText: string = '';
  csvImportResult: { type: 'success' | 'error'; message: string } | null = null;
  // 加入区分購読用
  eligibilitySubscription: Subscription | null = null;
  // 免除月情報（従業員IDをキーとする）
  exemptMonths: { [employeeId: string]: number[] } = {};
  // 免除理由情報（従業員ID_月をキーとする）
  exemptReasons: { [key: string]: string } = {};

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private settingsService: SettingsService,
    private bonusCalculationService: BonusCalculationService,
    private salaryCalculationService: SalaryCalculationService,
    private employeeEligibilityService: EmployeeEligibilityService
  ) {
    // 年度選択用の年度リストを生成（2023〜2026）
    for (let y = 2023; y <= 2026; y++) {
      this.availableYears.push(y);
    }
  }

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);

    // 全従業員×全月のbonusDataオブジェクトを初期化
    for (const emp of this.employees) {
      for (const month of this.months) {
        const key = this.getBonusKey(emp.id, month);
        if (!this.bonusData[key]) {
          this.bonusData[key] = 0;
        }
      }
    }

    await this.loadExistingBonuses();

    // 免除月を構築
    this.buildExemptMonths();

    // 加入区分の変更を購読
    this.eligibilitySubscription = this.employeeEligibilityService.observeEligibility().subscribe(() => {
      // 加入区分が変更された場合の処理（必要に応じて実装）
    });
  }

  ngOnDestroy(): void {
    this.eligibilitySubscription?.unsubscribe();
  }

  getBonusKey(employeeId: string, month: number): string {
    return `${employeeId}_${month}`;
  }

  async onYearChange(): Promise<void> {
    // 年度変更時にデータを再読み込み
    this.rates = await this.settingsService.getRates(this.year.toString(), this.prefecture);
    await this.loadExistingBonuses();
    // 免除月を再構築
    this.buildExemptMonths();
  }

  buildExemptMonths(): void {
    this.exemptMonths = {};
    this.exemptReasons = {};
    for (const emp of this.employees) {
      this.exemptMonths[emp.id] = [];

      for (const month of this.months) {
        // 各月の免除判定（Service層のメソッドを使用）
        const exemptResult = this.salaryCalculationService.getExemptReasonForMonth(
          emp,
          this.year,
          month
        );
        if (exemptResult.exempt) {
          if (!this.exemptMonths[emp.id].includes(month)) {
            this.exemptMonths[emp.id].push(month);
          }
          // 免除理由を保存
          const key = `${emp.id}_${month}`;
          this.exemptReasons[key] = exemptResult.reason;
        }
      }
    }
  }
  
  getExemptReason(employeeId: string, month: number): string {
    const key = `${employeeId}_${month}`;
    const reason = this.exemptReasons[key] || '';
    // 理由から「産休中」「育休中」を判定
    if (reason.includes('産前産後休業')) {
      return '産休中';
    } else if (reason.includes('育児休業')) {
      return '育休中';
    }
    return '免除中'; // フォールバック
  }

  async loadExistingBonuses(): Promise<void> {
    // 月次給与入力画面と同じパターン：各従業員ごとにループしてデータを取得
    for (const emp of this.employees) {
      // 各従業員の賞与データを取得
      const bonuses = await this.bonusService.loadBonus(this.year, emp.id);
      console.log(`[bonus-page] 既存賞与データ読み込み: 年度=${this.year}, 従業員ID=${emp.id}, 件数=${bonuses.length}`, bonuses);
      
      for (const bonus of bonuses) {
        // monthが文字列の場合は数値に変換
        const month = typeof bonus.month === 'string' ? parseInt(bonus.month, 10) : bonus.month;
        if (isNaN(month) || month < 1 || month > 12) {
          console.warn(`[bonus-page] 不正なmonth値:`, bonus);
          continue;
        }
        
        const key = this.getBonusKey(bonus.employeeId, month);
        // 月次給与入力画面と同じように、直接プロパティを更新
        this.bonusData[key] = bonus.amount || 0;
        console.log(`[bonus-page] 賞与データ設定: 従業員ID=${bonus.employeeId}, 月=${month}, 金額=${bonus.amount}, キー=${key}`);
      }
    }
    
    console.log(`[bonus-page] 読み込み完了: bonusData=`, this.bonusData);
  }

  async onBonusChange(event: { employeeId: string; month: number; value: number }): Promise<void> {
    const { employeeId, month, value } = event;
    const key = this.getBonusKey(employeeId, month);
    // 月次給与入力画面と同じように、直接プロパティを更新
    this.bonusData[key] = value;
    console.log(`[bonus-page] 賞与変更: 従業員ID=${employeeId}, 月=${month}, 金額=${value}, キー=${key}`);
  }

  async saveAllBonuses(): Promise<void> {
    for (const emp of this.employees) {
      for (const month of this.months) {
        const key = this.getBonusKey(emp.id, month);
        let amount = this.bonusData[key] || 0;

        // 免除月の場合は0として明示的に保存（賞与入力画面が免除を判定してデータを保証）
        if (this.exemptMonths[emp.id]?.includes(month)) {
          amount = 0;
          console.log(`[bonus-page] 免除月のため0として保存: 従業員ID=${emp.id}, 月=${month}`);
        }

        // 賞与額が0より大きい場合、または免除月で0として保存する場合
        if (amount > 0 || this.exemptMonths[emp.id]?.includes(month)) {
          // 賞与額が入力されている場合のみ保存
          const employee = this.employees.find(e => e.id === emp.id);
          if (!employee) continue;

          // 既存の賞与データを取得（createdAtを保持するため）
          const existingBonuses = await this.bonusService.getBonusesByYear(emp.id, this.year);
          const existingBonus = existingBonuses.find(b => b.month === month);

          const paymentDate = `${this.year}-${String(month).padStart(2, '0')}-01`;

          // 賞与を計算
          const calculationResult = await this.bonusCalculationService.calculateBonus(
            employee,
            emp.id,
            amount,
            paymentDate,
            this.year
          );

          if (!calculationResult) {
            console.error(`賞与計算に失敗: 従業員ID=${emp.id}, 月=${month}, 賞与額=${amount}`);
            continue;
          }

          // Bonusオブジェクトを作成（既存データがある場合はcreatedAtを保持）
          // createdAtはFirestoreのTimestampオブジェクトの可能性があるため、Dateに変換するかundefinedにしてsaveBonusで処理させる
          let createdAtValue: any = undefined;
          if (existingBonus?.createdAt) {
            try {
              // FirestoreのTimestampオブジェクトかどうかを判定
              if (existingBonus.createdAt && typeof existingBonus.createdAt === 'object' && 'toDate' in existingBonus.createdAt && typeof (existingBonus.createdAt as any).toDate === 'function') {
                // FirestoreのTimestampオブジェクトの場合はDateに変換
                createdAtValue = (existingBonus.createdAt as any).toDate();
              } else if (existingBonus.createdAt instanceof Date) {
                // Dateオブジェクトの場合はそのまま使用
                createdAtValue = existingBonus.createdAt;
              }
              // その他の場合はundefinedにしてsaveBonusで処理させる
            } catch (error) {
              console.warn(`[bonus-page] createdAtの変換エラー:`, error);
              // エラーが発生した場合はundefinedにしてsaveBonusで処理させる
            }
          }
          
          const bonus: Bonus = {
            employeeId: emp.id,
            year: this.year,
            month: month,
            amount: amount,
            payDate: paymentDate,
            // 既存データがある場合はcreatedAtを保持、ない場合はundefinedにしてsaveBonusで処理させる
            createdAt: createdAtValue,
            isExempt: calculationResult.isExempted || false,
            cappedHealth: calculationResult.cappedBonusHealth || 0,
            cappedPension: calculationResult.cappedBonusPension || 0,
            healthEmployee: calculationResult.healthEmployee,
            healthEmployer: calculationResult.healthEmployer,
            careEmployee: calculationResult.careEmployee,
            careEmployer: calculationResult.careEmployer,
            pensionEmployee: calculationResult.pensionEmployee,
            pensionEmployer: calculationResult.pensionEmployer,
            standardBonusAmount: calculationResult.standardBonus,
            cappedBonusHealth: calculationResult.cappedBonusHealth,
            cappedBonusPension: calculationResult.cappedBonusPension,
            isExempted: calculationResult.isExempted,
            isRetiredNoLastDay: calculationResult.isRetiredNoLastDay,
            isOverAge70: calculationResult.isOverAge70,
            isOverAge75: calculationResult.isOverAge75,
            requireReport: calculationResult.requireReport,
            reportDeadline: calculationResult.reportDeadline || undefined,
            isSalaryInsteadOfBonus: calculationResult.isSalaryInsteadOfBonus,
            exemptReason: calculationResult.exemptReason || undefined
          };

          await this.bonusService.saveBonus(this.year, bonus);
        } else if (!this.exemptMonths[emp.id]?.includes(month)) {
          // 賞与額が0で、免除月でない場合は、既存データがあれば削除
          // 免除月の場合は0として保存済みなので削除しない
          const existingBonuses = await this.bonusService.getBonusesByYear(emp.id, this.year);
          const existingBonus = existingBonuses.find(b => b.month === month);
          if (existingBonus && existingBonus.id) {
            await this.bonusService.deleteBonus(this.year, emp.id, existingBonus.id);
          }
        }
      }
    }

    alert('賞与データを保存しました');
  }


  // CSVインポート処理（フォーマット: 月,従業員,賞与額）
  async onCsvTextImport(csvText: string): Promise<void> {
    this.csvImportText = csvText;
    await this.importFromCsvText(csvText);
  }

  onCsvImportClose(): void {
    this.csvImportText = '';
    this.csvImportResult = null;
  }

  parseAmount(value: string): number {
    // カンマを削除して数値に変換
    const numStr = value.replace(/,/g, '');
    const num = parseInt(numStr, 10);
    return isNaN(num) ? 0 : num;
  }

  async importFromCsvText(csvText?: string): Promise<void> {
    // 引数が渡されていない場合は、プロパティから取得
    const textToImport = csvText || this.csvImportText;
    
    if (!textToImport.trim()) {
      this.csvImportResult = { type: 'error', message: 'CSVデータが入力されていません' };
      return;
    }

    try {
      const lines = textToImport.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        this.csvImportResult = { type: 'error', message: 'CSVデータが不正です（最低2行必要：ヘッダー＋データ行）' };
        return;
      }

      // ヘッダー行をパース
      const headerLine = lines[0];
      const headerParts = headerLine.split(',').map(p => p.trim());
      
      if (headerParts.length < 3) {
        this.csvImportResult = { type: 'error', message: 'ヘッダー行が不正です（3列必要：月,従業員,賞与額）' };
        return;
      }

      // ヘッダーから各列のインデックスを取得
      const monthIndex = headerParts.indexOf('月');
      const employeeIndex = headerParts.indexOf('従業員');
      const bonusAmountIndex = headerParts.indexOf('賞与額');
      
      if (monthIndex === -1 || employeeIndex === -1 || bonusAmountIndex === -1) {
        this.csvImportResult = { type: 'error', message: 'ヘッダーに「月」「従業員」「賞与額」の列が必要です' };
        return;
      }

      // データ行を処理
      const dataLines = lines.slice(1);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const line of dataLines) {
        const parts = line.split(',').map(p => p.trim());
        
        if (parts.length < headerParts.length) {
          errorCount++;
          errors.push(`行「${line}」: 列数が不足しています`);
          continue;
        }

        // 月を取得
        const monthStr = parts[monthIndex];
        const month = parseInt(monthStr, 10);
        
        if (isNaN(month) || month < 1 || month > 12) {
          errorCount++;
          errors.push(`行「${line}」: 月が不正です（1〜12の範囲）`);
          continue;
        }

        // 従業員名を取得
        const employeeName = parts[employeeIndex];
        const employee = this.employees.find(emp => emp.name === employeeName);
        
        if (!employee) {
          errorCount++;
          errors.push(`行「${line}」: 従業員「${employeeName}」が見つかりません`);
          continue;
        }

        // 賞与額を取得
        const bonusAmountStr = parts[bonusAmountIndex];
        const bonusAmount = this.parseAmount(bonusAmountStr);
        
        if (isNaN(bonusAmount) || bonusAmount < 0) {
          errorCount++;
          errors.push(`行「${line}」: 賞与額が不正です`);
          continue;
        }

        // bonusDataに値を設定
        const key = this.getBonusKey(employee.id, month);
        this.bonusData[key] = bonusAmount;

        successCount++;
      }

      // 結果メッセージ
      if (errorCount > 0) {
        this.csvImportResult = {
          type: 'error',
          message: `${successCount}件のインポートに成功しましたが、${errorCount}件のエラーがあります。${errors.slice(0, 5).join(' / ')}${errors.length > 5 ? ' ...' : ''}`
        };
      } else {
        this.csvImportResult = {
          type: 'success',
          message: `${successCount}件のデータをインポートしました`
        };
        this.csvImportText = '';
      }
    } catch (error) {
      console.error('CSVインポートエラー:', error);
      this.csvImportResult = { type: 'error', message: `インポート中にエラーが発生しました: ${error}` };
    }
  }
}

