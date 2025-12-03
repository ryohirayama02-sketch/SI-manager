import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../../../services/employee.service';
import { StandardRemunerationHistoryService } from '../../../../services/standard-remuneration-history.service';
import { StandardRemunerationHistory, InsuranceStatusHistory } from '../../../../models/standard-remuneration-history.model';

@Component({
  selector: 'app-employee-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-history.component.html',
  styleUrl: './employee-history.component.css'
})
export class EmployeeHistoryComponent implements OnInit {
  @Input() employeeId: string | null = null;

  standardRemunerationHistories: StandardRemunerationHistory[] = [];
  insuranceStatusHistories: InsuranceStatusHistory[] = [];
  selectedHistoryYear: number = new Date().getFullYear();
  isLoadingHistories: boolean = false;

  constructor(
    private employeeService: EmployeeService,
    private standardRemunerationHistoryService: StandardRemunerationHistoryService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadHistories();
  }

  async loadHistories(): Promise<void> {
    if (!this.employeeId) return;
    
    this.isLoadingHistories = true;
    
    try {
      // 従業員情報を取得
      const employee = await this.employeeService.getEmployeeById(this.employeeId);
      if (!employee) return;
      
      // 常に最新の履歴を自動生成
      await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(this.employeeId, employee);
      await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(this.employeeId, employee);
      
      // 標準報酬履歴を読み込み
      this.standardRemunerationHistories = await this.standardRemunerationHistoryService.getStandardRemunerationHistories(this.employeeId);
      
      // 社保加入履歴を読み込み
      this.insuranceStatusHistories = await this.standardRemunerationHistoryService.getInsuranceStatusHistories(this.employeeId);
    } finally {
      this.isLoadingHistories = false;
    }
  }

  async generateHistories(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.employeeId) return;
    
    const employee = await this.employeeService.getEmployeeById(this.employeeId);
    if (!employee) return;

    // 標準報酬履歴を自動生成
    await this.standardRemunerationHistoryService.generateStandardRemunerationHistory(this.employeeId, employee);
    
    // 社保加入履歴を自動生成
    await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(this.employeeId, employee);
    
    await this.loadHistories();
    alert('履歴を自動生成しました');
  }

  getDeterminationReasonLabel(reason: string): string {
    switch (reason) {
      case 'acquisition': return '資格取得時決定';
      case 'teiji': return '定時決定';
      case 'suiji': return '随時改定';
      default: return reason;
    }
  }

  getInsuranceStatusLabel(status: string): string {
    switch (status) {
      case 'joined': return '加入';
      case 'lost': return '喪失';
      case 'exempt_maternity': return '免除（産休）';
      case 'exempt_childcare': return '免除（育休）';
      case 'type1': return '第1号被保険者';
      default: return status;
    }
  }

  async onHistoryYearChange(): Promise<void> {
    // 選択年度の履歴が存在しない場合は自動生成
    const filtered = this.insuranceStatusHistories.filter(h => h.year === this.selectedHistoryYear);
    if (filtered.length === 0 && this.employeeId) {
      this.isLoadingHistories = true;
      try {
        const employee = await this.employeeService.getEmployeeById(this.employeeId);
        if (employee) {
          // 選択年度の履歴を生成
          await this.standardRemunerationHistoryService.generateInsuranceStatusHistory(
            this.employeeId,
            employee,
            [this.selectedHistoryYear]
          );
          // 履歴を再読み込み
          this.insuranceStatusHistories = await this.standardRemunerationHistoryService.getInsuranceStatusHistories(this.employeeId);
        }
      } finally {
        this.isLoadingHistories = false;
      }
    }
  }

  getFilteredInsuranceHistories(): InsuranceStatusHistory[] {
    // 選択年度でフィルタリング
    const filtered = this.insuranceStatusHistories.filter(h => h.year === this.selectedHistoryYear);
    
    // 同じ年月の重複を排除（最新のupdatedAtを持つものを優先、なければcreatedAt）
    const uniqueMap = new Map<string, InsuranceStatusHistory>();
    for (const history of filtered) {
      const key = `${history.year}_${history.month}`;
      const existing = uniqueMap.get(key);
      
      if (!existing) {
        uniqueMap.set(key, history);
      } else {
        // より新しい更新日時を持つものを採用
        const existingTime = existing.updatedAt || existing.createdAt || new Date(0);
        const currentTime = history.updatedAt || history.createdAt || new Date(0);
        if (currentTime > existingTime) {
          uniqueMap.set(key, history);
        }
      }
    }
    
    // Mapから配列に変換してソート（年月で降順）
    return Array.from(uniqueMap.values()).sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year;
      }
      return b.month - a.month;
    });
  }
}





