import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SmsInterfaceComponent } from '../sms-interface/sms-interface.component';

interface AdminRequest {
  id: number;
  name: string;
  email: string;
  phone: string;
  region: string;
  organization: string;
  status: 'pending' | 'approved' | 'rejected';
  requestDate: string;
}

interface PriceEntry {
  id: number;
  crop: string;
  price: number;
  region: string;
  market: string;
  enteredBy: string;
  entryDate: string;
  verified: boolean;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, SmsInterfaceComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css'],
   
})
export class AdminDashboardComponent implements OnInit {
  activeTab = 'requests';
  
  // Stats
  pendingRequests = 12;
  totalAdmins = 45;
  todayEntries = 127;
  kamisSync = 'Active';
  
  // KAMIS data
  lastKamisSync = '2 hours ago';
  kamisRecords = 1567;
  
  // New price entry form
  newPriceEntry = {
    crop: '',
    price: 0,
    region: '',
    market: ''
  };

  adminRequests: AdminRequest[] = [
    {
      id: 1,
      name: 'John Kamau',
      email: 'john.kamau@agri.co.ke',
      phone: '+254 700 123 456',
      region: 'Central Kenya',
      organization: 'Farmers Cooperative Union',
      status: 'pending',
      requestDate: '2025-01-10'
    },
    {
      id: 2,
      name: 'Mary Wanjiku',
      email: 'mary.wanjiku@extension.go.ke',
      phone: '+254 722 987 654',
      region: 'Western Kenya',
      organization: 'Ministry of Agriculture',
      status: 'pending',
      requestDate: '2025-01-09'
    }
  ];

  pendingVerifications: PriceEntry[] = [
    {
      id: 1,
      crop: 'maize',
      price: 52,
      region: 'Central Kenya',
      market: 'Kiambu',
      enteredBy: 'Farmer John',
      entryDate: '2 hours ago',
      verified: false
    },
    {
      id: 2,
      crop: 'beans',
      price: 88,
      region: 'Western Kenya',
      market: 'Bungoma',
      enteredBy: 'Farmer Mary',
      entryDate: '3 hours ago',
      verified: false
    }
  ];

  ngOnInit() {
    // Initialize admin dashboard
  }

  approveRequest(id: number) {
    const request = this.adminRequests.find(r => r.id === id);
    if (request) {
      request.status = 'approved';
      this.pendingRequests--;
      this.totalAdmins++;
      alert('Admin request approved successfully!');
    }
  }

  rejectRequest(id: number) {
    const request = this.adminRequests.find(r => r.id === id);
    if (request) {
      request.status = 'rejected';
      this.pendingRequests--;
      alert('Admin request rejected.');
    }
  }

  submitPriceEntry() {
    // Add the new price entry
    alert('Price entry added successfully!');
    
    // Reset form
    this.newPriceEntry = {
      crop: '',
      price: 0,
      region: '',
      market: ''
    };
  }

  verifyEntry(id: number) {
    const entry = this.pendingVerifications.find(e => e.id === id);
    if (entry) {
      entry.verified = true;
      this.pendingVerifications = this.pendingVerifications.filter(e => e.id !== id);
      alert('Price entry verified successfully!');
    }
  }

  rejectEntry(id: number) {
    this.pendingVerifications = this.pendingVerifications.filter(e => e.id !== id);
    alert('Price entry rejected.');
  }

  syncKamisData() {
    // Simulate KAMIS data sync
    this.lastKamisSync = 'Just now';
    this.kamisRecords += 50;
    alert('KAMIS data sync completed successfully!');
  }
}