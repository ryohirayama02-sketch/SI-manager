import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RoomService } from '../../services/room.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-room-enter-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './room-enter-page.component.html',
  styleUrl: './room-enter-page.component.css',
})
export class RoomEnterPageComponent implements OnInit {
  roomId = '';
  password = '';
  isLoading = false;
  errorMessage = '';

  constructor(
    private roomService: RoomService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    console.log('[RoomEnterPage] ngOnInit: 初期化開始');

    // 【一時無効化】ログイン機能を一時停止中
    // TODO: ログイン機能を有効化する際は、以下のコメントアウトを解除して使用
    /*
    // 未ログインの場合はログイン画面へ
    const currentUser = this.authService.getCurrentUser();
    console.log(
      '[RoomEnterPage] ngOnInit: 現在のユーザー状態',
      currentUser ? '認証済み' : '未認証'
    );

    if (!currentUser) {
      console.log('[RoomEnterPage] ngOnInit: 未認証 → /login へ遷移');
      this.router.navigate(['/login']);
      return;
    }

    // 既にルーム入室済みの場合は従業員一覧へ
    const roomId = sessionStorage.getItem('roomId');
    console.log(
      '[RoomEnterPage] ngOnInit: roomId確認',
      roomId ? `あり: ${roomId}` : 'なし'
    );

    if (roomId) {
      console.log(
        '[RoomEnterPage] ngOnInit: ルーム入室済み → /employees へ遷移'
      );
      this.router.navigate(['/employees']);
      return;
    }

    console.log('[RoomEnterPage] ngOnInit: ルーム入室画面を表示');
    */

    // 一時的に自動リダイレクトを無効化
    console.log(
      '[RoomEnterPage] 【一時無効化】認証チェックと自動リダイレクトをスキップ'
    );
  }

  async onSubmit(): Promise<void> {
    console.log('[RoomEnterPage] onSubmit: フォーム送信', {
      roomId: this.roomId,
    });

    if (!this.roomId || !this.password) {
      console.log(
        '[RoomEnterPage] onSubmit: バリデーションエラー（roomIdまたはpasswordが空）'
      );
      this.errorMessage = 'ルームIDとパスワードを入力してください';
      return;
    }

    try {
      this.isLoading = true;
      this.errorMessage = '';
      console.log('[RoomEnterPage] onSubmit: ルーム認証を開始');

      const isValid = await this.roomService.verifyRoom(
        this.roomId,
        this.password
      );

      console.log(
        '[RoomEnterPage] onSubmit: ルーム認証結果',
        isValid ? '成功' : '失敗'
      );

      if (isValid) {
        // ルームIDをセッションストレージに保存
        sessionStorage.setItem('roomId', this.roomId);
        console.log(
          '[RoomEnterPage] onSubmit: roomIdをセッションストレージに保存',
          this.roomId
        );
        console.log('[RoomEnterPage] onSubmit: /employees へ遷移');
        this.router.navigate(['/employees']);
      } else {
        console.log('[RoomEnterPage] onSubmit: 認証失敗メッセージを表示');
        this.errorMessage = 'ルームIDまたはパスワードが正しくありません';
      }
    } catch (error) {
      console.error('[RoomEnterPage] onSubmit: エラー発生', error);
      this.errorMessage = 'ルーム認証に失敗しました';
    } finally {
      this.isLoading = false;
      console.log('[RoomEnterPage] onSubmit: 処理完了');
    }
  }
}
