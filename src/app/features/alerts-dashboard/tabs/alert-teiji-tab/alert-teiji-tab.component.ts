import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface TeijiKetteiResultData {
  employeeId: string;
  employeeName: string;
  aprilSalary: number;
  aprilWorkingDays: number;
  maySalary: number;
  mayWorkingDays: number;
  juneSalary: number;
  juneWorkingDays: number;
  averageSalary: number;
  excludedMonths: number[];
  exclusionCandidates: number[]; // 平均額との差が10%以上の月
  teijiResult: any;
}

@Component({
  selector: 'app-alert-teiji-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './alert-teiji-tab.component.html',
  styleUrl: './alert-teiji-tab.component.css'
})
export class AlertTeijiTabComponent {
  @Input() teijiKetteiResults: TeijiKetteiResultData[] = [];
  @Input() teijiYear: number = new Date().getFullYear();
  @Input() availableYears: number[] = [];
  @Input() isLoadingTeijiKettei: boolean = false;
  @Output() yearChange = new EventEmitter<number>();

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }

  /**
   * 定時決定（算定基礎届）の提出期日を取得
   * 期日は7月10日
   */
  getTeijiReportDeadline(year: number): string {
    const deadlineDate = new Date(year, 6, 10); // 7月 = 6 (0-indexed)
    return this.formatDate(deadlineDate);
  }

  /**
   * 算定決定タブの年度変更ハンドラ
   */
  onTeijiYearChange(): void {
    this.yearChange.emit(this.teijiYear);
  }
}



