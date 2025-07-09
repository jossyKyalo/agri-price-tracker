import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-registration',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-registration.component.html',
  styleUrls: ['./admin-registration.component.css']
   
})
export class AdminRegistrationComponent {
  @Output() close = new EventEmitter<void>();
  @Output() registered = new EventEmitter<void>();

  adminData = {
    fullName: '',
    email: '',
    phone: '',
    region: '',
    organization: '',
    reason: ''
  };

  closeModal() {
    this.close.emit();
  }

  submitRegistration() {
    // Submit to backend API
    console.log('Admin registration:', this.adminData);
    this.registered.emit();
    
    // Reset form
    this.adminData = {
      fullName: '',
      email: '',
      phone: '',
      region: '',
      organization: '',
      reason: ''
    };
  }
}