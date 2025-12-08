import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  NavigationEnd,
} from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { filter, Subscription } from 'rxjs';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent implements OnInit, OnDestroy {
  isAuthenticated = false;
  currentPath = '';
  private authSubscription?: Subscription;
  private routerSubscription?: Subscription;

  // ナビバーを表示しないルート（認証前の画面）
  private readonly publicRoutes = ['/login', '/signup', '/room-enter'];

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    console.log('[Navbar] ngOnInit: 初期化開始');

    // 認証状態を監視
    const authState$ = this.authService.getAuthState();
    if (authState$) {
      console.log('[Navbar] ngOnInit: 認証状態の監視を開始');
      this.authSubscription = authState$.subscribe({
        next: (user: User | null) => {
          this.updateAuthenticationStatus(user);
        },
        error: (error) => {
          console.error('[Navbar] 認証状態エラー:', error);
          this.updateAuthenticationStatus(null);
        },
      });
    } else {
      console.warn(
        '[Navbar] ngOnInit: authState$ が null のため監視をスキップ'
      );
      this.updateAuthenticationStatus(null);
    }

    // 現在のパスを監視
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.currentPath = event.url;
        console.log('[Navbar] ルート変更:', event.url);
        // ルート変更時に認証状態を再評価
        const currentUser = this.authService.getCurrentUser();
        this.updateAuthenticationStatus(currentUser);
      });

    this.currentPath = this.router.url;
    console.log('[Navbar] ngOnInit: 現在のパス', this.currentPath);
    
    // 初期状態を設定
    const currentUser = this.authService.getCurrentUser();
    this.updateAuthenticationStatus(currentUser);

  }

  /**
   * 認証状態を更新し、ナビバーの表示/非表示を決定
   */
  private updateAuthenticationStatus(user: User | null): void {
    const roomId = sessionStorage.getItem('roomId');
    const isPublicRoute = this.publicRoutes.includes(this.currentPath);
    
    // 公開ルート（ログイン、サインアップ、ルーム入室）ではナビバーを表示しない
    if (isPublicRoute) {
      this.isAuthenticated = false;
      console.log('[Navbar] 公開ルートのためナビバーを非表示', {
        path: this.currentPath,
      });
      return;
    }

    // 保護されたルートでは、ユーザーが存在する場合は常にナビバーを表示
    // roomIdは後から設定される可能性があるため、ユーザーが存在することを優先
    this.isAuthenticated = !!user;
    
    console.log('[Navbar] 認証状態更新', {
      hasUser: !!user,
      hasRoomId: !!roomId,
      isAuthenticated: this.isAuthenticated,
      currentPath: this.currentPath,
    });
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
  }

  onLogout(): void {
    console.log('[Navbar] onLogout: ログアウト処理を開始');
    sessionStorage.removeItem('roomId');
    this.authService.signOut();
  }
}
