import { Routes } from '@angular/router';
import { MainLayoutComponent } from './components/layout/main-layout/main-layout.component';
import { HomeComponent } from './components/home/home.component';
import { PublicPortalComponent } from './components/public-portal/public-portal.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { AdminLoginComponent } from './components/admin-login/admin-login.component';
import { AdminRegistrationComponent } from './components/admin-registration/admin-registration.component';
import { AdminLayoutComponent } from './components/layout/admin-layout/admin-layout.component';
import { AuthLayoutComponent } from './components/layout/auth-layout/auth-layout.component';
import { SystemMonitoringComponent } from './components/system-monitoring/system-monitoring.component';

export const routes: Routes = [
    {
        path: '',
        component: MainLayoutComponent,
        children: [
            { path: '', component: HomeComponent },
            { path: 'home', redirectTo: '' },
            { path: 'public', component: PublicPortalComponent },
            { path: 'reset-password', component: ResetPasswordComponent }
        ]
    },
    {
        path: '',
        component: AuthLayoutComponent,
        children: [
            { path: 'login', component: AdminLoginComponent },
            { path: 'register', component: AdminRegistrationComponent }
        ]
    },
    {
        path: 'admin',
        component: AdminLayoutComponent,
        children: [
            { path: 'dashboard', component: AdminDashboardComponent },
            { path: 'monitoring', component: SystemMonitoringComponent },
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
        ]
    },
    { path: '**', redirectTo: '' }
];
