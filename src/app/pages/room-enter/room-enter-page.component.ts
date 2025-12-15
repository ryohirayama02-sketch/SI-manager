import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';
import { RoomService } from '../../services/room.service';
import { AuthService } from '../../services/auth.service';
import { Timestamp } from '@angular/fire/firestore';
import { RoomIdService } from '../../services/room-id.service';

@Component({
  selector: 'app-room-enter-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './room-enter-page.component.html',
  styleUrl: './room-enter-page.component.css',
})
export class RoomEnterPageComponent implements OnInit {
  activeTab: 'enter' | 'create' = 'enter';
  roomForm: FormGroup;
  createRoomForm: FormGroup;
  private _isLoading = false;
  errorMessage = '';
  successMessage = '';
  userRooms: { roomId: string; joinedAt?: Date }[] = [];

  get isLoading(): boolean {
    return this._isLoading;
  }

  set isLoading(value: boolean) {
    this._isLoading = value;
    this.updateFormDisabledState();
  }

  constructor(
    private roomService: RoomService,
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private roomIdService: RoomIdService
  ) {
    // 入室フォーム
    this.roomForm = this.fb.group({
      roomId: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });

    // 新規作成フォーム
    this.createRoomForm = this.fb.group(
      {
        roomId: [
          '',
          [Validators.required, Validators.pattern(/^[a-zA-Z0-9_-]+$/)],
        ],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
        companyName: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(form: AbstractControl): ValidationErrors | null {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');

    if (
      password &&
      confirmPassword &&
      password.value !== confirmPassword.value
    ) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  switchTab(tab: 'enter' | 'create'): void {
    this.activeTab = tab;
    this.errorMessage = '';
    this.successMessage = '';
  }

  /**
   * isLoadingの状態に応じてフォームの有効/無効を切り替える
   */
  private updateFormDisabledState(): void {
    if (this.isLoading) {
      this.roomForm.disable();
      this.createRoomForm.disable();
    } else {
      this.roomForm.enable();
      this.createRoomForm.enable();
    }
  }

  ngOnInit(): void {
    console.log('[RoomEnterPage] ngOnInit: 初期化開始');

    // 未ログインの場合はログイン画面へ
    const currentUser = this.authService.getCurrentUser();
    console.log(
      '[RoomEnterPage] ngOnInit: 現在のユーザー状態',
      currentUser ? '認証済み' : '未認証'
    );

    if (!currentUser) {
      console.log('[RoomEnterPage] ngOnInit: 未認証 → /login へ遷移');
      this.router.navigate(['/login']);
      return;
    }

    // 所属ルーム一覧を読み込み
    this.loadUserRooms(currentUser.uid);

    // 既にルーム入室済みの場合は適切な画面へ遷移
    const roomId = sessionStorage.getItem('roomId');
    console.log(
      '[RoomEnterPage] ngOnInit: roomId確認',
      roomId ? `あり: ${roomId}` : 'なし'
    );

    if (roomId) {
      // 初回入室かどうかをチェック
      const visitedKey = `room_visited_${roomId}`;
      const hasVisited = localStorage.getItem(visitedKey);
      if (!hasVisited) {
        // 初回入室: 設定・マスタ画面の保険料率の設定タブへ
        console.log(
          '[RoomEnterPage] ngOnInit: 初回入室 → /settings?tab=rate へ遷移'
        );
        this.router.navigate(['/settings'], { queryParams: { tab: 'rate' } });
      } else {
        // 2回目以降: アラート画面の届出スケジュールタブへ
        console.log('[RoomEnterPage] ngOnInit: 2回目以降 → /alerts へ遷移');
        this.router.navigate(['/alerts']);
      }
      return;
    }

    console.log('[RoomEnterPage] ngOnInit: ルーム入室画面を表示');
  }

  async onSubmit(): Promise<void> {
    if (this.roomForm.invalid) {
      return;
    }

    const { roomId, password } = this.roomForm.value;
    console.log('[RoomEnterPage] onSubmit: フォーム送信', { roomId });

    try {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';
      console.log('[RoomEnterPage] onSubmit: ルーム認証を開始');

      const isValid = await this.roomService.verifyRoom(roomId, password);

      console.log(
        '[RoomEnterPage] onSubmit: ルーム認証結果',
        isValid ? '成功' : '失敗'
      );

      if (isValid) {
        const currentUser = this.authService.getCurrentUser();
        if (!currentUser) {
          this.errorMessage = 'ログインが必要です';
          return;
        }
        await this.roomService.ensureUserRoomMembership(
          currentUser.uid,
          roomId
        );
        // ルームIDをセッションストレージに保存
        this.roomIdService.setRoomId(roomId);
        console.log(
          '[RoomEnterPage] onSubmit: roomIdをセッションストレージに保存',
          roomId
        );

        // 初回入室かどうかをチェック
        const visitedKey = `room_visited_${roomId}`;
        const hasVisited = localStorage.getItem(visitedKey);

        if (!hasVisited) {
          // 初回入室: 設定・マスタ画面の保険料率の設定タブへ
          console.log(
            '[RoomEnterPage] onSubmit: 初回入室 → /settings?tab=rate へ遷移'
          );
          localStorage.setItem(visitedKey, '1');
          // 新規ルーム初回入室フラグ（オンボーディング表示用）
          localStorage.setItem(`room_onboarding_${roomId}`, '1');
          this.router.navigate(['/settings'], { queryParams: { tab: 'rate' } });
        } else {
          // 2回目以降: アラート画面の届出スケジュールタブへ
          console.log('[RoomEnterPage] onSubmit: 2回目以降 → /alerts へ遷移');
          this.router.navigate(['/alerts']);
        }
      } else {
        console.log('[RoomEnterPage] onSubmit: 認証失敗メッセージを表示');
        this.errorMessage = '企業IDまたはパスワードが正しくありません';
      }
    } catch (error) {
      console.error('[RoomEnterPage] onSubmit: エラー発生', error);
      this.errorMessage =
        'ルーム認証に失敗しました。しばらくしてから再度お試しください。';
    } finally {
      this.isLoading = false;
      console.log('[RoomEnterPage] onSubmit: 処理完了');
    }
  }

  async onCreateRoom(): Promise<void> {
    if (this.createRoomForm.invalid) {
      return;
    }

    const { roomId, password, companyName } = this.createRoomForm.value;
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser) {
      this.errorMessage = 'ログインが必要です';
      return;
    }

    console.log('[RoomEnterPage] onCreateRoom: ルーム作成開始', {
      roomId,
      companyName,
    });

    try {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';

      await this.roomService.createRoom(
        roomId,
        password,
        companyName,
        currentUser.uid
      );

      console.log('[RoomEnterPage] onCreateRoom: ルーム作成成功');

      // 所属登録＋自動入室
      await this.roomService.ensureUserRoomMembership(currentUser.uid, roomId);
      this.roomIdService.setRoomId(roomId);
      // 新規ルーム初回入室フラグ（オンボーディング表示用）
      localStorage.setItem(`room_onboarding_${roomId}`, '1');
      // 新規ルーム作成時は設定・マスタ画面の保険料率の設定タブへ（room_visitedフラグは設定しない）
      this.successMessage = 'ルームを作成しました。入室しています...';
      setTimeout(() => {
        this.router.navigate(['/settings'], { queryParams: { tab: 'rate' } });
      }, 1000);
    } catch (error: any) {
      console.error('[RoomEnterPage] onCreateRoom: エラー発生', error);
      this.errorMessage =
        error?.message ||
        'ルーム作成に失敗しました。しばらくしてから再度お試しください。';
    } finally {
      this.isLoading = false;
      console.log('[RoomEnterPage] onCreateRoom: 処理完了');
    }
  }

  private async loadUserRooms(uid: string): Promise<void> {
    try {
      this.userRooms = await this.roomService.getUserRooms(uid);
    } catch (error) {
      console.error('[RoomEnterPage] loadUserRooms: 取得に失敗', error);
    }
  }

  onSelectRoom(roomId: string): void {
    this.roomIdService.setRoomId(roomId);

    // 初回入室かどうかをチェック
    const visitedKey = `room_visited_${roomId}`;
    const hasVisited = localStorage.getItem(visitedKey);

    if (!hasVisited) {
      // 初回入室: 設定・マスタ画面の保険料率の設定タブへ
      localStorage.setItem(visitedKey, '1');
      this.router.navigate(['/settings'], { queryParams: { tab: 'rate' } });
    } else {
      // 2回目以降: アラート画面の届出スケジュールタブへ
      this.router.navigate(['/alerts']);
    }
    // キャッシュや購読の食い残しを防ぐため暫定リロード
    window.location.reload();
  }
}
