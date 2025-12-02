import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { RoomService } from '../../services/room.service';
import { AuthService } from '../../services/auth.service';

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
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private roomService: RoomService,
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder
  ) {
    // 入室フォーム
    this.roomForm = this.fb.group({
      roomId: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });

    // 新規作成フォーム
    this.createRoomForm = this.fb.group({
      roomId: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_-]+$/)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      companyName: ['', [Validators.required]],
    }, { validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(form: AbstractControl): ValidationErrors | null {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
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

    // 既にルーム入室済みの場合は従業員一覧へ
    const roomId = sessionStorage.getItem('roomId');
    console.log(
      '[RoomEnterPage] ngOnInit: roomId確認',
      roomId ? `あり: ${roomId}` : 'なし'
    );

    if (roomId) {
      console.log(
        '[RoomEnterPage] ngOnInit: ルーム入室済み → /alerts へ遷移'
      );
      this.router.navigate(['/alerts']);
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
        // ルームIDをセッションストレージに保存
        sessionStorage.setItem('roomId', roomId);
        console.log(
          '[RoomEnterPage] onSubmit: roomIdをセッションストレージに保存',
          roomId
        );
        console.log('[RoomEnterPage] onSubmit: /alerts へ遷移');
        this.router.navigate(['/alerts']);
      } else {
        console.log('[RoomEnterPage] onSubmit: 認証失敗メッセージを表示');
        this.errorMessage = '企業IDまたはパスワードが正しくありません';
      }
    } catch (error) {
      console.error('[RoomEnterPage] onSubmit: エラー発生', error);
      this.errorMessage = 'ルーム認証に失敗しました。しばらくしてから再度お試しください。';
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

    console.log('[RoomEnterPage] onCreateRoom: ルーム作成開始', { roomId, companyName });

    try {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';

      await this.roomService.createRoom(roomId, password, companyName, currentUser.uid);

      console.log('[RoomEnterPage] onCreateRoom: ルーム作成成功');
      
      // 作成成功後、自動的に入室
      sessionStorage.setItem('roomId', roomId);
      this.successMessage = 'ルームを作成しました。入室しています...';
      
      // 少し待ってからアラート画面へ遷移
      setTimeout(() => {
        this.router.navigate(['/alerts']);
      }, 1000);
    } catch (error: any) {
      console.error('[RoomEnterPage] onCreateRoom: エラー発生', error);
      this.errorMessage = error?.message || 'ルーム作成に失敗しました。しばらくしてから再度お試しください。';
    } finally {
      this.isLoading = false;
      console.log('[RoomEnterPage] onCreateRoom: 処理完了');
    }
  }
}
