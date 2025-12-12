import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

export const roomGuard: CanActivateFn = (route, state) => {
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
};
