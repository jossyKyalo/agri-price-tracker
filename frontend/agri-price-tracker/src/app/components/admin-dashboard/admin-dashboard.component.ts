import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';
import { PriceService } from '../../services/price.service';
import { AuthService } from '../../services/auth.service';

// PrimeNG Imports
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';

interface AdminRequest {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  region: string;
  organization: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface PriceEntry {
  id: string;
  crop_name: string;
  price: number;
  region_name: string;
  market_name: string;
  entered_by_name: string;
  entry_date: string;
  is_verified: boolean;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    DialogModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    SelectModule, // Corrected from DropdownModule
    ToastModule
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {
  activeTab = 'requests';
  isLoading = false;
  errorMessage = '';
  adminName = '';

  // Stats
  pendingRequests = 0;
  totalAdmins = 0;
  todayEntries = 0;

  // Data
  adminRequests: AdminRequest[] = [];
  pendingVerifications: PriceEntry[] = [];

  // Dialog State
  requestDialogVisible = false;
  selectedRequest: AdminRequest | null = null;

  constructor(
    private adminService: AdminService,
    private priceService: PriceService,
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadAdminInfo();
    this.loadDashboardData();
  }

  loadAdminInfo() {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.adminName = user.full_name || user.email || 'Admin';
    } else {
      this.adminName = localStorage.getItem('admin_name') || 'Admin';
    }
  }

  loadDashboardData() {
    this.loadAdminRequests();
    this.loadPendingVerifications();
    this.loadStats();
  }

  loadAdminRequests() {
    this.isLoading = true;
    this.adminService.getAdminRequests(1, 50, 'pending').subscribe({
      next: (response) => {
        this.adminRequests = response.requests;
        this.pendingRequests = response.requests.filter(r => r.status === 'pending').length;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading admin requests:', error);
        this.isLoading = false;
        // Fallback to mock data
        this.adminRequests = [
          {
            id: '1',
            full_name: 'John Kamau',
            email: 'john.kamau@agri.co.ke',
            phone: '+254 700 123 456',
            region: 'Central Kenya',
            organization: 'Farmers Cooperative Union',
            status: 'pending',
            created_at: '2025-01-10T10:00:00Z'
          },
          {
            id: '2',
            full_name: 'Mary Wanjiku',
            email: 'mary.wanjiku@extension.go.ke',
            phone: '+254 722 987 654',
            region: 'Western Kenya',
            organization: 'Ministry of Agriculture',
            status: 'pending',
            created_at: '2025-01-09T15:30:00Z'
          }
        ];
        this.pendingRequests = this.adminRequests.length;
      }
    });
  }

  loadPendingVerifications() {
    this.priceService.getPendingVerifications().subscribe({
      next: (entries) => {
        this.pendingVerifications = entries.map((entry: any) => ({
          id: entry.id,
          crop_name: entry.crop_name,
          price: entry.price,
          region_name: entry.region_name,
          market_name: entry.market_name,
          entered_by_name: entry.entered_by_name ?? 'Unknown',
          entry_date: entry.entry_date,
          is_verified: entry.is_verified
        }));
      },
      error: (error) => {
        console.error('Error loading pending verifications:', error);

        // Fallback to mock data
        this.pendingVerifications = [
          {
            id: '1',
            crop_name: 'Maize',
            price: 52,
            region_name: 'Central Kenya',
            market_name: 'Kiambu Market',
            entered_by_name: 'Farmer John',
            entry_date: '2025-01-10T12:00:00Z',
            is_verified: false
          },
          {
            id: '2',
            crop_name: 'Beans',
            price: 88,
            region_name: 'Western Kenya',
            market_name: 'Bungoma Market',
            entered_by_name: 'Farmer Mary',
            entry_date: '2025-01-10T11:00:00Z',
            is_verified: false
          }
        ];
      }
    });
  }

  loadStats() {
    this.adminService.getAdminStats().subscribe({
      next: (stats) => {
        this.pendingRequests = stats.pendingRequests;
        this.totalAdmins = stats.totalAdmins;
        this.todayEntries = stats.todayEntries;
      },
      error: (error) => {
        console.error('Error loading stats:', error);
        // Fallback to mock data
        this.totalAdmins = 45;
        this.todayEntries = 127;
      }
    });
  }

  viewRequest(request: AdminRequest) {
    this.selectedRequest = request;
    this.requestDialogVisible = true;
  }

  approveRequest(id: string) {
    this.adminService.reviewAdminRequest(id, 'approved').subscribe({
      next: () => {
        const request = this.adminRequests.find(r => r.id === id);
        if (request) {
          request.status = 'approved';
          this.pendingRequests--;
          this.totalAdmins++;
        }
        alert('Admin request approved successfully!');
      },
      error: (error) => {
        console.error('Error approving request:', error);
        alert('Failed to approve request. Please try again.');
      }
    });
  }

  rejectRequest(id: string) {
    this.adminService.reviewAdminRequest(id, 'rejected').subscribe({
      next: () => {
        const request = this.adminRequests.find(r => r.id === id);
        if (request) {
          request.status = 'rejected';
          this.pendingRequests--;
        }
        alert('Admin request rejected.');
      },
      error: (error) => {
        console.error('Error rejecting request:', error);
        alert('Failed to reject request. Please try again.');
      }
    });
  }

  verifyEntry(id: string) {
    this.priceService.verifyPriceEntry(id).subscribe({
      next: () => {
        this.pendingVerifications = this.pendingVerifications.filter(e => e.id !== id);
        this.todayEntries++;
        alert('Price entry verified successfully!');
      },
      error: (error) => {
        console.error('Error verifying entry:', error);
        alert('Failed to verify entry. Please try again.');
      }
    });
  }

  rejectEntry(id: string) {
    this.priceService.rejectPriceEntry(id).subscribe({
      next: () => {
        this.pendingVerifications = this.pendingVerifications.filter(e => e.id !== id);
        alert('Price entry rejected.');
      },
      error: (error) => {
        console.error('Error rejecting entry:', error);
        alert('Failed to reject entry. Please try again.');
      }
    });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}