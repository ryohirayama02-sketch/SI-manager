import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css',
})
export class LoginPageComponent implements OnInit, OnDestroy {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  private authSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  async ngOnInit(): Promise<void> {
    console.log('[LoginPage] ngOnInit: 初期化開始');

    // 既に認証済みの場合はルーム入室画面へ
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      const roomId = sessionStorage.getItem('roomId');
      if (roomId) {
        this.router.navigate(['/alerts']);
      } else {
        this.router.navigate(['/room-enter']);
      }
      return;
    }

    // 認証状態を監視
    const authState$ = this.authService.getAuthState();
    if (authState$) {
      this.authSubscription = authState$.subscribe({
        next: (user: User | null) => {
          if (user) {
            const roomId = sessionStorage.getItem('roomId');
            if (roomId) {
              this.router.navigate(['/alerts']);
            } else {
              this.router.navigate(['/room-enter']);
            }
          }
        },
      });
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      return;
    }

    const { email, password } = this.loginForm.value;
    
    try {
      this.isLoading = true;
      this.errorMessage = '';
      
      await this.authService.signInWithEmailAndPassword(email, password);
      
      // 認証成功時はauthState$のsubscribeで遷移するため、ここでは何もしない
    } catch (error: any) {
      console.error('[LoginPage] ログインエラー', error);
      
      let errorMsg = 'ログインに失敗しました。';
      if (error?.code === 'auth/user-not-found') {
        errorMsg = 'ユーザーが見つかりません。';
      } else if (error?.code === 'auth/wrong-password') {
        errorMsg = 'パスワードが正しくありません。';
      } else if (error?.code === 'auth/invalid-email') {
        errorMsg = 'メールアドレスの形式が正しくありません。';
      } else if (error?.code === 'auth/invalid-credential') {
        errorMsg = 'メールアドレスまたはパスワードが正しくありません。';
      } else if (error?.code === 'auth/network-request-failed') {
        errorMsg = 'ネットワークエラーが発生しました。\n\n以下の点を確認してください：\n・インターネット接続を確認してください\n・Firebase Consoleで「localhost」が承認済みドメインに追加されているか確認してください\n・ファイアウォールやプロキシの設定を確認してください';
      } else if (error?.message) {
        errorMsg = error.message;
      }
      
      this.errorMessage = errorMsg;
    } finally {
      this.isLoading = false;
    }
  }

  navigateToSignUp(): void {
    this.router.navigate(['/signup']);
  }
}
