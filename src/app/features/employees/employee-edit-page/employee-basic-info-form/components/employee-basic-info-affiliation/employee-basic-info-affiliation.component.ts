import { Component, OnInit, Input, OnChanges, SimpleChanges, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormGroup } from '@angular/forms';
import { OfficeService } from '../../../../../../services/office.service';
import { Office } from '../../../../../../models/office.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-employee-basic-info-affiliation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './employee-basic-info-affiliation.component.html',
  styleUrl: './employee-basic-info-affiliation.component.css'
})
export class EmployeeBasicInfoAffiliationComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
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
    
    // 既存の事業所番号と都道府県から事業所を特定
    const officeNumber = this.form.get('officeNumber')?.value;
    const prefecture = this.form.get('prefecture')?.value;
    
    if (officeNumber && prefecture) {
      const matchingOffice = this.offices.find(
        office => office.officeNumber === officeNumber && office.prefecture === prefecture
      );
      if (matchingOffice?.id) {
        this.selectedOfficeId = matchingOffice.id;
        // 変更検出をトリガー
        this.cdr.detectChanges();
      } else {
        this.selectedOfficeId = null;
        this.cdr.detectChanges();
      }
    } else {
      this.selectedOfficeId = null;
      this.cdr.detectChanges();
    }
  }

  onOfficeChange(officeId: string): void {
    this.selectedOfficeId = officeId;
    const selectedOffice = this.offices.find(office => office.id === officeId);
    
    if (selectedOffice) {
      // 事業所を選択したら、都道府県と事業所番号を自動設定
      this.form.patchValue({
        prefecture: selectedOffice.prefecture || 'tokyo',
        officeNumber: selectedOffice.officeNumber || ''
      });
      // バリデーション状態を更新
      this.form.get('officeNumber')?.markAsTouched();
    } else {
      // 事業所が選択されていない場合はクリア
      this.form.patchValue({
        prefecture: 'tokyo',
        officeNumber: ''
      });
      // バリデーション状態を更新
      this.form.get('officeNumber')?.markAsTouched();
    }
  }

  getOfficeDisplayName(office: Office): string {
    const address = office.address || '';
    return address || '住所未設定';
  }
}
