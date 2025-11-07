import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router'; 
import { AuthService } from '../../services/auth.service'; 

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css']
})
export class ResetPasswordComponent implements OnInit {
  token: string = '';
  email: string = '';
  newPassword: string = '';
  confirmPassword: string = '';
  message: string = '';
  isError: boolean = false;
  isLoading: boolean = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) { 
        const hash = window.location.hash;  
        const queryParamIndex = hash.indexOf('?');
        
        if (queryParamIndex === -1) {
            this.message = 'Invalid password reset link. Missing parameters.';
            this.isError = true;
            return;
        }
 
        const queryString = hash.substring(queryParamIndex + 1);
        const params = new URLSearchParams(queryString);

        this.token = params.get('token') || '';
        this.email = params.get('email') || '';
 
        if (!this.token || !this.email) {
            this.message = 'Invalid password reset link. Missing token or email.';
            this.isError = true;
        }
    }
  }

  submitResetPassword(): void {
    if (this.newPassword !== this.confirmPassword) {
      this.message = 'Passwords do not match.';
      this.isError = true;
      return;
    }

    if (this.newPassword.length < 8) {
        this.message = 'Password must be at least 8 characters long.';
        this.isError = true;
        return;
    }

    this.isLoading = true;
    this.message = '';
    this.isError = false;
 
    this.authService.resetPassword({
      token: this.token,
      email: this.email,
      new_password: this.newPassword
    }).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.message = '✅ Your password has been successfully reset. Redirecting to login...';
        this.isError = false;
         
        this.router.navigate(['/']); 
  
        setTimeout(() => {
            if (isPlatformBrowser(this.platformId)) {
                const event = new CustomEvent('showAdminLoginFromReset');
                window.dispatchEvent(event);
            }
        }, 3000);
      },
      error: (error) => {
        this.isLoading = false;
        this.isError = true;
        this.message = error.error?.error || error.error?.message || '❌ Password reset failed. The link may have expired.';
      }
    });
  }
}