import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { AvatarModule } from 'primeng/avatar';
import { TooltipModule } from 'primeng/tooltip';
import { DrawerModule } from 'primeng/drawer';
import { RippleModule } from 'primeng/ripple';
import { MenuItem } from 'primeng/api';

@Component({
    selector: 'app-admin-layout',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        ButtonModule,
        MenuModule,
        AvatarModule,
        TooltipModule,
        DrawerModule,
        RippleModule
    ],
    templateUrl: './admin-layout.component.html',
    styles: [`
        :host {
            display: block;
            height: 100vh;
            overflow: hidden;
        }
    `]
})
export class AdminLayoutComponent {
    isSidebarCollapsed = false;
    mobileSidebarVisible = false;

    adminName = 'Admin';
    menuItems: MenuItem[] = [];

    constructor(private authService: AuthService, private router: Router) {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                this.adminName = user.full_name || 'Admin';
            } catch (e) {
                console.error('Error parsing user', e);
            }
        }
        this.setupMenu();
    }

    setupMenu() {
        this.menuItems = [
            { label: 'Dashboard', icon: 'fas fa-home', routerLink: ['/admin/dashboard'] },
            { label: 'System Monitoring', icon: 'fas fa-server', routerLink: ['/admin/monitoring'] },
            { separator: true },
            { label: 'Profile', icon: 'fas fa-user', command: () => { } },
            { label: 'Settings', icon: 'fas fa-cog', command: () => { } },
            { separator: true },
            { label: 'Logout', icon: 'fas fa-sign-out-alt', command: () => this.logout() }
        ];
    }

    logout() {
        this.authService.logout();
        this.router.navigate(['/login']);
    }
}
