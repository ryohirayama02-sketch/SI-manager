import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UncollectedPremium } from '../../../../models/uncollected-premium.model';
import { Employee } from '../../../../models/employee.model';
import { UncollectedPremiumService } from '../../../../services/uncollected-premium.service';
import { Subscription } from 'rxjs';

/**
 * 徴収不能額を従業員ごとに集計したデータ
 */
export interface UncollectedPremiumSummary {
  employeeId: string;
  employeeName: string;
  totalAmount: number;
  monthlyDetails: UncollectedPremium[];
  resolved: boolean;
}

@Component({
  selector: 'app-alert-uncollected-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './alert-uncollected-tab.component.html',
  styleUrl: './alert-uncollected-tab.component.css'
})
export class AlertUncollectedTabComponent implements OnInit, OnDestroy {
  @Input() employees: Employee[] = [];

  summaries: UncollectedPremiumSummary[] = [];
  expandedEmployees: Set<string> = new Set();
  selectedAlertIds: Set<string> = new Set();
  isLoading = false;
  subscription: Subscription | null = null;

  constructor(
    private uncollectedPremiumService: UncollectedPremiumService
  ) {}

  ngOnInit(): void {
    this.loadUncollectedPremiums();
    // リアルタイム購読（年度フィルタなし）
    this.subscription = this.uncollectedPremiumService.observeUncollectedPremiums()
      .subscribe(premiums => {
        this.processPremiums(premiums);
      });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  async loadUncollectedPremiums(): Promise<void> {
    this.isLoading = true;
    try {
      const premiums = await this.uncollectedPremiumService.getUncollectedPremiums(
        undefined,
        undefined, // 年度フィルタなし（すべての年度）
        false // 未対応のみ
      );
      this.processPremiums(premiums);
    } catch (error) {
      console.error('[AlertUncollectedTab] 徴収不能額の読み込みエラー:', error);
    } finally {
      this.isLoading = false;
    }
  }

  processPremiums(premiums: UncollectedPremium[]): void {
    // 従業員ごとに集計
    const summaryMap = new Map<string, UncollectedPremiumSummary>();

    for (const premium of premiums) {
      if (premium.resolved || premium.amount <= 0) {
        continue;
      }

      if (!summaryMap.has(premium.employeeId)) {
        const employee = this.employees.find(e => e.id === premium.employeeId);
        summaryMap.set(premium.employeeId, {
          employeeId: premium.employeeId,
          employeeName: employee?.name || premium.employeeId,
          totalAmount: 0,
          monthlyDetails: [],
          resolved: false,
        });
      }

      const summary = summaryMap.get(premium.employeeId)!;
      summary.totalAmount += premium.amount;
      summary.monthlyDetails.push(premium);
    }

    // 月順にソート
    for (const summary of summaryMap.values()) {
      summary.monthlyDetails.sort((a, b) => {
        if (a.year !== b.year) {
          return a.year - b.year;
        }
        return a.month - b.month;
      });
    }

    // 合計額の降順でソート
    this.summaries = Array.from(summaryMap.values()).sort(
      (a, b) => b.totalAmount - a.totalAmount
    );
  }

  getEmployeeName(employeeId: string): string {
    const emp = this.employees.find(e => e.id === employeeId);
    return emp?.name || employeeId;
  }

  toggleExpand(employeeId: string): void {
    if (this.expandedEmployees.has(employeeId)) {
      this.expandedEmployees.delete(employeeId);
    } else {
      this.expandedEmployees.add(employeeId);
    }
  }

  isExpanded(employeeId: string): boolean {
    return this.expandedEmployees.has(employeeId);
  }

  toggleAlertSelection(alertId: string): void {
    if (this.selectedAlertIds.has(alertId)) {
      this.selectedAlertIds.delete(alertId);
    } else {
      this.selectedAlertIds.add(alertId);
    }
  }

  isAlertSelected(alertId: string): boolean {
    return this.selectedAlertIds.has(alertId);
  }

  /**
   * サマリーのすべての月次詳細が選択されているかチェック
   */
  isSummaryAllSelected(summary: UncollectedPremiumSummary): boolean {
    if (summary.monthlyDetails.length === 0) {
      return false;
    }
    return summary.monthlyDetails.every(d => {
      if (!d.id) {
        return false;
      }
      return this.isAlertSelected(d.id);
    });
  }

  /**
   * サマリーのすべての月次詳細を選択/解除
   */
  toggleSummarySelection(summary: UncollectedPremiumSummary, event: Event): void {
    const target = event.target as HTMLInputElement;
    if (!target) {
      return;
    }
    const checked = target.checked;
    for (const detail of summary.monthlyDetails) {
      if (detail.id) {
        if (checked) {
          this.selectedAlertIds.add(detail.id);
        } else {
          this.selectedAlertIds.delete(detail.id);
        }
      }
    }
  }

  toggleSelectAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      // 全選択
      for (const summary of this.summaries) {
        for (const detail of summary.monthlyDetails) {
          if (detail.id) {
            this.selectedAlertIds.add(detail.id);
          }
        }
      }
    } else {
      // 全解除
      this.selectedAlertIds.clear();
    }
  }

  isAllSelected(): boolean {
    if (this.summaries.length === 0) {
      return false;
    }
    const totalAlerts = this.summaries.reduce(
      (sum, s) => sum + s.monthlyDetails.filter(d => d.id).length,
      0
    );
    return totalAlerts > 0 && this.selectedAlertIds.size === totalAlerts;
  }

  async markSelectedAsResolved(): Promise<void> {
    if (this.selectedAlertIds.size === 0) {
      return;
    }

    const ids = Array.from(this.selectedAlertIds);
    try {
      await this.uncollectedPremiumService.markAsResolved(ids);
      this.selectedAlertIds.clear();
      // データを再読み込み（リアルタイム購読で自動更新されるが、念のため）
      await this.loadUncollectedPremiums();
    } catch (error) {
      console.error('[AlertUncollectedTab] 対応済み更新エラー:', error);
      alert('対応済みの更新に失敗しました');
    }
  }


  formatAmount(amount: number): string {
    return `¥${amount.toLocaleString()}`;
  }

  formatMonth(year: number, month: number): string {
    return `${year}年${month}月`;
  }
}

