import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PriceService, CropPrice, CreatePriceEntry } from '../../services/price.service';
import { CropService, Crop, Region } from '../../services/crop.service';
import { ApiService } from '../../services/api.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface DisplayCrop {
  id: string;
  name: string;
  category: string;
  currentPrice: number;
  previousPrice: number;
  trend: 'up' | 'down' | 'stable';
  region: string;
  market: string;
  lastUpdated: string;
  prediction: number;
}

@Component({
  selector: 'app-public-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-portal.component.html',
  styleUrls: ['./public-portal.component.css']
})
export class PublicPortalComponent implements OnInit {
  private baseUrl = environment.apiUrl;

  isLoggedIn = false;
  showLogin = false;
  farmerName = '';
  showPassword = false;

  registration = {
    name: '',
    phone: '',
    region: ''
  };

  login = {
    phone: '',
    password: ''
  };

  activeTab = 'prices';
  searchTerm = '';
  selectedCategory = '';
  selectedRegion = '';
  isLoading = false;
  errorMessage = '';

  // Stats
  totalCrops = 0;
  totalRegions = 0;
  lastUpdated = 'Loading...';

  // Price input form
  priceInput = {
    crop: '',
    price: 0,
    location: '',
    region: '',
    notes: ''
  };

  allCrops: DisplayCrop[] = [];
  crops: Crop[] = [];
  regions: Region[] = [];
  filteredCrops: DisplayCrop[] = [];

  constructor(
    private http: HttpClient,
    private priceService: PriceService,
    private cropService: CropService,
    private apiService: ApiService
  ) { }

  ngOnInit(): void {
    this.checkAuth();
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    this.loadCrops();
    this.loadRegions();
    this.loadPrices();
  }

  loadCrops() {
    this.cropService.getCrops().subscribe({
      next: (response: any) => {
        this.crops = response.data || response || [];
        this.totalCrops = this.crops.length;
        console.log('Crops loaded:', this.crops);
      },
      error: (error) => {
        console.error('Error loading crops:', error);
      }
    });
  }

  loadRegions() {
    this.cropService.getRegions().subscribe({
      next: (response: any) => {
        this.regions = response.data || response || [];
        this.totalRegions = this.regions.length;
        console.log('Regions loaded:', this.regions);
      },
      error: (error) => {
        console.error('Error loading regions:', error);
      }
    });
  }

  loadPrices() {
    this.priceService.getPrices({ limit: 100 }).subscribe({
      next: (response: any) => {
        console.log('Raw prices response:', response);
        
        const pricesData = response.data || response.prices || [];
        
        // Transform API data to DisplayCrop format
        this.allCrops = pricesData.map((item: any) => {
          const currentPrice = parseFloat(item.price || item.current_price || 0);
          const previousPrice = currentPrice > 0 ? currentPrice * 0.95 : 0; // Mock previous price
          
          return {
            id: item.id || item.crop_id,
            name: item.crop_name || item.name || 'Unknown',
            category: item.category || 'general',
            currentPrice: currentPrice,
            previousPrice: previousPrice,
            trend: this.calculateTrend(currentPrice, previousPrice),
            region: item.region_name || item.region || 'Unknown',
            market: item.market_name || item.market || 'Unknown',
            lastUpdated: this.formatDate(item.entry_date || item.created_at || new Date()),
            prediction: currentPrice * 1.05 // Mock prediction
          } as DisplayCrop;
        });

        this.filteredCrops = this.allCrops;
        this.isLoading = false;
        
        if (this.allCrops.length > 0) {
          this.lastUpdated = this.allCrops[0].lastUpdated;
        }

        console.log('Transformed crops:', this.allCrops);
      },
      error: (error) => {
        console.error('Error loading prices:', error);
        this.isLoading = false;
        this.allCrops = [];
        this.filteredCrops = [];
      }
    });
  }

  calculateTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'stable';
  }

  formatDate(date: string | Date): string {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  }

  filterCrops() {
    this.filteredCrops = this.allCrops.filter(crop => {
      const matchesSearch = !this.searchTerm || 
        crop.name.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      const matchesCategory = !this.selectedCategory || 
        crop.category === this.selectedCategory;
      
      const matchesRegion = !this.selectedRegion || 
        crop.region.toLowerCase().includes(this.selectedRegion.toLowerCase());

      return matchesSearch && matchesCategory && matchesRegion;
    });

    console.log('Filtered crops:', this.filteredCrops);
  }

  checkAuth() {
    const token = localStorage.getItem('farmer_token');
    const name = localStorage.getItem('farmer_name');
    this.isLoggedIn = !!token;
    this.farmerName = name || '';
  }

  quickRegister() {
    this.isLoading = true;
    this.errorMessage = '';

    this.http.post(`${this.baseUrl}/auth/register/farmer`, {
      full_name: this.registration.name,
      phone: this.registration.phone,
      region: this.registration.region || null
    }).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        localStorage.setItem('farmer_token', response.data.token);
        localStorage.setItem('farmer_name', response.data.user.full_name);
        this.isLoggedIn = true;
        this.farmerName = response.data.user.full_name;
        
        alert(
          `✅ Registration Successful!\n\n` +
          `Welcome ${response.data.user.full_name}!\n\n` +
          `═══════════════════════════════\n` +
          `📱 Phone: ${response.data.user.phone}\n` +
          `🔑 Password: ${response.data.tempPassword}\n` +
          `═══════════════════════════════\n\n` +
          `⚠️ SAVE THIS PASSWORD!\n` +
          `You'll need it to login next time.`
        );

        this.registration = { name: '', phone: '', region: '' };
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.error || 'Registration failed. Please try again.';
      }
    });
  }

  farmerLogin() {
    this.isLoading = true;
    this.errorMessage = '';

    this.http.post(`${this.baseUrl}/auth/login/farmer`, {
      phone: this.login.phone,
      password: this.login.password
    }).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        localStorage.setItem('farmer_token', response.data.token);
        localStorage.setItem('farmer_name', response.data.user.full_name);
        this.isLoggedIn = true;
        this.farmerName = response.data.user.full_name;
        alert(`✅ Welcome back, ${response.data.user.full_name}!`);
        this.login = { phone: '', password: '' };
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.error || 'Login failed. Please check your credentials.';
      }
    });
  }

  logout() {
    if (confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('farmer_token');
      localStorage.removeItem('farmer_name');
      this.isLoggedIn = false;
      this.farmerName = '';
      alert('✅ You have been logged out successfully');
    }
  }

  submitPrice() {
    console.log('Submit button clicked!');
    console.log('Form data:', this.priceInput);

    if (!this.priceInput.crop || !this.priceInput.price || !this.priceInput.region) {
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const crop = this.crops.find(c => c.name.toLowerCase() === this.priceInput.crop.toLowerCase());
    const region = this.regions.find(r => r.name.toLowerCase().includes(this.priceInput.region.toLowerCase()));

    if (!crop || !region) {
      this.errorMessage = 'Invalid crop or region selected';
      this.isLoading = false;
      return;
    }

    const priceData: CreatePriceEntry = {
      crop_id: crop.id,
      region_id: region.id,
      price: this.priceInput.price,
      notes: this.priceInput.notes
    };

    const token = localStorage.getItem('farmer_token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    this.http.post(`${this.baseUrl}/prices/submit`, priceData, { headers }).subscribe({
      next: (response) => {
        this.isLoading = false;
        alert('✅ Price submitted successfully! It will be verified by our admin team.');
        this.priceInput = { crop: '', price: 0, location: '', region: '', notes: '' };
        this.loadPrices(); // Reload prices after submission
      },
      error: (error) => {
        console.error('Error submitting price:', error);
        this.isLoading = false;
        this.errorMessage = error.error?.error || 'Failed to submit price. Please try again.';
      }
    });
  }

  getPredictionTrend(current: number, predicted: number): string {
    if (predicted > current) return 'up';
    if (predicted < current) return 'down';
    return 'stable';
  }

  getPredictionChange(current: number, predicted: number): number {
    if (!current) return 0;
    return Math.round(((predicted - current) / current) * 100);
  }

  getPriceChange(current: number, previous: number): number {
    if (!previous) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }
}