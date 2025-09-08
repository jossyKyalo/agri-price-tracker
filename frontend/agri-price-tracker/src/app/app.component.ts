import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { HomeComponent } from './components/home/home.component';
import { PublicPortalComponent } from './components/public-portal/public-portal.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { AdminRegistrationComponent } from './components/admin-registration/admin-registration.component';
import { ChatbotWidgetComponent } from './components/chatbot-widget/chatbot-widget.component';
import { AdminLoginComponent } from './components/admin-login/admin-login.component';

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
  ],
  template: `
    <div class="app-container">
      <app-header 
        [currentPage]="currentPage" 
        [isAdmin]="isAdmin"
        (pageChange)="switchPage($event)"
        (adminRegister)="showAdminRegistration()"
        (adminLogin)="showAdminLogin()">
      </app-header>
      
      <main class="main-content">
        <!-- Home Page -->
        <app-home 
          *ngIf="currentPage === 'home'"
          (navigateToSection)="switchToPublicPortalSection($event)"
          (navigateToPage)="switchPage(getPageFromEvent($event))">
        </app-home>
        
        <!-- Public Portal (Farmer Dashboard) -->
        <app-public-portal *ngIf="currentPage === 'public'"></app-public-portal>
        
        <!-- Admin Dashboard (includes SMS interface) -->
        <app-admin-dashboard *ngIf="currentPage === 'admin' && isAdmin"></app-admin-dashboard>
        
        <!-- Admin Registration Modal -->
        <app-admin-registration 
          *ngIf="showAdminRegModal"
          (close)="closeAdminRegistration()"
          (registered)="onAdminRegistered()">
        </app-admin-registration>
        
        <!-- Admin Login Modal -->
        <app-admin-login 
          *ngIf="showAdminLoginModal"
          (close)="closeAdminLogin()"
          (login)="onAdminLogin()">
        </app-admin-login>
      </main>
      
      <app-footer 
        (navigateToSection)="switchToPublicPortalSection($event)"
        (navigateToPage)="switchPage(getPageFromEvent($event))"
        (openChatbot)="openChatbot()"
        (showAdminLogin)="showAdminLogin()">
      </app-footer>
      
      <!-- Chatbot Widget (only on home and public portal) -->
      <app-chatbot-widget 
        *ngIf="currentPage === 'home' || currentPage === 'public'"
        [focusOnPrices]="true">
      </app-chatbot-widget>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .main-content {
      flex: 1;
    }
  `]
})
export class AppComponent implements OnInit {
  title = 'Agricultural Price Tracker';
  currentPage = 'home';
  isAdmin = false;
  showAdminRegModal = false;
  showAdminLoginModal = false;

  constructor(private router: Router) {}

  ngOnInit() {
    // Check if user is admin (from localStorage or API)
    this.checkAdminStatus();
  }

  switchPage(page: string) {
    this.currentPage = page;
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
    setTimeout(() => {
      const customEvent = new CustomEvent('switchToSection', { detail: section });
      window.dispatchEvent(customEvent);
    }, 100);
  }

  openChatbot() {
    const event = new CustomEvent('openChatbot');
    window.dispatchEvent(event);
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
    alert('Admin registration submitted! You will be notified once approved.');
  }

  onAdminLogin() {
    this.showAdminLoginModal = false;
    this.isAdmin = true;
    this.currentPage = 'admin';
    // Store admin status
    localStorage.setItem('userRole', 'admin');
  }

  checkAdminStatus() {
    // Check localStorage or make API call to verify admin status
    const userRole = localStorage.getItem('userRole');
    this.isAdmin = userRole === 'admin' || userRole === 'super_admin';
  }
}