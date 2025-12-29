import {
  Component,
  OnInit,
  Input,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormsModule,
  FormGroup,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { OfficeService } from '../../../../../../services/office.service';
import { Office } from '../../../../../../models/office.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-employee-basic-info-affiliation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './employee-basic-info-affiliation.component.html',
  styleUrl: './employee-basic-info-affiliation.component.css',
})
export class EmployeeBasicInfoAffiliationComponent
  implements OnInit, OnChanges, AfterViewInit, OnDestroy
{
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;

  offices: Office[] = [];
  selectedOfficeId: string | null = null;
  private officesLoaded = false;
  private formValueSubscription?: Subscription;

  constructor(
    private officeService: OfficeService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    // 事業所一覧を取得
    this.offices = await this.officeService.getAllOffices();
    this.officesLoaded = true;

    // フォームの値が既に設定されている場合は事業所を特定
    this.updateSelectedOffice();

    // フォームの値の変更を監視
    if (this.form) {
      this.formValueSubscription = this.form.valueChanges.subscribe(() => {
        this.updateSelectedOffice();
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // フォームが変更された場合、事業所を再特定
    if (changes['form'] && this.officesLoaded) {
      // 既存のサブスクリプションを解除
      this.formValueSubscription?.unsubscribe();

      // 新しいフォームの値変更を監視
      if (this.form) {
        this.formValueSubscription = this.form.valueChanges.subscribe(() => {
          this.updateSelectedOffice();
        });
      }

      this.updateSelectedOffice();
    }
  }

  ngAfterViewInit(): void {
    // ビューが初期化された後、再度事業所を特定（フォームの値が設定されている可能性がある）
    if (this.officesLoaded) {
      setTimeout(() => {
        this.updateSelectedOffice();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.formValueSubscription?.unsubscribe();
  }

  private updateSelectedOffice(): void {
    if (!this.form) return;

    // selectedOfficeIdが既に設定されている場合は、それを優先（officeNumberが空でも事業所が選択されている可能性がある）
    const existingSelectedOfficeId = this.form.get('selectedOfficeId')?.value;
    if (existingSelectedOfficeId && existingSelectedOfficeId !== null) {
      const matchingOfficeById = this.offices.find(
        (office) => office.id === existingSelectedOfficeId
      );
      if (matchingOfficeById) {
        this.selectedOfficeId = existingSelectedOfficeId;
        this.cdr.detectChanges();
        return;
      }
    }

    // 既存の事業所番号と都道府県から事業所を特定
    let officeNumber = this.form.get('officeNumber')?.value;
    const prefecture = this.form.get('prefecture')?.value;

    // officeNumberの正規化: 文字列'null'をnullに変換
    if (officeNumber === 'null' || officeNumber === 'undefined') {
      officeNumber = null;
    }
    if (officeNumber === '') {
      officeNumber = null;
    }

    if (officeNumber && prefecture) {
      const matchingOffice = this.offices.find(
        (office) =>
          office.officeNumber === officeNumber &&
          office.prefecture === prefecture
      );

      if (matchingOffice?.id) {
        this.selectedOfficeId = matchingOffice.id;
        // フォームにもselectedOfficeIdを設定
        this.form.patchValue(
          { selectedOfficeId: matchingOffice.id },
          { emitEvent: false }
        );
        // 変更検出をトリガー
        this.cdr.detectChanges();
      } else {
        // officeNumberが設定されていてもマッチしない場合は、selectedOfficeIdをクリアしない（ユーザーが選択した事業所を保持）
        if (!existingSelectedOfficeId) {
          this.selectedOfficeId = null;
          // フォームにもselectedOfficeIdをクリア
          this.form.patchValue(
            { selectedOfficeId: null },
            { emitEvent: false }
          );
          this.cdr.detectChanges();
        }
      }
    } else {
      // officeNumberが空でも、selectedOfficeIdが設定されている場合は保持
      if (!existingSelectedOfficeId) {
        this.selectedOfficeId = null;
        // フォームにもselectedOfficeIdをクリア
        this.form.patchValue({ selectedOfficeId: null }, { emitEvent: false });
        this.cdr.detectChanges();
      }
    }
  }

  onOfficeChange(officeId: string): void {
    this.selectedOfficeId = officeId;
    const selectedOffice = this.offices.find(
      (office) => office.id === officeId
    );

    if (selectedOffice) {
      // 事業所を選択したら、都道府県と事業所番号を自動設定
      const officeNumberValue = selectedOffice.officeNumber || '';

      // selectedOfficeIdコントロールが存在するか確認してから設定
      const selectedOfficeIdControl = this.form.get('selectedOfficeId');
      if (selectedOfficeIdControl) {
        selectedOfficeIdControl.setValue(officeId);
      }

      this.form.patchValue({
        prefecture: selectedOffice.prefecture || 'tokyo',
        officeNumber: officeNumberValue,
      });

      // officeNumberが空でも事業所が選択されていればバリデーションエラーをクリア
      const officeNumberControl = this.form.get('officeNumber');
      if (officeNumberControl && !officeNumberValue) {
        // カスタムバリデーターを設定: 事業所が選択されていればofficeNumberが空でも有効
        officeNumberControl.setValidators([]);
        officeNumberControl.updateValueAndValidity();
      }
      // バリデーション状態を更新
      this.form.get('officeNumber')?.markAsTouched();
    } else {
      // 事業所が選択されていない場合はクリアし、必須バリデーターを復元
      const officeNumberControl = this.form.get('officeNumber');
      if (officeNumberControl) {
        officeNumberControl.setValidators([this.requiredValidator]);
        officeNumberControl.updateValueAndValidity();
      }
      this.form.patchValue({
        prefecture: 'tokyo',
        officeNumber: '',
        selectedOfficeId: null, // 事業所IDをクリア
      });
      // バリデーション状態を更新
      this.form.get('officeNumber')?.markAsTouched();
    }
  }

  // 必須バリデーター（事業所が選択されていない場合に使用）
  private requiredValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') {
      return { required: true };
    }
    return null;
  }

  getOfficeDisplayName(office: Office): string {
    const address = office.address || '';
    return address || '住所未設定';
  }
}
