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
  totalCrops = 156;
  totalRegions = 47;
  lastUpdated = '2 mins ago';

  // Price input form
  priceInput = {
    crop: '',
    price: 0,
    location: '',
    region: '',
    notes: ''
  };

  allCrops: CropPrice[] = [];
  crops: Crop[] = [];
  regions: Region[] = [];

  filteredCrops: CropPrice[] = [];

  constructor(
    private http: HttpClient,
    private priceService: PriceService,
    private cropService: CropService,
    private apiService: ApiService
  ) { }

  ngOnInit(): void {
    this.loadInitialData();
    this.loadCrops();
    this.loadRegions();
    this.checkAuth();
  }

  loadInitialData(): void {
    this.isLoading = true;

    // Load crops, regions, and prices
    Promise.all([
      this.cropService.getCrops().toPromise(),
      this.cropService.getRegions().toPromise(),
      this.priceService.getPrices({ limit: 50 }).toPromise()
    ]).then(([crops, regions, pricesResponse]) => {
      this.crops = crops || [];
      this.regions = regions || [];
      this.allCrops = pricesResponse?.prices || [];
      this.totalCrops = this.crops.length;
      this.filterCrops();
      this.isLoading = false;
    }).catch(error => {
      console.error('Error loading data:', error);
      this.errorMessage = 'Failed to load data. Please try again.';
      this.isLoading = false;
    });
  }

  filterCrops() {
    this.filteredCrops = this.allCrops.filter(crop => {
      const matchesSearch = crop.crop_name?.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchesRegion = !this.selectedRegion || crop.region_name?.toLowerCase().includes(this.selectedRegion.toLowerCase());

      return matchesSearch && matchesRegion;
    });
  }
  loadCrops() {
    this.cropService.getCrops().subscribe({
      next: (response: any) => {
        this.crops = response.data || response;
        console.log('Crops loaded:', this.crops);
      },
      error: (error) => {
        console.error('Error loading crops:', error);
        this.errorMessage = 'Failed to load crops';
      }
    });
  }

  loadRegions() {
    this.cropService.getRegions().subscribe({
      next: (response: any) => {
        this.regions = response.data || response;
        console.log('Regions loaded:', this.regions);
      },
      error: (error) => {
        console.error('Error loading regions:', error);
        this.errorMessage = 'Failed to load regions';
      }
    });
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

        // Save token and user info
        localStorage.setItem('farmer_token', response.data.token);
        localStorage.setItem('farmer_name', response.data.user.full_name);
        localStorage.setItem('temp_password', response.data.tempPassword);

        this.isLoggedIn = true;
        this.farmerName = response.data.user.full_name;
        // Show password in alert
        alert(
          `Registration Successful!\n\n` +
          `Welcome ${response.data.user.full_name}!\n\n` +
          `Your temporary password: ${response.data.tempPassword}\n\n` +
          `⚠️ IMPORTANT: Save this password!\n` +
          `You'll need it to login next time.\n\n` +
          `Phone: ${response.data.user.phone}`
        );

        // Reset form
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
      console.log('Validation failed');
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

        // Reset form
        this.priceInput = {
          crop: '',
          price: 0,
          location: '',
          region: '',
          notes: ''
        };
      },
      error: (error) => {
        console.error('Error submitting price:', error);
        this.isLoading = false;
        this.errorMessage = error.userMessage || 'Failed to submit price. Please try again.';
      }
    });
  }
  getPrices(params?: any): Observable<{ prices: CropPrice[] }> {
    return this.apiService.get<any>('/prices', { params }).pipe(
      map((response: any) => ({
        prices: response.data.map((item: any) => ({
          name: item.crop_name,
          region: item.region_name,
          market: item.market_name,
          currentPrice: item.current_price,
          previousPrice: item.previous_price,
          prediction: item.prediction,
          lastUpdated: item.last_updated
        }))
      }))
    );
  }
  getPredictionTrend(current: number, predicted: number): string {
    if (predicted > current) return 'trend-up text-success';
    if (predicted < current) return 'trend-down text-danger';
    return 'trend-stable text-muted';
  }

  getPredictionChange(current: number, predicted: number): number {
    return ((predicted - current) / current) * 100;
  }

  getPriceChange(current: number, previous: number): number {
    return ((current - previous) / previous) * 100;
  }

}