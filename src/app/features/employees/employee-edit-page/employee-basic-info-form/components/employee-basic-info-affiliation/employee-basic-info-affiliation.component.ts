import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { OfficeService } from '../../../../../../services/office.service';
import { Office } from '../../../../../../models/office.model';

@Component({
  selector: 'app-employee-basic-info-affiliation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './employee-basic-info-affiliation.component.html',
  styleUrl: './employee-basic-info-affiliation.component.css'
})
export class EmployeeBasicInfoAffiliationComponent implements OnInit {
  @Input() form!: FormGroup;
  @Input() employeeId: string | null = null;

  offices: Office[] = [];
  selectedOfficeId: string | null = null;

  constructor(
    private officeService: OfficeService
  ) {}

  async ngOnInit(): Promise<void> {
    // 事業所一覧を取得
    this.offices = await this.officeService.getAllOffices();
    
    // 既存の事業所番号と都道府県から事業所を特定
    const officeNumber = this.form.get('officeNumber')?.value;
    const prefecture = this.form.get('prefecture')?.value;
    
    if (officeNumber && prefecture) {
      const matchingOffice = this.offices.find(
        office => office.officeNumber === officeNumber && office.prefecture === prefecture
      );
      if (matchingOffice?.id) {
        this.selectedOfficeId = matchingOffice.id;
      }
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
    } else {
      // 事業所が選択されていない場合はクリア
      this.form.patchValue({
        prefecture: 'tokyo',
        officeNumber: ''
      });
    }
  }

  getOfficeDisplayName(office: Office): string {
    const code = office.officeCode || '';
    const number = office.officeNumber || '';
    const address = office.address || '';
    if (code && number) {
      return `${code}-${number}${address ? ` (${address})` : ''}`;
    }
    return address || '事業所名未設定';
  }
}
