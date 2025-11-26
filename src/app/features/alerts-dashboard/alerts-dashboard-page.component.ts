import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AlertItemListComponent } from './alert-item-list/alert-item-list.component';

export interface AlertItem {
  id: string;
  employeeName: string;
  alertType: string;
  comment: string;
  targetMonth: string;
}

@Component({
  selector: 'app-alerts-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterModule, AlertItemListComponent],
  templateUrl: './alerts-dashboard-page.component.html',
  styleUrl: './alerts-dashboard-page.component.css'
})
export class AlertsDashboardPageComponent {
  activeTab: 'suiji' | 'notifications' = 'notifications';
  
  // 仮データ（14種類のアラート）
  mockAlerts: AlertItem[] = [
    {
      id: '1',
      employeeName: '佐藤太郎',
      alertType: '資格取得届',
      comment: '新規入社により資格取得',
      targetMonth: '2025年4月'
    },
    {
      id: '2',
      employeeName: '田中花子',
      alertType: '資格喪失届',
      comment: '退職により資格喪失',
      targetMonth: '2025年5月'
    },
    {
      id: '3',
      employeeName: '鈴木一郎',
      alertType: '算定基礎届（定時決定）',
      comment: '4〜6月平均による定時決定',
      targetMonth: '2025年7月'
    },
    {
      id: '4',
      employeeName: '山田次郎',
      alertType: '月額変更届（随時改定）',
      comment: '固定的賃金変動による随時改定',
      targetMonth: '2025年8月'
    },
    {
      id: '5',
      employeeName: '高橋三郎',
      alertType: '賞与支払届',
      comment: '賞与支給により提出必要',
      targetMonth: '2025年6月'
    },
    {
      id: '6',
      employeeName: '伊藤四郎',
      alertType: '産前産後休業取得届',
      comment: '産前産後休業開始',
      targetMonth: '2025年9月'
    },
    {
      id: '7',
      employeeName: '渡辺五郎',
      alertType: '産前産後休業終了届',
      comment: '産前産後休業終了',
      targetMonth: '2025年12月'
    },
    {
      id: '8',
      employeeName: '中村六郎',
      alertType: '育児休業取得届',
      comment: '育児休業開始',
      targetMonth: '2025年10月'
    },
    {
      id: '9',
      employeeName: '小林七郎',
      alertType: '育児休業終了届',
      comment: '育児休業終了',
      targetMonth: '2026年3月'
    },
    {
      id: '10',
      employeeName: '加藤八郎',
      alertType: '（短時間労働者）育休の事業主証明書',
      comment: '短時間労働者の育児休業取得',
      targetMonth: '2025年11月'
    },
    {
      id: '11',
      employeeName: '吉田九郎',
      alertType: '70歳到達（厚年 資格喪失届）',
      comment: '70歳到達により厚生年金資格喪失',
      targetMonth: '2025年7月'
    },
    {
      id: '12',
      employeeName: '山本十郎',
      alertType: '75歳到達（健保 資格喪失届）',
      comment: '75歳到達により健康保険資格喪失',
      targetMonth: '2025年8月'
    },
    {
      id: '13',
      employeeName: '松本十一郎',
      alertType: '同月得喪の届出案内',
      comment: '同月内に資格取得と喪失が発生',
      targetMonth: '2025年9月'
    },
    {
      id: '14',
      employeeName: '井上十二郎',
      alertType: '特定適用事業所パートの資格取得届（週20h超）',
      comment: '週20時間超のパートタイマーが加入対象',
      targetMonth: '2025年6月'
    }
  ];

  setActiveTab(tab: 'suiji' | 'notifications'): void {
    this.activeTab = tab;
  }
}

