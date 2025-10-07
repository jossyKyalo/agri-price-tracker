import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, CreateAdminRequest } from '../../services/admin.service';

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

  isLoading = false;
  errorMessage = '';

  adminData = {
    fullName: '',
    email: '',
    phone: '',
    region: '',
    organization: '',
    reason: ''
  };

  constructor(private adminService: AdminService) {}

  closeModal() {
    this.close.emit();
  }

  submitRegistration() {
    this.isLoading = true;
    this.errorMessage = '';

    const requestData: CreateAdminRequest = {
      full_name: this.adminData.fullName,
      email: this.adminData.email,
      phone: this.adminData.phone,
      region: this.adminData.region,
      organization: this.adminData.organization,
      reason: this.adminData.reason
    };

    this.adminService.createAdminRequest(requestData).subscribe({
      next: (response) => {
        this.isLoading = false;
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
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.userMessage || 'Registration failed. Please try again.';
      }
    });
  }
}