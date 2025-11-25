import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

export const roomGuard: CanActivateFn = (route, state) => {
  // 【一時無効化】ルームチェック機能を一時停止中
  // TODO: ルームチェック機能を有効化する際は、以下のコメントアウトを解除して使用
  /*
  const router = inject(Router);
  const roomId = sessionStorage.getItem('roomId');

  console.log('[RoomGuard] ルームチェック開始', {
    path: state.url,
    roomId: roomId || 'なし',
  });

  if (roomId) {
    console.log('[RoomGuard] ルーム入室済み → アクセス許可', {
      path: state.url,
    });
    return true;
  } else {
    console.log('[RoomGuard] ルーム未入室 → /room-enter へリダイレクト', {
      path: state.url,
    });
    router.navigate(['/room-enter']);
    return false;
  }
  */

  // 一時的に常にアクセス許可
  console.log('[RoomGuard] 【一時無効化】ルームチェックをスキップ', {
    path: state.url,
  });
  return true;
};
