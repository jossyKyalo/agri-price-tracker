import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, LoginRequest, PasswordResetRequest } from '../../services/auth.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.css']
})
export class AdminLoginComponent {
  @Output() close = new EventEmitter<void>();
  @Output() login = new EventEmitter<void>();

  isLoading = false;
  errorMessage = '';
  showPassword = false;

  isForgotPasswordMode = false;
  resetEmail = '';              
  resetMessage = '';

  loginData = {
    email: '',
    password: '',
    rememberMe: false
  };

  constructor(private authService: AuthService) {}

  closeModal() {
    this.isForgotPasswordMode = false;  
    this.resetMessage = '';
    this.close.emit();
  }

  submitLogin() {
    if (!this.loginData.email || !this.loginData.password) {
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const loginRequest: LoginRequest = {
      email: this.loginData.email,
      password: this.loginData.password
    };

    this.authService.login(loginRequest).subscribe({
      next: (response) => {
        this.isLoading = false;
        
        // Emit login event to close modal
        this.login.emit();
        
        // Reset form
        this.loginData = {
          email: '',
          password: '',
          rememberMe: false
        };
        this.showPassword = false;
        
        // Show success message
        alert(`✅ Welcome back, ${response.user.full_name}!`);
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.userMessage || error.error?.message || 'Login failed. Please check your credentials.';
      }
    });
  }

  showForgotPassword() {
    this.isForgotPasswordMode = true;
    this.errorMessage = '';  
    this.resetMessage = ''; 
    this.loginData.email = '';  
  }

  backToLogin() {
    this.isForgotPasswordMode = false;
    this.resetMessage = '';  
    this.errorMessage = '';
    this.resetEmail = '';  
  }

  requestPasswordReset() {
    if (!this.resetEmail || !this.resetEmail.includes('@')) {
      this.resetMessage = 'Please enter a valid email address.';
      return;
    }

    this.isLoading = true;
    this.resetMessage = '';

    this.authService.requestPasswordReset(this.resetEmail).subscribe({
      next: () => {
        this.isLoading = false;
        this.resetMessage = `If an account with ${this.resetEmail} exists, a password reset link has been sent. Please check your inbox.`;
        this.resetEmail = '';  
      },
      error: (error) => {
        this.isLoading = false;
        this.resetMessage = error.error?.message || 'Failed to send reset link. Please try again later.';
      }
    });
  }

  switchToRegistration() {
    this.close.emit();
    setTimeout(() => {
      const event = new CustomEvent('showAdminRegistration');
      window.dispatchEvent(event);
    }, 100);
  }
}