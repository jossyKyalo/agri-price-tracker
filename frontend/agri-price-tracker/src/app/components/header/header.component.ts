import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService, User } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Input() currentPage = 'home'; 
  @Output() pageChange = new EventEmitter<string>();
  @Output() adminRegister = new EventEmitter<void>();
  @Output() adminLogin = new EventEmitter<void>();
  
  isMenuOpen = false;
  isAdmin= false;
  adminName = '';
  private authSubscription?: Subscription;

  constructor(private authService: AuthService) {}

  ngOnInit() {
    // Subscribe to auth state changes
    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      this.updateAuthState(user);
    });
  }

  ngOnDestroy() {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  private updateAuthState(user: User | null) {
    if (user) {
      this.isAdmin = user.role === 'admin' || user.role === 'super_admin';
      this.adminName = user.full_name || user.email;
    } else {
      this.isAdmin = false;
      this.adminName = '';
    }
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  switchPage(page: string) {
    this.pageChange.emit(page);
    this.isMenuOpen = false;
  }

  registerAdmin() {
    this.adminRegister.emit();
    this.isMenuOpen = false;
  }

  handleAdminAccess() {
    this.adminLogin.emit();
    this.isMenuOpen = false;
  }

  adminLogout() {
    if (confirm('Are you sure you want to logout?')) {
      // Clear auth state via service
      this.authService.logout();
      
      // Close mobile menu
      this.isMenuOpen = false;
      
      // Navigate to home page
      this.switchPage('home');
      
      // Show success message
      alert('✅ You have been logged out successfully');
    }
  }
}