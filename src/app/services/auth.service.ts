import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  getAuth,
  User,
  Auth,
} from 'firebase/auth';

import { FirebaseApp } from '@angular/fire/app';
import { authState } from '@angular/fire/auth';
import { of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private firebaseApp = inject(FirebaseApp);
  private _auth: Auth | null = null;

  private get auth(): Auth {
    if (!this._auth) {
      console.log('[AuthService] Firebase Auth インスタンスを初期化');
      this._auth = getAuth(this.firebaseApp);
    }
    return this._auth;
  }

  async signInWithGoogle(): Promise<User> {
    console.log('[AuthService] signInWithGoogle: ===== 開始 =====');
    console.log('[AuthService] signInWithGoogle: Auth インスタンス確認', {
      hasAuth: !!this.auth,
      appName: this.auth.app?.name,
    });

    const provider = new GoogleAuthProvider();
    console.log('[AuthService] signInWithGoogle: GoogleAuthProvider 作成完了');
    console.log(
      '[AuthService] signInWithGoogle: signInWithPopup を呼び出し'
    );

    try {
      const result = await signInWithPopup(this.auth, provider);
      console.log(
        '[AuthService] signInWithGoogle: signInWithPopup 成功',
        {
          uid: result.user.uid,
          email: result.user.email,
        }
      );
      return result.user;
    } catch (error) {
      console.error(
        '[AuthService] signInWithGoogle: signInWithPopup エラー',
        error
      );
      throw error;
    }
  }

  async handleRedirectResult(): Promise<User | null> {
    console.log('[AuthService] handleRedirectResult: ===== 開始 =====');
    console.log(
      '[AuthService] handleRedirectResult: 現在のURL',
      window.location.href
    );
    console.log(
      '[AuthService] handleRedirectResult: URLパラメータ',
      window.location.search
    );
    console.log(
      '[AuthService] handleRedirectResult: URLハッシュ',
      window.location.hash
    );
    console.log('[AuthService] handleRedirectResult: Auth インスタンス確認', {
      hasAuth: !!this.auth,
      currentUser: this.auth.currentUser ? 'あり' : 'なし',
    });

    // URLパラメータとハッシュを詳細に確認
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const urlParamsObj: { [key: string]: string } = {};
    const hashParamsObj: { [key: string]: string } = {};
    urlParams.forEach((value, key) => {
      urlParamsObj[key] = value;
    });
    hashParams.forEach((value, key) => {
      hashParamsObj[key] = value;
    });
    console.log(
      '[AuthService] handleRedirectResult: URL検索パラメータ',
      urlParamsObj
    );
    console.log(
      '[AuthService] handleRedirectResult: URLハッシュパラメータ',
      hashParamsObj
    );

    try {
      console.log(
        '[AuthService] handleRedirectResult: getRedirectResult を呼び出し'
      );
      const result = await getRedirectResult(this.auth);
      console.log('[AuthService] handleRedirectResult: getRedirectResult 完了');
      console.log('[AuthService] handleRedirectResult: 結果の詳細', {
        hasResult: !!result,
        hasUser: !!result?.user,
        operationType: result?.operationType,
      });

      if (result?.user) {
        console.log(
          '[AuthService] handleRedirectResult: ===== 認証成功 =====',
          {
            uid: result.user.uid,
            email: result.user.email,
            displayName: result.user.displayName,
          }
        );
        return result.user;
      } else {
        console.log(
          '[AuthService] handleRedirectResult: ===== リダイレクト結果なし ====='
        );
        console.log('[AuthService] handleRedirectResult: 考えられる原因:');
        console.log(
          '  1. 初回アクセス（まだログインボタンをクリックしていない）'
        );
        console.log('  2. リダイレクトが発生していない');
        console.log('  3. リダイレクト後のURLが正しくない');
        console.log('  4. Firebase Console の設定が正しくない');
        return null;
      }
    } catch (error) {
      console.error(
        '[AuthService] handleRedirectResult: ===== エラー発生 =====',
        error
      );
      console.error('[AuthService] handleRedirectResult: エラー詳細', {
        name: (error as any)?.name,
        message: (error as any)?.message,
        code: (error as any)?.code,
      });
      return null;
    }
  }

  async signOut(): Promise<void> {
    console.log('[AuthService] signOut: ログアウト処理を開始');
    await signOut(this.auth);
    console.log('[AuthService] signOut: ログアウト完了');
    this.router.navigate(['/login']);
  }

  getCurrentUser(): User | null {
    const user = this.auth.currentUser;
    console.log(
      '[AuthService] getCurrentUser:',
      user ? { uid: user.uid, email: user.email } : 'null'
    );
    return user;
  }

  getAuthState() {
    return authState(this.auth as any);
  }
}
