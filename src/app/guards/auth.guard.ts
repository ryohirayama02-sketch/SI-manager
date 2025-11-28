import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  // 【一時無効化】ログイン機能をコメントアウト - 常にアクセスを許可
  console.log('[AuthGuard] 【一時無効化】認証チェックをスキップ（常に許可）', { path: state.url });
  return true;

  /*
  const authService = inject(AuthService);
  const router = inject(Router);

  console.log('[AuthGuard] 認証チェック開始', { path: state.url });

  return authService.getAuthState().pipe(
    map((user) => {
      if (user) {
        console.log('[AuthGuard] 認証済み → アクセス許可', {
          path: state.url,
          uid: user.uid,
        });
        return true;
      } else {
        console.log('[AuthGuard] 未認証 → /login へリダイレクト', {
          path: state.url,
        });
        router.navigate(['/login']);
        return false;
      }
    })
  );
  */
};
