import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../services/employee.service';
import { BonusService } from '../../services/bonus.service';
import { SettingsService } from '../../services/settings.service';
import { Employee } from '../../models/employee.model';
import { Bonus } from '../../models/bonus.model';

@Component({
  selector: 'app-bonus-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bonus-page.component.html',
  styleUrl: './bonus-page.component.css'
})
export class BonusPageComponent implements OnInit {
  employees: Employee[] = [];
  selectedEmployeeId: string = '';
  bonusAmount: number | null = null;
  paymentDate: string = '';
  rates: any = null;
  year: string = '2025';
  prefecture: string = 'tokyo';

  // 計算結果
  calculationResult: {
    healthEmployee: number;
    healthEmployer: number;
    careEmployee: number;
    careEmployer: number;
    pensionEmployee: number;
    pensionEmployer: number;
    needsNotification: boolean;
    deadline: string;
    standardBonus?: number;
    cappedBonusHealth?: number;
    cappedBonusPension?: number;
    isExempted?: boolean;
    isRetiredNoLastDay?: boolean;
    isOverAge70?: boolean;
    isOverAge75?: boolean;
    reason_exempt_maternity?: boolean;
    reason_exempt_childcare?: boolean;
    reason_not_lastday_retired?: boolean;
    reason_age70?: boolean;
    reason_age75?: boolean;
    reason_bonus_to_salary?: boolean;
    reason_upper_limit_health?: boolean;
    reason_upper_limit_pension?: boolean;
    reasons?: string[];
    requireReport?: boolean;
    reportReason?: string;
    reportDeadline?: string | null;
    bonusCountLast12Months?: number;
    isSalaryInsteadOfBonus?: boolean;
    reason_bonus_to_salary_text?: string;
    exemptReason?: string;
    errorMessages?: string[];
    warningMessages?: string[];
  } | null = null;

  constructor(
    private employeeService: EmployeeService,
    private bonusService: BonusService,
    private settingsService: SettingsService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employees = await this.employeeService.getAllEmployees();
    this.rates = await this.settingsService.getRates(this.year, this.prefecture);
  }

