import { Injectable } from '@angular/core';
import { NotificationDecisionResult } from './notification-decision.service';

/**
 * 届出に関するフォーマット処理を行うサービス
 * 表示用の文字列生成やフォーマット変換を担当
 */
@Injectable({ providedIn: 'root' })
export class NotificationFormatService {
  /**
   * 届出種類の表示名を取得
   * @param type 届出種類
   * @returns 表示名
   */
  getNotificationTypeLabel(type: 'teiji' | 'suiji' | 'bonus'): string {
    switch (type) {
      case 'teiji':
        return '定時決定';
      case 'suiji':
        return '随時改定';
      case 'bonus':
        return '賞与支払届';
      default:
        return type;
    }
  }

  /**
   * 届出理由文をフォーマットする
   * @param notification 届出要否判定結果
   * @returns フォーマットされた理由文
   */
  formatReportReason(notification: NotificationDecisionResult): string {
    return notification.reasons.join(' / ');
  }
}

