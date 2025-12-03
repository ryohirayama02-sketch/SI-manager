import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './signup-page.component.html',
  styleUrl: './signup-page.component.css',
})
export class SignupPageComponent implements OnInit {
  signupForm: FormGroup;
  isLoading = false;
  errorMessage = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder
  ) {
    this.signupForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      displayName: ['', [Validators.required]],
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit(): void {}

  passwordMatchValidator(form: AbstractControl): ValidationErrors | null {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  async onSubmit(): Promise<void> {
    if (this.signupForm.invalid) {
      return;
    }

    const { email, password, displayName } = this.signupForm.value;
    
    try {
      this.isLoading = true;
      this.errorMessage = '';
      
      await this.authService.signUpWithEmailAndPassword(email, password, displayName);
      
      // 登録成功後、ログイン画面へ遷移
      this.router.navigate(['/login'], { queryParams: { registered: 'true' } });
    } catch (error: any) {
      console.error('[SignupPage] 登録エラー', error);
      
      let errorMsg = '登録に失敗しました。';
      if (error?.code === 'auth/email-already-in-use') {
        errorMsg = 'このメールアドレスは既に使用されています。';
      } else if (error?.code === 'auth/invalid-email') {
        errorMsg = 'メールアドレスの形式が正しくありません。';
      } else if (error?.code === 'auth/weak-password') {
        errorMsg = 'パスワードが弱すぎます。';
      } else if (error?.message) {
        errorMsg = error.message;
      }
      
      this.errorMessage = errorMsg;
    } finally {
      this.isLoading = false;
    }
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }
}