  calculateAge(birthDate: string): number {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  public onInputChange(): void {
    this.updateBonusCalculation().catch(err => console.error('計算エラー:', err));
  }

  async updateBonusCalculation(): Promise<void> {
    if (!this.selectedEmployeeId || this.bonusAmount === null || this.bonusAmount < 0 || !this.paymentDate || !this.rates) {
      this.calculationResult = null;
      return;
    }

    const employee = this.employees.find(e => e.id === this.selectedEmployeeId);
    if (!employee) {
      this.calculationResult = null;
      return;
    }

    const payDate = new Date(this.paymentDate);
    const payYear = payDate.getFullYear();
    const payMonth = payDate.getMonth() + 1;
    const payDay = payDate.getDate();
    const lastDayOfMonth = new Date(payYear, payMonth, 0).getDate();

    // 1. 標準賞与額（1,000円未満切り捨て）
    const standardBonus = Math.floor(this.bonusAmount / 1000) * 1000;

    // 2. 健保・介保：年度累計 573 万円の上限（今回支給で調整）
    // 注：年度累計は別途管理が必要だが、今回は今回支給分のみを上限で調整
    const HEALTH_CARE_ANNUAL_LIMIT = 5730000;
    const cappedBonusHealth = Math.min(standardBonus, HEALTH_CARE_ANNUAL_LIMIT);
    const reason_upper_limit_health = standardBonus > HEALTH_CARE_ANNUAL_LIMIT;

    // 3. 厚年：1 回 150 万円上限
    const PENSION_SINGLE_LIMIT = 1500000;
    const cappedBonusPension = Math.min(standardBonus, PENSION_SINGLE_LIMIT);
    const reason_upper_limit_pension = standardBonus > PENSION_SINGLE_LIMIT;

    // 4. 退職月 → 月末在籍がなければ賞与保険料 0 円
    const isRetiredNoLastDay = employee.retireDate ? (() => {
      const retireDate = new Date(employee.retireDate);
      const retireYear = retireDate.getFullYear();
      const retireMonth = retireDate.getMonth() + 1;
      const retireDay = retireDate.getDate();
      // 退職月が支給月と同じで、退職日が月末より前の場合
      if (retireYear === payYear && retireMonth === payMonth) {
        return retireDay < lastDayOfMonth;
      }
      return false;
    })() : false;

    // 5. 産休・育休中の賞与 → 健保・厚年の免除
    let reason_exempt_maternity = false;
    let reason_exempt_childcare = false;
    let exemptReason: string | undefined = undefined;
    
    // A. 産休の免除判定
    if (employee.maternityLeaveStart && employee.maternityLeaveEnd) {
      const matStart = new Date(employee.maternityLeaveStart);
      const matEnd = new Date(employee.maternityLeaveEnd);
      if (payDate >= matStart && payDate <= matEnd) {
        reason_exempt_maternity = true;
        exemptReason = "産休期間中のため免除";
      }
    }
    
    // B. 育休の免除判定（3条件すべて満たす必要がある）
    if (employee.childcareLeaveStart && employee.childcareLeaveEnd) {
      const childStart = new Date(employee.childcareLeaveStart);
      const childEnd = new Date(employee.childcareLeaveEnd);
      const isInChildcarePeriod = payDate >= childStart && payDate <= childEnd;
      const isNotificationSubmitted = employee.childcareNotificationSubmitted === true;
      const isLivingTogether = employee.childcareLivingTogether === true;
      
      if (isInChildcarePeriod) {
        if (isNotificationSubmitted && isLivingTogether) {
          // 3条件すべて満たす場合：免除
          reason_exempt_childcare = true;
          exemptReason = "育休（届出済・同居）期間中のため免除";
        } else {
          // 条件を満たさない場合：理由を設定
          reason_exempt_childcare = false;
          const reasons: string[] = [];
          if (!isNotificationSubmitted) {
            reasons.push("届出未提出");
          }
          if (!isLivingTogether) {
            reasons.push("子と同居していない");
          }
          exemptReason = `育休中だが${reasons.join("・")}のため免除されません`;
        }
      }
    }
    
    const isExempted = reason_exempt_maternity || reason_exempt_childcare;

    // 6. 年齢到達（70歳・75歳）の特例処理
    const age = this.calculateAge(employee.birthDate);
    const birthDate = new Date(employee.birthDate);
    const birthYear = birthDate.getFullYear();
    const birthMonth = birthDate.getMonth() + 1;
    
    // 70歳到達月 → 厚年保険料を停止
    const isOverAge70 = (() => {
      const age70Year = birthYear + 70;
      return payYear === age70Year && payMonth >= birthMonth;
    })();
    const reason_age70 = isOverAge70;

    // 75歳到達月 → 健保/介保保険料を停止
    const isOverAge75 = (() => {
      const age75Year = birthYear + 75;
      return payYear === age75Year && payMonth >= birthMonth;
    })();
    const reason_age75 = isOverAge75;
    
    const reason_not_lastday_retired = isRetiredNoLastDay;

    // 保険料計算のベース額を決定
    let healthBase = 0;
    let pensionBase = 0;

    if (!isRetiredNoLastDay && !isExempted && !isOverAge75) {
      healthBase = cappedBonusHealth;
    }

    if (!isRetiredNoLastDay && !isExempted && !isOverAge70) {
      pensionBase = cappedBonusPension;
    }

    // 賞与→給与扱いの判定（過去12ヶ月で1回のみ、または4回目以降）
    const pastBonuses = await this.bonusService.getBonusesByEmployee(this.selectedEmployeeId, payDate);
    // 現在入力中の賞与も含めて支給回数をカウント
    const bonusCount = pastBonuses.length + 1;
    const bonusCountLast12Months = await this.bonusService.getBonusCountLast12Months(this.selectedEmployeeId, payDate);
    
    let isSalaryInsteadOfBonus = false;
    let reason_bonus_to_salary_text: string | undefined = undefined;
    
    if (bonusCount === 1) {
      // 過去12ヶ月で1回のみの場合
      isSalaryInsteadOfBonus = true;
      reason_bonus_to_salary_text = "過去12ヶ月の賞与支給回数が1回のため給与扱いとなります。";
    } else if (bonusCountLast12Months >= 3) {
      // 過去12ヶ月で4回目以降の場合（既存ロジック）
      isSalaryInsteadOfBonus = true;
      reason_bonus_to_salary_text = "過去1年間の賞与支給回数が3回を超えているため、今回の支給は賞与ではなく給与として扱われます。";
    }
    
    const reason_bonus_to_salary = isSalaryInsteadOfBonus;
    
    // 賞与→給与扱いの場合は保険料を0に
    if (isSalaryInsteadOfBonus) {
      healthBase = 0;
      pensionBase = 0;
    }

    const isCareEligible = age >= 40 && age <= 64 && !isOverAge75;

    // 健康保険料
    const healthEmployee = Math.floor(healthBase * this.rates.health_employee);
    const healthEmployer = Math.floor(healthBase * this.rates.health_employer);

    // 介護保険料（40-64歳のみ、かつ75歳未満）
    const careEmployee = isCareEligible ? Math.floor(healthBase * this.rates.care_employee) : 0;
    const careEmployer = isCareEligible ? Math.floor(healthBase * this.rates.care_employer) : 0;

    // 厚生年金料
    const pensionEmployee = Math.floor(pensionBase * this.rates.pension_employee);
    const pensionEmployer = Math.floor(pensionBase * this.rates.pension_employer);

    // 理由の配列を生成
    const reasons: string[] = [];
    
    if (reason_exempt_maternity) {
      reasons.push('産前産後休業中のため、賞与保険料は免除されます');
    }
    
    if (reason_exempt_childcare) {
      reasons.push('育児休業中のため、賞与保険料は免除されます');
    }
    
    if (reason_not_lastday_retired) {
      reasons.push('退職日の関係で月末在籍がないため、賞与は社会保険料の対象外です');
      reasons.push('退職月の月末在籍が無いため賞与支払届は不要');
    }
    
    if (reason_age70) {
      reasons.push('70歳到達月のため厚生年金の賞与保険料は停止されます');
    }
    
    if (reason_age75) {
      reasons.push('75歳到達月のため健保・介保の賞与保険料は停止されます');
    }
    
    if (reason_bonus_to_salary) {
      reasons.push('過去1年間の賞与支給回数が3回を超えているため、今回の支給は賞与ではなく給与として扱われます。');
    }
    
    if (reason_upper_limit_health) {
      reasons.push(`健保・介保の年度上限（573万円）を適用しました（標準賞与額: ${standardBonus.toLocaleString()}円 → 上限適用後: ${cappedBonusHealth.toLocaleString()}円）`);
    }
    
    if (reason_upper_limit_pension) {
      reasons.push(`厚生年金の1回あたり上限（150万円）を適用しました（標準賞与額: ${standardBonus.toLocaleString()}円 → 上限適用後: ${cappedBonusPension.toLocaleString()}円）`);
    }

    // 賞与支払届の提出要否判定
    let requireReport = true;
    let reportReason = '';
    let reportDeadline: string | null = null;

    // 提出不要の条件をチェック
    if (isRetiredNoLastDay) {
      requireReport = false;
      reportReason = '退職月の月末在籍が無いため賞与支払届は不要です';
    } else if (isExempted) {
      requireReport = false;
      if (reason_exempt_maternity) {
        reportReason = '産前産後休業中の賞与は免除対象のため賞与支払届は不要です';
      } else if (reason_exempt_childcare) {
        reportReason = '育児休業中の賞与は免除対象のため賞与支払届は不要です';
      } else {
        reportReason = '産休/育休中の賞与は免除対象のため賞与支払届は不要です';
      }
      if (reason_exempt_maternity || reason_exempt_childcare) {
        reasons.push('産休/育休中の賞与は免除対象のため賞与支払届は不要');
      }
    } else if (isOverAge75) {
      requireReport = false;
      reportReason = '75歳到達月で健康保険・介護保険の資格喪失のため賞与支払届は不要です';
    } else if (reason_bonus_to_salary) {
      requireReport = false;
      reportReason = '年度内4回目以降の賞与は給与扱いとなるため賞与支払届は不要です';
    } else {
      // 提出が必要な場合
      requireReport = true;
      reportReason = '支給された賞与は社会保険の対象となるため、賞与支払届が必要です';
      
      // 提出期限：支給日 + 5日
      const deadlineDate = new Date(payDate);
      deadlineDate.setDate(deadlineDate.getDate() + 5);
      reportDeadline = deadlineDate.toISOString().split('T')[0];
    }

    // 賞与支払届が必要か（賞与額が0より大きい場合）
    const needsNotification = this.bonusAmount > 0;

    // 提出期限（支給日の翌月10日）
    const deadline = new Date(payDate.getFullYear(), payDate.getMonth() + 1, 10);
    const deadlineStr = deadline.toISOString().split('T')[0];

    // エラーチェック
    const errorMessages: string[] = [];
    const warningMessages: string[] = [];

    // 1. 賞与の支給日が入社前または退職後
    if (employee.joinDate) {
      const joinDate = new Date(employee.joinDate);
      if (payDate < joinDate) {
        errorMessages.push("支給日が在籍期間外です（入社前）");
      }
    }
    if (employee.retireDate) {
      const retireDate = new Date(employee.retireDate);
      if (payDate > retireDate) {
        errorMessages.push("支給日が在籍期間外です（退職後）");
      }
    }

    // 2. 育休 or 産休免除の条件不整合
    if (employee.maternityLeaveStart && employee.maternityLeaveEnd && 
        employee.childcareLeaveStart && employee.childcareLeaveEnd) {
      const matStart = new Date(employee.maternityLeaveStart);
      const matEnd = new Date(employee.maternityLeaveEnd);
      const childStart = new Date(employee.childcareLeaveStart);
      const childEnd = new Date(employee.childcareLeaveEnd);
      
      // 産休と育休が重複しているかチェック
      if ((matStart <= childEnd && matEnd >= childStart)) {
        // 重複している場合、育休が産休の直後でない場合は不整合
        const daysBetween = (childStart.getTime() - matEnd.getTime()) / (1000 * 60 * 60 * 24);
        if (daysBetween > 30) {
          errorMessages.push("産休・育休の設定が矛盾しています");
        }
      }
    }
    
    // 育休期間中なのに届出未提出だが免除されている場合のチェック
    if (employee.childcareLeaveStart && employee.childcareLeaveEnd) {
      const childStart = new Date(employee.childcareLeaveStart);
      const childEnd = new Date(employee.childcareLeaveEnd);
      if (payDate >= childStart && payDate <= childEnd) {
        const isNotificationSubmitted = employee.childcareNotificationSubmitted === true;
        const isLivingTogether = employee.childcareLivingTogether === true;
        // 育休期間中で免除されているのに、届出未提出または同居していない場合は矛盾
        if (isExempted && reason_exempt_childcare && (!isNotificationSubmitted || !isLivingTogether)) {
          errorMessages.push("育休期間中で届出未提出または子と同居していないのに、免除されています。設定を確認してください");
        }
      }
    }

    // 4. 70歳以上なのに厚生年金の保険料が計算されている
    if (age >= 70 && pensionEmployee > 0 && !isOverAge70) {
      errorMessages.push("70歳以上は厚生年金保険料は発生しません");
    }

    // 5. 75歳以上なのに健康保険・介護保険が計算されている
    if (age >= 75 && (healthEmployee > 0 || careEmployee > 0) && !isOverAge75) {
      errorMessages.push("75歳以上は健康保険・介護保険は発生しません");
    }

    // 6. 賞与 → 給与扱いの誤判定
    // bonusCount と bonusCountLast12Months の整合性チェック
    // bonusCount は過去12ヶ月の賞与数 + 1（現在入力中の賞与）
    // bonusCountLast12Months は過去365日間の賞与数
    // 両者が大きく異なる場合は矛盾の可能性がある
    if (bonusCountLast12Months !== undefined && Math.abs(bonusCount - (bonusCountLast12Months + 1)) > 2) {
      errorMessages.push("賞与の支給回数ロジックに矛盾があります");
    }

    this.calculationResult = {
      healthEmployee,
      healthEmployer,
      careEmployee,
      careEmployer,
      pensionEmployee,
      pensionEmployer,
      needsNotification,
      deadline: deadlineStr,
      standardBonus,
      cappedBonusHealth,
      cappedBonusPension,
      isExempted,
      isRetiredNoLastDay,
      isOverAge70,
      isOverAge75,
      reason_exempt_maternity,
      reason_exempt_childcare,
      reason_not_lastday_retired,
      reason_age70,
      reason_age75,
      reason_bonus_to_salary,
      reason_upper_limit_health,
      reason_upper_limit_pension,
      reasons,
      requireReport,
      reportReason,
      reportDeadline,
      bonusCountLast12Months,
      isSalaryInsteadOfBonus,
      reason_bonus_to_salary_text,
      exemptReason,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
      warningMessages: warningMessages.length > 0 ? warningMessages : undefined
    };
  }

  async onSubmit(): Promise<void> {
    // バリデーション
    if (!this.selectedEmployeeId) {
      alert('従業員を選択してください');
      return;
    }

    if (this.bonusAmount === null || this.bonusAmount < 0) {
      alert('賞与額は0以上を入力してください');
      return;
    }

    if (!this.paymentDate) {
      alert('支給日を入力してください');
      return;
    }

    // 計算結果が無い場合は計算を実行
    if (!this.calculationResult) {
      this.updateBonusCalculation();
    }

    if (!this.calculationResult) {
      alert('保険料の計算に失敗しました');
      return;
    }

    // 標準賞与額（1,000円未満切り捨て）
    const standardBonusAmount = Math.floor((this.bonusAmount || 0) / 1000) * 1000;

    // Bonusオブジェクトを作成（calculationResultと統合）
    const bonus: Bonus = {
      employeeId: this.selectedEmployeeId,
      amount: this.bonusAmount,
      payDate: this.paymentDate,
      createdAt: new Date(),
      healthEmployee: this.calculationResult.healthEmployee,
      healthEmployer: this.calculationResult.healthEmployer,
      careEmployee: this.calculationResult.careEmployee,
      careEmployer: this.calculationResult.careEmployer,
      pensionEmployee: this.calculationResult.pensionEmployee,
      pensionEmployer: this.calculationResult.pensionEmployer,
      standardBonusAmount: this.calculationResult.standardBonus,
      cappedBonusHealth: this.calculationResult.cappedBonusHealth,
      cappedBonusPension: this.calculationResult.cappedBonusPension,
      isExempted: this.calculationResult.isExempted,
      isRetiredNoLastDay: this.calculationResult.isRetiredNoLastDay,
      isOverAge70: this.calculationResult.isOverAge70,
      isOverAge75: this.calculationResult.isOverAge75,
      requireReport: this.calculationResult.requireReport,
      reportDeadline: this.calculationResult.reportDeadline || undefined,
      isSalaryInsteadOfBonus: this.calculationResult.isSalaryInsteadOfBonus
    };

    try {
      await this.bonusService.addBonus(bonus);
      alert('賞与データを保存しました');
      
      // フォームリセット
      this.selectedEmployeeId = '';
      this.bonusAmount = null;
      this.paymentDate = '';
      this.calculationResult = null;
    } catch (error) {
      console.error('賞与登録エラー:', error);
      alert('登録に失敗しました');
    }
  }
}

