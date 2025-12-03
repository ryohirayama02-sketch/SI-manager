import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth, User, authState } from '@angular/fire/auth';
import { of } from 'rxjs';

import {
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private auth = inject(Auth);

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
    this.router.navigate(['/login']);
  }

  getCurrentUser(): User | null {
    try {
      return this.auth.currentUser;
    } catch (error) {
      console.error('[AuthService] getCurrentUser: エラー', error);
      return null;
    }
  }

  getAuthState() {
    try {
      return authState(this.auth);
    } catch (error) {
      console.error('[AuthService] getAuthState: エラー', error);
      // エラーが発生した場合は空のObservableを返す
      return of(null);
    }
  }

  // Email/Passwordで新規登録
  async signUpWithEmailAndPassword(
    email: string,
    password: string,
    displayName?: string
  ): Promise<User> {
    // 入力値の検証
    console.log('[AuthService] signUpWithEmailAndPassword: 入力値検証', {
      email: email?.substring(0, 10) + '...',
      emailLength: email?.length,
      passwordLength: password?.length,
      hasDisplayName: !!displayName,
    });

    // 基本的なバリデーション
    if (!email) {
      const error = new Error('メールアドレスを入力してください') as any;
      error.code = 'auth/invalid-email';
      throw error;
    }

    // メールアドレスの形式チェック（より厳密に）
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('[AuthService] メールアドレスの形式が不正:', email);
      const error = new Error(
        'メールアドレスの形式が不正です。正しい形式で入力してください（例：user@example.com）'
      ) as any;
      error.code = 'auth/invalid-email';
      throw error;
    }

    // メールアドレスの前後の空白を削除
    const trimmedEmail = email.trim();
    if (trimmedEmail !== email) {
      console.warn(
        '[AuthService] メールアドレスの前後に空白が含まれていました。空白を削除します。'
      );
    }

    if (!password || password.length < 6) {
      const error = new Error(
        'パスワードは6文字以上である必要があります'
      ) as any;
      error.code = 'auth/weak-password';
      throw error;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        trimmedEmail,
        password
      );
      const user = userCredential.user;

      // 表示名を設定（オプション）
      if (displayName) {
        await updateProfile(user, { displayName });
      }

      return user;
    } catch (error: any) {
      console.error('[AuthService] signUpWithEmailAndPassword: エラー', error);
      console.error('[AuthService] エラー詳細:', {
        code: error?.code,
        message: error?.message,
        name: error?.name,
      });

      // エラーコードに応じた詳細な情報を表示
      switch (error?.code) {
        case 'auth/network-request-failed':
          console.error('[AuthService] ===== ネットワークエラー =====');
          console.error(
            '[AuthService] リクエストは送信されていますが、Firebase側で拒否されました（400 Bad Request）'
          );
          console.error('[AuthService] 考えられる原因:');
          console.error(
            '  1. Email/Password認証が有効になっていない（最も可能性が高い）'
          );
          console.error(
            '     → Firebase Console > Authentication > Sign-in method > Email/Password'
          );
          console.error('     → "Enable" になっているか確認');
          console.error('  2. パスワードが短すぎる（6文字未満）');
          console.error('  3. メールアドレスの形式が不正');
          console.error('  4. reCAPTCHAの問題');
          break;
        case 'auth/email-already-in-use':
          console.error(
            '[AuthService] ===== メールアドレスが既に使用されています ====='
          );
          break;
        case 'auth/invalid-email':
          console.error(
            '[AuthService] ===== メールアドレスの形式が不正です ====='
          );
          console.error('[AuthService] 確認事項:');
          console.error('  - メールアドレスにスペースが含まれていないか');
          console.error('  - @の前に文字があるか（例：@example.com は不可）');
          console.error('  - @の後にドメインがあるか（例：test@ は不可）');
          console.error(
            '  - ドメイン部分に.が含まれているか（例：test@example.com）'
          );
          console.error('  - 正しい形式: user@example.com');
          break;
        case 'auth/weak-password':
          console.error('[AuthService] ===== パスワードが弱すぎます =====');
          console.error(
            '[AuthService] パスワードは6文字以上である必要があります'
          );
          break;
        case 'auth/operation-not-allowed':
          console.error(
            '[AuthService] ===== Email/Password認証が有効になっていません ====='
          );
          console.error(
            '[AuthService] → Firebase Console > Authentication > Sign-in method > Email/Password を有効化してください'
          );
          break;
        default:
          console.error('[AuthService] ===== その他のエラー =====');
          console.error('[AuthService] エラーコード:', error?.code);
      }

      console.error('');
      console.error('[AuthService] 確認方法:');
      console.error('  → ブラウザの開発者ツール > Network タブ');
      console.error('  → "accounts:signUp" リクエストをクリック');
      console.error('  → Response タブでエラーメッセージの詳細を確認');

      throw error;
    }
  }

  // Email/Passwordでログイン
  async signInWithEmailAndPassword(
    email: string,
    password: string
  ): Promise<User> {
    console.log('[AuthService] signInWithEmailAndPassword: 開始', {
      emailLength: email?.length,
      passwordLength: password?.length,
      authInstance: !!this.auth,
      authAppName: this.auth?.app?.name,
    });

    // メールアドレスの前後の空白を削除
    const trimmedEmail = email?.trim() || '';

    // メールアドレスの形式チェック
    if (!trimmedEmail) {
      const error = new Error('メールアドレスを入力してください') as any;
      error.code = 'auth/invalid-email';
      throw error;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      console.error('[AuthService] メールアドレスの形式が不正:', trimmedEmail);
      const error = new Error(
        'メールアドレスの形式が不正です。正しい形式で入力してください（例：user@example.com）'
      ) as any;
      error.code = 'auth/invalid-email';
      throw error;
    }

    console.log('[AuthService] signInWithEmailAndPassword: Firebase API呼び出し前', {
      trimmedEmail: trimmedEmail.substring(0, 10) + '...',
      authReady: !!this.auth,
      authApp: this.auth?.app?.name,
      authAppOptions: this.auth?.app?.options,
      authDomain: this.auth?.app?.options?.authDomain,
      apiKey: this.auth?.app?.options?.apiKey ? '設定済み' : '未設定',
    });

    // Auth インスタンスの詳細な状態を確認
    try {
      console.log('[AuthService] Authインスタンスの詳細確認', {
        authExists: !!this.auth,
        authAppExists: !!this.auth?.app,
        authAppName: this.auth?.app?.name,
        authConfig: {
          authDomain: this.auth?.app?.options?.authDomain,
          apiKey: this.auth?.app?.options?.apiKey ? '設定済み' : '未設定',
          projectId: this.auth?.app?.options?.projectId,
        },
        currentUser: this.auth?.currentUser ? 'あり' : 'なし',
      });
    } catch (checkError) {
      console.error('[AuthService] Authインスタンス確認エラー', checkError);
    }

    try {
      console.log("CALLING signInWithEmailAndPassword", trimmedEmail, password);
      console.log('[AuthService] signInWithEmailAndPassword: firebaseSignInWithEmailAndPassword呼び出し開始');
      console.log('[AuthService] リクエスト送信前のタイムスタンプ:', new Date().toISOString());
      
      // ネットワークリクエストの送信を確認するため、Promise の状態を監視
      const loginPromise = firebaseSignInWithEmailAndPassword(
        this.auth,
        trimmedEmail,
        password
      );
      
      console.log('[AuthService] Promise作成完了、待機中...');
      
      const userCredential = await loginPromise;
      console.log('[AuthService] signInWithEmailAndPassword: 成功', {
        uid: userCredential.user?.uid,
        email: userCredential.user?.email,
      });
      return userCredential.user;
    } catch (error: any) {
      console.error('[AuthService] signInWithEmailAndPassword: エラー', error);
      console.error('[AuthService] エラー詳細:', {
        code: error?.code,
        message: error?.message,
        name: error?.name,
      });

      // エラーコードに応じた詳細な情報を表示
      switch (error?.code) {
        case 'auth/network-request-failed':
          console.error('[AuthService] ===== ネットワークエラー =====');
          console.error(
            '[AuthService] リクエストは送信されていますが、Firebase側で拒否されました（400 Bad Request）'
          );
          console.error('[AuthService] 考えられる原因:');
          console.error(
            '  1. Email/Password認証が有効になっていない（最も可能性が高い）'
          );
          console.error(
            '     → Firebase Console > Authentication > Sign-in method > Email/Password'
          );
          console.error('     → "Enable" になっているか確認');
          console.error('  2. メールアドレスまたはパスワードが間違っている');
          console.error('  3. ユーザーが存在しない');
          break;
        case 'auth/user-not-found':
          console.error('[AuthService] ===== ユーザーが見つかりません =====');
          console.error(
            '[AuthService] このメールアドレスで登録されたユーザーが存在しません'
          );
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          console.error('[AuthService] ===== パスワードが間違っています =====');
          break;
        case 'auth/invalid-email':
          console.error(
            '[AuthService] ===== メールアドレスの形式が不正です ====='
          );
          console.error('[AuthService] 確認事項:');
          console.error('  - メールアドレスにスペースが含まれていないか');
          console.error('  - @の前に文字があるか（例：@example.com は不可）');
          console.error('  - @の後にドメインがあるか（例：test@ は不可）');
          console.error(
            '  - ドメイン部分に.が含まれているか（例：test@example.com）'
          );
          console.error('  - 正しい形式: user@example.com');
          break;
        case 'auth/operation-not-allowed':
          console.error(
            '[AuthService] ===== Email/Password認証が有効になっていません ====='
          );
          console.error(
            '[AuthService] → Firebase Console > Authentication > Sign-in method > Email/Password を有効化してください'
          );
          break;
        default:
          console.error('[AuthService] ===== その他のエラー =====');
          console.error('[AuthService] エラーコード:', error?.code);
      }

      console.error('');
      console.error('[AuthService] 確認方法:');
      console.error('  → ブラウザの開発者ツール > Network タブ');
      console.error('  → "accounts:signInWithPassword" リクエストをクリック');
      console.error('  → Response タブでエラーメッセージの詳細を確認');

      throw error;
    }
  }
}
