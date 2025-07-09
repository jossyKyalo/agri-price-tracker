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
    ChatbotWidgetComponent
  ],
  template: `
    <div class="app-container">
      <app-header 
        [currentPage]="currentPage" 
        [isAdmin]="isAdmin"
        (pageChange)="switchPage($event)"
        (adminRegister)="showAdminRegistration()">
      </app-header>
      
      <main class="main-content">
        <!-- Home Page -->
        <app-home *ngIf="currentPage === 'home'"></app-home>
        
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
      </main>
      
      <app-footer></app-footer>
      
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

  constructor(private router: Router) {}

  ngOnInit() {
    // Check if user is admin (from localStorage or API)
    this.checkAdminStatus();
  }

  switchPage(page: string) {
    if (page === 'admin' && !this.isAdmin) {
      // Redirect to admin registration if not admin
      this.showAdminRegistration();
      return;
    }
    this.currentPage = page;
  }

  showAdminRegistration() {
    this.showAdminRegModal = true;
  }

  closeAdminRegistration() {
    this.showAdminRegModal = false;
  }

  onAdminRegistered() {
    this.showAdminRegModal = false;
    // Handle successful admin registration
    alert('Admin registration submitted! You will be notified once approved.');
  }

  checkAdminStatus() {
    // Check localStorage or make API call to verify admin status
    const userRole = localStorage.getItem('userRole');
    this.isAdmin = userRole === 'admin' || userRole === 'super_admin';
  }
}