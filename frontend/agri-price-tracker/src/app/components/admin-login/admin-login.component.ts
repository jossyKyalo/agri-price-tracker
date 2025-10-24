import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, LoginRequest } from '../../services/auth.service';

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
  showPassword= false;

  loginData = {
    email: '',
    password: '',
    rememberMe: false
  };

  constructor(private authService: AuthService) {}

  closeModal() {
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
        this.login.emit();
        
        // Reset form
        this.loginData = {
          email: '',
          password: '',
          rememberMe: false
        };
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.userMessage || 'Login failed. Please check your credentials.';
      }
    });
  }

  switchToRegistration() {
    this.close.emit();
    // Trigger admin registration modal
    setTimeout(() => {
      const event = new CustomEvent('showAdminRegistration');
      window.dispatchEvent(event);
    }, 100);
  }

  forgotPassword() {
    alert('Password reset functionality would be implemented here. Please contact system administrator.');
  }
}