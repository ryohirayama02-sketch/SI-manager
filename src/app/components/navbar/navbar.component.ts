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

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    console.log('[Navbar] ngOnInit: 初期化開始');

    // 認証状態を監視
    const authState$ = this.authService.getAuthState();
    if (authState$) {
      console.log('[Navbar] ngOnInit: 認証状態の監視を開始');
      this.authSubscription = authState$.subscribe({
        next: (user: User | null) => {
          const roomId = sessionStorage.getItem('roomId');
          this.isAuthenticated = !!user && !!roomId;
          console.log('[Navbar] 認証状態更新', {
            hasUser: !!user,
            hasRoomId: !!roomId,
            isAuthenticated: this.isAuthenticated,
          });
        },
        error: (error) => {
          console.error('[Navbar] 認証状態エラー:', error);
          this.isAuthenticated = false;
        },
      });
    } else {
      console.warn(
        '[Navbar] ngOnInit: authState$ が null のため監視をスキップ'
      );
    }

    // 現在のパスを監視
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.currentPath = event.url;
        console.log('[Navbar] ルート変更:', event.url);
      });

    this.currentPath = this.router.url;
    console.log('[Navbar] ngOnInit: 現在のパス', this.currentPath);
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
