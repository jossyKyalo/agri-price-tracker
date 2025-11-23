import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PriceService, CropPrice, CreatePriceEntry, PricePrediction } from '../../services/price.service';
import { CropService, Crop, Region } from '../../services/crop.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LoginRequest } from '../../services/auth.service';
import { SmsService, SmsSubscription } from '../../services/sms.service';
import { forkJoin } from 'rxjs';

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
  prediction: number | null;
  crop_id: string;
  region_id: string;
  confidence: number;
  date: string | Date;
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
  isAdmin = false;

  isForgotPasswordMode = false;
  resetPhone = '';
  resetMessage = '';

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
  aiAccuracy: number = 0;

  // Pagination
  currentPage: number = 1;
  itemsPerPage: number = 12;

  // Price input form
  priceInput = {
    crop: '',
    price: 0,
    location: '',
    region: '',
    notes: ''
  };

  smsSubPhone: string = '';
  smsSubCrops: { [cropName: string]: boolean } = {};
  smsSubMessage: string = '';
  smsSubIsError: boolean = false;

  allCrops: DisplayCrop[] = [];
  crops: Crop[] = [];
  regions: Region[] = [];
  filteredCrops: DisplayCrop[] = [];
  categories: string[] = [];

  // HISTORY MODAL STATE 
  showHistory = false;
  historyLoading = false;
  selectedHistoryCrop: any = null;
  historyData: any[] = [];
  chartPath: string = '';
  chartPoints: string = '';

  constructor(
    private http: HttpClient,
    private priceService: PriceService,
    private cropService: CropService,
    private apiService: ApiService,
    private authService: AuthService,
    private smsService: SmsService
  ) { }

  ngOnInit(): void {
    this.checkAuth();
    this.loadData();
  }
 
  openHistoryModal(crop: DisplayCrop) {
    this.showHistory = true;
    this.historyLoading = true;
    this.selectedHistoryCrop = crop;
    this.historyData = []; 
 
    this.priceService.getPrices({ 
      crop_id: crop.crop_id, 
      region_id: crop.region_id,  
      limit: 50 
    }).subscribe({
      next: (response: any) => {
        let rawData = (response.data || response.prices || response) || [];
        
        const now = new Date();
        this.historyData = rawData
          .filter((p: any) => { 
             const m1 = (p.market_name || p.market || '').toLowerCase();
             const m2 = (crop.market || '').toLowerCase();
             return m1.includes(m2) || m2.includes(m1);
          })
          .filter((p: any) => new Date(p.entry_date) <= now)
          .sort((a: any, b: any) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());  

        this.generateChart();
        this.historyLoading = false;
      },
      error: (err) => {
        console.error('History load error', err);
        this.historyLoading = false;
      }
    });
  }

  closeHistoryModal() {
    this.showHistory = false;
    this.selectedHistoryCrop = null;
  }

  generateChart() {
    if (this.historyData.length < 2) {
      this.chartPath = '';
      return;
    }
 
    const prices = this.historyData.map(d => parseFloat(d.price));
    const minPrice = Math.min(...prices) * 0.95; 
    const maxPrice = Math.max(...prices) * 1.05;
    const priceRange = maxPrice - minPrice;

     
    const width = 600;
    const height = 200;
    const padding = 20;
 
    const points = this.historyData.map((d, i) => {
      const x = padding + (i / (this.historyData.length - 1)) * (width - 2 * padding);
      const price = parseFloat(d.price); 
      const y = height - padding - ((price - minPrice) / priceRange) * (height - 2 * padding);
      return `${x},${y}`;
    });
 
    this.chartPath = `M ${points.join(' L ')}`;
     
    this.chartPoints = points.join(' '); 
  }

  get paginatedCrops() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredCrops.slice(startIndex, startIndex + this.itemsPerPage);
  }

  get totalPages() {
    return Math.ceil(this.filteredCrops.length / this.itemsPerPage) || 1;
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  loadData(): void {
    this.isLoading = true;
    const crops$ = this.cropService.getCrops();
    const regions$ = this.cropService.getRegions();
    const prices$ = this.priceService.getPrices({ limit: 3000 });
    const predictions$ = this.priceService.getPredictions();
    const mlStats$ = this.apiService.get<any>('/ml/');

    forkJoin({
      crops: crops$,
      regions: regions$,
      prices: prices$,
      predictions: predictions$,
      mlStats: mlStats$
    }).subscribe({
      next: ({ crops, regions, prices, predictions, mlStats }) => {
        this.crops = ((crops as any).data || crops) || [];
        this.regions = ((regions as any).data || regions) || [];
        this.totalCrops = this.crops.length;
        this.totalRegions = this.regions.length;

        if (mlStats?.data?.performance?.r2) {
          this.aiAccuracy = Math.round(mlStats.data.performance.r2 * 100);
        }

        const predictionMap = new Map<string, PricePrediction>();
        for (const pred of predictions) {
          predictionMap.set(`${pred.crop_id}_${pred.region_id}`, pred);
        }

        let pricesData = ((prices as any).data || (prices as any).prices || prices) || [];
        const now = new Date();
        pricesData = pricesData.filter((p: any) => new Date(p.entry_date || p.created_at) <= now);

        
        pricesData.sort((a: any, b: any) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());

  
        const uniqueMap = new Map<string, boolean>();
        const uniquePrices: any[] = [];
        const cats = new Set<string>();

        for (const item of pricesData) {
          const marketName = (item.market_name || item.market || 'unknown').toLowerCase().trim();
          const uniqueKey = `${item.crop_id}_${item.region_id}_${marketName}`;

          if (!uniqueMap.has(uniqueKey)) {
            uniqueMap.set(uniqueKey, true);
            uniquePrices.push(item);
            if (item.category) cats.add(item.category);
          }
        }

        this.categories = Array.from(cats).sort();

        this.allCrops = uniquePrices.map((item: any) => {
          const currentPrice = parseFloat(item.price || item.current_price || 0);
          const predKey = `${item.crop_id}_${item.region_id}`;
          const realPrediction = predictionMap.get(predKey);
          const previousPrice = parseFloat(item.previous_price || currentPrice);

          return {
            id: item.id || item.crop_id,
            name: item.crop_name || item.name || 'Unknown',
            category: item.category || 'General',
            currentPrice: currentPrice,
            previousPrice: previousPrice,
            trend: this.calculateTrend(currentPrice, previousPrice),
            region: item.region_name || item.region || 'Unknown',
            market: item.market_name || item.market || 'Unknown',
            lastUpdated: this.formatDate(item.entry_date || item.created_at),
            date: item.entry_date || item.created_at, 
            prediction: realPrediction ? realPrediction.predicted_price : currentPrice,
            confidence: realPrediction ? realPrediction.confidence_score : 0,
            crop_id: item.crop_id,
            region_id: item.region_id
          } as DisplayCrop;
        });

        this.filteredCrops = this.allCrops;
        this.isLoading = false;
        if (this.allCrops.length > 0) this.lastUpdated = this.allCrops[0].lastUpdated;
      },
      error: (error) => {
        console.error('Data load error', error);
        this.isLoading = false;
        this.errorMessage = "Failed to load market data.";
      }
    });
  }


  calculateTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    const diff = current - previous;
    if (diff > (previous * 0.01)) return 'up';
    if (diff < -(previous * 0.01)) return 'down';
    return 'stable';
  }

  formatDate(date: string | Date): string {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();

    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) {
      return 'Just now';
    }

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
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

    this.currentPage = 1;
  }

  checkAuth() {
    // Check if logged in as admin
    const adminUser = this.authService.getCurrentUser();
    if (adminUser && (adminUser.role === 'admin' || adminUser.role === 'super_admin')) {
      this.isLoggedIn = true;
      this.isAdmin = true;
      this.farmerName = adminUser.full_name || 'Admin';
      return;
    }

    // Check if logged in as farmer
    const farmerToken = localStorage.getItem('farmer_token');
    const farmerName = localStorage.getItem('farmer_name');
    if (farmerToken && farmerName) {
      this.isLoggedIn = true;
      this.isAdmin = false;
      this.farmerName = farmerName;
      return;
    }

    // Not logged in
    this.isLoggedIn = false;
    this.isAdmin = false;
    this.farmerName = '';
  }

  showForgotPassword() {
    this.isForgotPasswordMode = true;
    this.showLogin = false;
    this.errorMessage = '';
    this.resetMessage = '';
  }

  backToLogin() {
    this.isForgotPasswordMode = false;
    this.showLogin = true;
    this.resetMessage = '';
  }

  requestPasswordReset() {
    if (!this.resetPhone) {
      this.resetMessage = 'Please enter your phone number.';
      return;
    }

    this.isLoading = true;
    this.resetMessage = '';

    const farmerEmail = `farmer${this.resetPhone.replace(/[^\d]/g, '')}@agriprice.local`;

    this.authService.requestPasswordReset(farmerEmail).subscribe({
      next: () => {
        this.isLoading = false;
        this.resetMessage = `✅ If an account with phone ${this.resetPhone} exists, a reset link has been processed.`;
        this.resetPhone = '';
      },
      error: (error) => {
        this.isLoading = false;
        this.resetMessage = error.error?.message || '❌ Failed to process request. Please try again later.';
      }
    });
  }

  quickRegister() {
    this.isLoading = true;
    this.errorMessage = '';
    this.isForgotPasswordMode = false;

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
    this.isForgotPasswordMode = false;

    const loginRequest: LoginRequest = {
      email: `farmer${this.login.phone.replace(/[^\d]/g, '')}@agriprice.local`,
      password: this.login.password
    };

    this.http.post(`${this.baseUrl}/auth/login/farmer`, {
      phone: this.login.phone,
      password: this.login.password
    }).subscribe({
      next: (response: any) => {
        this.isLoading = false;

        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('currentUser', JSON.stringify(response.data.user));
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

  logoutPortal() {
    alert('ℹ️ Logging out now.');

    if (this.isAdmin) {
      alert('ℹ️ To fully logout as admin, use the logout button in the header.');
      return;
    } else {
      localStorage.removeItem('farmer_token');
      localStorage.removeItem('farmer_name');
      this.isLoggedIn = false;
      this.isAdmin = false;
      this.farmerName = '';
      alert('✅ You have been logged out successfully');
    }
  }

  logout() {
    this.logoutPortal()
  }

  submitPrice() {
    if (!this.priceInput.crop || !this.priceInput.price || !this.priceInput.region) {
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const crop = this.crops.find(c => c.name.toLowerCase() === this.priceInput.crop.toLowerCase());
    const region = this.regions.find(r => r.name.toLowerCase() === this.priceInput.region.toLowerCase());

    if (!crop || !region) {
      this.errorMessage = 'Invalid crop or region selected';
      this.isLoading = false;
      return;
    }

    const priceData: CreatePriceEntry = {
      crop_id: crop.id,
      region_id: region.id,
      price: this.priceInput.price,
      notes: this.priceInput.notes,
      market: this.priceInput.location
    };

    const token = this.isAdmin
      ? localStorage.getItem('authToken')
      : localStorage.getItem('farmer_token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    this.http.post(`${this.baseUrl}/prices/submit`, priceData, { headers }).subscribe({
      next: (response) => {
        this.isLoading = false;
        alert('✅ Price submitted successfully! It will be verified by our admin team.');
        this.priceInput = { crop: '', price: 0, location: '', region: '', notes: '' };

        this.loadData();
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
    if (!current || !predicted) return 0;
    return Math.round(((predicted - current) / current) * 100);
  }

  getPriceChange(current: number, previous: number): number {
    if (!previous || previous <= 10) return 0;
    const percentage = ((current - previous) / previous) * 100;
    if (percentage > 300 || percentage < -80) {
      return 0;
    }
    return Math.round(percentage);
  }

  subscribeToSms() {
    this.isLoading = true;
    this.smsSubMessage = '';
    this.smsSubIsError = false;

    const selectedCropNames = Object.keys(this.smsSubCrops).filter(
      cropName => this.smsSubCrops[cropName]
    );

    if (selectedCropNames.length === 0) {
      this.smsSubMessage = 'Please select at least one crop to subscribe.';
      this.smsSubIsError = true;
      this.isLoading = false;
      return;
    }

    if (!this.smsSubPhone) {
      this.smsSubMessage = 'Please enter your phone number.';
      this.smsSubIsError = true;
      this.isLoading = false;
      return;
    }

    const selectedCropIDs = selectedCropNames.map(cropName => {
      const crop = this.crops.find(c => c.name === cropName);
      return crop ? crop.id : null;
    }).filter(id => id !== null);

    if (selectedCropIDs.length !== selectedCropNames.length) {
      this.smsSubMessage = 'An error occurred matching crop names to IDs.';
      this.smsSubIsError = true;
      this.isLoading = false;
      return;
    }

    const subscriptionData: SmsSubscription = {
      phone: this.smsSubPhone,
      crops: selectedCropIDs,
      alert_types: ['price-alert', 'price-update']
    };

    this.smsService.subscribeSms(subscriptionData).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.smsSubMessage = '✅ Success! You are now subscribed to SMS alerts.';
        this.smsSubIsError = false;
        this.smsSubPhone = '';
        this.smsSubCrops = {};
      },
      error: (error) => {
        this.isLoading = false;
        this.smsSubMessage = error.error?.error || 'Subscription failed. Please try again.';
        this.smsSubIsError = true;
      }
    });
  }
}