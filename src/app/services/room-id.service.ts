import { Injectable } from '@angular/core';

/**
 * 現在のルームIDを取得・管理するサービス
 * すべてのFirestore操作でroomIdが必要なため、共通で使用する
 */
@Injectable({ providedIn: 'root' })
export class RoomIdService {
  /**
   * 現在のルームIDを取得する
   * @returns ルームID（存在しない場合はnull）
   */
  getCurrentRoomId(): string | null {
    return sessionStorage.getItem('roomId');
  }

  /**
   * 現在のルームIDを取得する（必須）
   * @throws Error roomIdが存在しない場合
   */
  requireRoomId(): string {
    const roomId = this.getCurrentRoomId();
    if (!roomId) {
      throw new Error('ルームIDが取得できません。ルームに入室してください。');
    }
    return roomId;
  }

  /**
   * ルームIDが設定されているかチェック
   */
  hasRoomId(): boolean {
    return !!this.getCurrentRoomId();
  }

  /**
   * roomId を設定
   */
  setRoomId(roomId: string): void {
    sessionStorage.setItem('roomId', roomId);
  }

  /**
   * roomId をクリア
   */
  clearRoomId(): void {
    sessionStorage.removeItem('roomId');
  }
}
