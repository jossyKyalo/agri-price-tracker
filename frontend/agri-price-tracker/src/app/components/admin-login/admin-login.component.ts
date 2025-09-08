import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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

  loginData = {
    email: '',
    password: '',
    rememberMe: false
  };

  closeModal() {
    this.close.emit();
  }

  submitLogin() {
    // Simulate login 
    console.log('Admin login:', this.loginData);
    
    // For demo purposes
    if (this.loginData.email && this.loginData.password) {
      this.login.emit();
      
      // Reset form
      this.loginData = {
        email: '',
        password: '',
        rememberMe: false
      };
    }
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