import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css',
})
export class LoginPageComponent implements OnInit, OnDestroy {
  isLoading = false;
  errorMessage = '';
  private authSubscription?: Subscription;

  constructor(private authService: AuthService, private router: Router) {}

  async ngOnInit(): Promise<void> {
    console.log('[LoginPage] ngOnInit: 初期化開始');
    console.log('[LoginPage] ngOnInit: 現在のURL', window.location.href);

    // 認証状態を監視
    console.log('[LoginPage] ngOnInit: 認証状態の監視を開始');
    const authState$ = this.authService.getAuthState();
    console.log('[LoginPage] ngOnInit: authState$ 取得', {
      hasAuthState: !!authState$,
    });

    if (authState$) {
      console.log('[LoginPage] ngOnInit: authState$ の subscribe を開始');
      this.authSubscription = authState$.subscribe({
        next: (user: User | null) => {
          console.log('[LoginPage] ===== 認証状態変化 =====', {
            hasUser: !!user,
            uid: user?.uid,
            email: user?.email,
          });
          if (user) {
            console.log('[LoginPage] 認証成功を検知 → /room-enter へ遷移');
            this.router.navigate(['/room-enter']);
          } else {
            console.log('[LoginPage] 認証状態: 未認証');
          }
        },
        error: (error) => {
          console.error('[LoginPage] ===== 認証状態エラー =====', error);
        },
        complete: () => {
          console.log('[LoginPage] 認証状態監視: 完了');
        },
      });
    } else {
      console.warn(
        '[LoginPage] ngOnInit: authState$ が null のため監視をスキップ'
      );
    }

    // 既に認証済みの場合はルーム入室画面へ
    const currentUser = this.authService.getCurrentUser();
    console.log(
      '[LoginPage] ngOnInit: 現在のユーザー状態',
      currentUser ? '認証済み' : '未認証'
    );

    if (currentUser) {
      const roomId = sessionStorage.getItem('roomId');
      console.log(
        '[LoginPage] ngOnInit: roomId確認',
        roomId ? `あり: ${roomId}` : 'なし'
      );
      if (roomId) {
        console.log(
          '[LoginPage] ngOnInit: 認証済み・ルーム入室済み → /employees へ遷移'
        );
        this.router.navigate(['/employees']);
        return;
      } else {
        console.log(
          '[LoginPage] ngOnInit: 認証済み・ルーム未入室 → /room-enter へ遷移'
        );
        this.router.navigate(['/room-enter']);
        return;
      }
    }

    console.log(
      '[LoginPage] ngOnInit: ログイン画面を表示'
    );
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  async onGoogleSignIn(): Promise<void> {
    console.log(
      '[LoginPage] onGoogleSignIn: ===== Googleログインボタンクリック ====='
    );
    console.log('[LoginPage] onGoogleSignIn: 現在のURL', window.location.href);

    try {
      this.isLoading = true;
      this.errorMessage = '';
      console.log('[LoginPage] onGoogleSignIn: isLoading を true に設定');
      console.log('[LoginPage] onGoogleSignIn: signInWithGoogle を呼び出し');

      const user = await this.authService.signInWithGoogle();
      
      console.log('[LoginPage] onGoogleSignIn: ログイン成功', {
        uid: user.uid,
        email: user.email,
      });

      // 認証成功後、ルーム入室画面へ遷移（認証状態の監視で自動的に遷移するが、念のため）
      this.isLoading = false;
      this.router.navigate(['/room-enter']);
    } catch (error: any) {
      console.error(
        '[LoginPage] onGoogleSignIn: ===== エラー発生 =====',
        error
      );
      console.error('[LoginPage] onGoogleSignIn: エラー詳細', {
        name: error?.name,
        message: error?.message,
        code: error?.code,
      });
      
      // エラーメッセージを詳細に設定
      let errorMsg = 'ログインに失敗しました。';
      
      if (error?.code === 'auth/network-request-failed') {
        errorMsg = 'ネットワークエラーが発生しました。以下の点を確認してください:\n' +
          '1. インターネット接続を確認してください\n' +
          '2. ブラウザのポップアップブロック設定を確認してください\n' +
          '3. Firebase Consoleで「localhost」が承認済みドメインに追加されているか確認してください';
      } else if (error?.code === 'auth/popup-blocked') {
        errorMsg = 'ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。';
      } else if (error?.code === 'auth/popup-closed-by-user') {
        errorMsg = 'ポップアップが閉じられました。再度お試しください。';
      } else if (error?.message) {
        errorMsg = 'ログインに失敗しました: ' + error.message;
      }
      
      this.errorMessage = errorMsg;
      this.isLoading = false;
    }
  }
}
