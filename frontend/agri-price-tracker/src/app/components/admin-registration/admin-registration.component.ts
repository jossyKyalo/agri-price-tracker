import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../services/admin.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { MessageModule } from 'primeng/message';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-admin-registration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    MessageModule
  ],
  templateUrl: './admin-registration.component.html',
  styleUrls: ['./admin-registration.component.css']
})
export class AdminRegistrationComponent {
  registerForm: FormGroup;
  errorMessage: string = '';
  loading: boolean = false;

  constructor(
    private fb: FormBuilder,
    private adminService: AdminService,
    private router: Router
  ) {
    this.registerForm = this.fb.group({
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      region: ['', Validators.required],
      organization: ['', Validators.required],
      reason: ['', Validators.required]
    });
  }

  submitRegistration() {
    if (this.registerForm.valid) {
      this.loading = true;
      this.errorMessage = '';

      const formData = this.registerForm.value;
      const requestData = {
        full_name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        region: formData.region,
        organization: formData.organization,
        reason: formData.reason
      };

      this.adminService.createAdminRequest(requestData).subscribe({
        next: (success) => {
          this.loading = false;
          // Redirect to login or show success message?
          // Since it's a request, maybe redirect to a success page or back to home with a message.
          // For now, let's redirect to home and let them know.
          alert('✅ Registration submitted successfully! We will contact you soon.');
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = err.error?.message || 'Registration failed.';
        }
      });
    } else {
      this.registerForm.markAllAsTouched();
    }
  }
}