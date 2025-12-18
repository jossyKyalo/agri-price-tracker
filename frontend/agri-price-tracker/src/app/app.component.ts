import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { HomeComponent } from './components/home/home.component';
import { PublicPortalComponent } from './components/public-portal/public-portal.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { AdminRegistrationComponent } from './components/admin-registration/admin-registration.component';
import { ChatbotWidgetComponent } from './components/chatbot-widget/chatbot-widget.component';
import { AdminLoginComponent } from './components/admin-login/admin-login.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    FooterComponent,
    HomeComponent,
    PublicPortalComponent,
    AdminDashboardComponent,
    AdminRegistrationComponent,
    ChatbotWidgetComponent,
    AdminLoginComponent,
    ResetPasswordComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'Agricultural Price Tracker';
  currentPage = 'home';
  isAdmin = false;
  showAdminRegModal = false;
  showAdminLoginModal = false;
  showResetPasswordPage = false;

  constructor(
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.checkAdminStatus(); 
    this.checkCurrentPath();
    if (isPlatformBrowser(this.platformId)) {
      window.addEventListener('showAdminLoginFromReset', this.handleLoginSignal.bind(this));
    }
  }

  handleLoginSignal() { 
    this.showResetPasswordPage = false;
    this.currentPage = 'home';
    this.showAdminLogin();
  }

  checkCurrentPath() {
    if (!isPlatformBrowser(this.platformId)) return; 
    const hash = window.location.hash;  
    if (hash.startsWith('#/reset-password')) {
        this.showResetPasswordPage = true;
        this.currentPage = 'reset';  
        this.showAdminRegModal = false;
        this.showAdminLoginModal = false;
    } else {
        this.showResetPasswordPage = false; 
        if (this.currentPage === 'reset') {
            this.currentPage = 'home';
        }
    }
  }

  switchPage(page: string) {
    this.currentPage = page;
    this.showResetPasswordPage = false;

    if (isPlatformBrowser(this.platformId)) {
        this.router.navigate(['/']); 
    }
  }

  getPageFromEvent(event: any): string {
    if (typeof event === 'string') {
      return event;
    } else if (event && event.detail) {
      return event.detail;
    } else if (event && event.target && event.target.value) {
      return event.target.value;
    }
    return '';
  }

  switchToPublicPortalSection(event: any) {
    let section: string;
    if (typeof event === 'string') {
      section = event;
    } else if (event && event.detail) {
      section = event.detail;
    } else if (event && event.target && event.target.value) {
      section = event.target.value;
    } else {
      section = '';
    }
    this.currentPage = 'public';
    
 
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        const customEvent = new CustomEvent('switchToSection', { detail: section });
        window.dispatchEvent(customEvent);
      }, 100);
    }
  }

  openChatbot() { 
    if (isPlatformBrowser(this.platformId)) {
      const event = new CustomEvent('openChatbot');
      window.dispatchEvent(event);
    }
  }

  showAdminRegistration() {
    this.showAdminRegModal = true;
  }

  showAdminLogin() {
    this.showAdminLoginModal = true;
  }

  closeAdminRegistration() {
    this.showAdminRegModal = false;
  }

  closeAdminLogin() {
    this.showAdminLoginModal = false;
  }

  onAdminRegistered() {
    this.showAdminRegModal = false;
    // Handle successful admin registration
    if (isPlatformBrowser(this.platformId)) {
      alert('Admin registration submitted! You will be notified once approved.');
    }
  }

  onAdminLogin() {
    this.showAdminLoginModal = false;
    this.isAdmin = true;
    this.currentPage = 'admin';
    
    // Store admin status only in browser environment
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('userRole', 'admin');
    }
  }

  checkAdminStatus() { 
    if (isPlatformBrowser(this.platformId)) {
      const userRole = localStorage.getItem('userRole');
      this.isAdmin = userRole === 'admin' || userRole === 'super_admin';
    }
    
  }
}