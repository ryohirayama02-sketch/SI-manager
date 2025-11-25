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

    // 【一時無効化】ログイン機能を一時停止中
    // TODO: ログイン機能を有効化する際は、以下のコメントアウトを解除して使用
    /*
    // リダイレクト結果を先に処理（Google認証後のリダイレクト戻り）
    console.log('[LoginPage] ngOnInit: リダイレクト結果を確認中');
    const redirectUser = await this.authService.handleRedirectResult();

    if (redirectUser) {
      console.log(
        '[LoginPage] ngOnInit: リダイレクト認証成功 → /room-enter へ遷移'
      );
      // ログイン成功後、ルーム入室画面へ
      this.router.navigate(['/room-enter']);
      return;
    }

    // 認証状態を監視（リダイレクト後の認証状態変化を検知）
    console.log('[LoginPage] ngOnInit: 認証状態の監視を開始');
    setTimeout(() => {
      console.log('[LoginPage] ngOnInit: setTimeout 実行（100ms後）');
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
    }, 100);

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
      '[LoginPage] ngOnInit: リダイレクト結果なし、ログイン画面を表示'
    );
    */

    // 一時的に自動リダイレクトを無効化（ログイン画面を表示したまま）
    console.log(
      '[LoginPage] 【一時無効化】認証チェックと自動リダイレクトをスキップ'
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

      await this.authService.signInWithGoogle();

      // signInWithRedirect は即座にリダイレクトするため、ここには到達しない
      console.log(
        '[LoginPage] onGoogleSignIn: ⚠️ このログは通常表示されない（リダイレクトされるため）'
      );
      console.log(
        '[LoginPage] onGoogleSignIn: このログが表示される場合、リダイレクトが発生していない可能性があります'
      );
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
      this.errorMessage = 'ログインに失敗しました';
      this.isLoading = false;
    }
  }
}
