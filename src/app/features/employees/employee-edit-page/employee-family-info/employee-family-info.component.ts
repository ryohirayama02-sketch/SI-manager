import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { FamilyMemberService } from '../../../../services/family-member.service';
import { FamilyMember } from '../../../../models/family-member.model';

@Component({
  selector: 'app-employee-family-info',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-family-info.component.html',
  styleUrl: './employee-family-info.component.css',
})
export class EmployeeFamilyInfoComponent implements OnInit {
  @Input() employeeId: string | null = null;

  familyMembers: FamilyMember[] = [];
  showFamilyForm: boolean = false;
  editingFamilyMember: FamilyMember | null = null;
  familyForm: FormGroup;
  supportReviewAlerts: FamilyMember[] = [];

  constructor(
    private fb: FormBuilder,
    private familyMemberService: FamilyMemberService
  ) {
    this.familyForm = this.fb.group({
      name: ['', Validators.required],
      birthDate: ['', Validators.required],
      relationship: ['', Validators.required],
      livingTogether: [true],
      expectedIncome: [null],
      isThirdCategory: [false],
      supportStartDate: [''],
      supportEndDate: [''],
    });
  }

  /**
   * 年収入力をカンマ付きで表示しつつ、フォーム値は数値として保持
   */
  onExpectedIncomeInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const raw = inputEl.value.replace(/,/g, '').trim();
    if (raw === '') {
      this.familyForm
        .get('expectedIncome')
        ?.setValue(null, { emitEvent: false });
      inputEl.value = '';
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) {
      // 不正入力はクリア
      this.familyForm
        .get('expectedIncome')
        ?.setValue(null, { emitEvent: false });
      inputEl.value = '';
      return;
    }
    this.familyForm.get('expectedIncome')?.setValue(num, { emitEvent: false });
    inputEl.value = num.toLocaleString();
  }

  /**
   * 第3号区分の表示（配偶者のみ判定）
   */
  getThirdCategoryDisplay(member: FamilyMember): string {
    const income = member.expectedIncome;
    const age = this.getFamilyMemberAge(member.birthDate);
    const isSpouse =
      member.relationship === '配偶者' ||
      member.relationship === '妻' ||
      member.relationship === '夫';

    if (!isSpouse) return member.isThirdCategory ? '第3号' : '-';

    // 20歳未満または60歳以上は常にハイフン
    if (age < 20 || age >= 60) return '-';

    // 20-59歳かつ見込年収<1,060,000で第3号、その他はハイフン
    if (
      income !== null &&
      income !== undefined &&
      income < 1060000 &&
      member.isThirdCategory
    ) {
      return '第3号';
    }
    return '-';
  }

  async ngOnInit(): Promise<void> {
    await this.loadFamilyMembers();
  }

  async loadFamilyMembers(): Promise<void> {
    if (!this.employeeId) return;
    this.familyMembers =
      await this.familyMemberService.getFamilyMembersByEmployeeId(
        this.employeeId
      );
    this.supportReviewAlerts = this.familyMemberService.getSupportReviewAlerts(
      this.familyMembers
    );
  }

  showAddFamilyForm(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.editingFamilyMember = null;
    this.familyForm.reset({
      livingTogether: true,
      isThirdCategory: false,
    });
    this.showFamilyForm = true;
  }

  showEditFamilyForm(member: FamilyMember, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.editingFamilyMember = member;
    this.familyForm.patchValue({
      name: member.name,
      birthDate: member.birthDate,
      relationship: member.relationship,
      livingTogether: member.livingTogether,
      expectedIncome: member.expectedIncome ?? null,
      isThirdCategory: member.isThirdCategory,
      supportStartDate: member.supportStartDate || '',
      supportEndDate: member.supportEndDate || '',
    });
    this.showFamilyForm = true;
  }

  cancelFamilyForm(): void {
    this.showFamilyForm = false;
    this.editingFamilyMember = null;
    this.familyForm.reset();
  }

  async saveFamilyMember(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.employeeId || !this.familyForm.valid) {
      if (!this.familyForm.valid) {
        alert('必須項目を入力してください');
      }
      return;
    }

    try {
      const value = this.familyForm.value;
      const incomeNum =
        value.expectedIncome === null || value.expectedIncome === undefined
          ? null
          : Number(value.expectedIncome);
      const age = this.getFamilyMemberAge(value.birthDate);
      const isSpouse = value.relationship === '配偶者';
      const isThirdAuto =
        isSpouse &&
        incomeNum !== null &&
        incomeNum !== undefined &&
        incomeNum < 1060000 &&
        age >= 20 &&
        age < 60;

      const familyMember: FamilyMember = {
        id: this.editingFamilyMember?.id,
        employeeId: this.employeeId,
        name: value.name,
        birthDate: value.birthDate,
        relationship: value.relationship,
        livingTogether: value.livingTogether,
        expectedIncome:
          incomeNum === null || incomeNum === undefined ? undefined : incomeNum,
        // 配偶者のみ自動判定: 20-59歳かつ見込年収<1,060,000で第3号、それ以外はハイフン扱い
        isThirdCategory: isSpouse ? isThirdAuto : value.isThirdCategory,
        supportStartDate: value.supportStartDate || undefined,
        supportEndDate: value.supportEndDate || undefined,
      };

      const savedId = await this.familyMemberService.saveFamilyMember(
        familyMember
      );
      familyMember.id = savedId;

      await this.loadFamilyMembers();
      this.cancelFamilyForm();
      alert('家族情報を保存しました');
    } catch (error) {
      console.error('家族情報の保存エラー:', error);
      alert('家族情報の保存に失敗しました: ' + (error as Error).message);
    }
  }

  async deleteFamilyMember(memberId: string, event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!confirm('この家族情報を削除しますか？')) return;
    await this.familyMemberService.deleteFamilyMember(memberId);
    await this.loadFamilyMembers();
  }

  getFamilyMemberAge(birthDate: string): number {
    return this.familyMemberService.calculateAge(birthDate);
  }

  /**
   * 年金区分を取得（20歳未満は「-」）
   */
  getPensionCategory(member: FamilyMember): string {
    const age = this.getFamilyMemberAge(member.birthDate);
    if (age < 20) {
      return '-';
    }
    return member.isThirdCategory ? '第3号' : '第2号';
  }

  /**
   * 満18歳になった年度末（高校卒業日）を取得
   */
  getAge18Date(birthDate: string): string {
    if (!birthDate) return '-';
    const birth = new Date(birthDate);
    // 満18歳になる年を計算
    const age18Year = birth.getFullYear() + 18;
    // その年の3月31日（年度末）を返す
    return `${age18Year}-03-31`;
  }

  /**
   * 満22歳になった年度末（大学卒業日）を取得
   */
  getAge22Date(birthDate: string): string {
    if (!birthDate) return '-';
    const birth = new Date(birthDate);
    // 満22歳になる年を計算
    const age22Year = birth.getFullYear() + 22;
    // その年の3月31日（年度末）を返す
    return `${age22Year}-03-31`;
  }
}
