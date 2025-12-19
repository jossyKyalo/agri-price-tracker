import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { TooltipModule } from 'primeng/tooltip';
import { DialogService, DynamicDialogModule } from 'primeng/dynamicdialog';
import { AdminLoginComponent } from '../admin-login/admin-login.component';
import { AdminRegistrationComponent } from '../admin-registration/admin-registration.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    MenuModule,
    AvatarModule,
    TooltipModule,
    DynamicDialogModule
  ],
  providers: [DialogService],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  items: MenuItem[] = [];
  isAdmin = false;
  adminName = '';
  private authSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private dialogService: DialogService
  ) { }

  ngOnInit() {
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
    this.setupItems();
  }

  setupItems() {
    this.items = [
      {
        label: 'Home',
        icon: 'pi pi-compass',
        routerLink: '/'
      },
      {
        label: 'Public Portal',
        icon: 'pi pi-globe',
        routerLink: '/public'
      }
    ];

    if (this.isAdmin) {
      this.items.push({
        label: 'Dashboard',
        icon: 'pi pi-th-large',
        routerLink: '/admin'
      });
    }
  }

  showLogin() {
    this.dialogService.open(AdminLoginComponent, {
      header: 'Admin Login',
      width: '400px',
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      dismissableMask: true
    });
  }

  showRegister() {
    this.dialogService.open(AdminRegistrationComponent, {
      header: 'Join as Admin',
      width: '500px',
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      dismissableMask: true
    });
  }

  logout() {
    if (confirm('Are you sure you want to logout?')) {
      this.authService.logout();
      this.router.navigate(['/']);
    }
  }
}