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
  unit: string;
  source: string;
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
  _historicalData?: any[]; // ✅ NEW: Store all historical entries
  _historicalCount?: number; // ✅ NEW: Count of historical entries
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
  private readonly TREND_THRESHOLD_PERCENT = 2; // ✅ Unified threshold

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
  selectedSource = '';

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
    market: '',
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

  Math = Math; // ✅ Expose Math to template

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

  setActiveTab(tab: string) {
    this.activeTab = tab;
    this.filterCrops();
  }

  openHistoryModal(crop: DisplayCrop) {
    console.log('Opening history modal for:', crop.name);

    this.showHistory = true;
    this.historyLoading = true;
    this.selectedHistoryCrop = crop;
    this.historyData = [];

    this.priceService.getPrices({
      crop_id: crop.crop_id,
      region_id: crop.region_id,
      limit: 100
    }).subscribe({
      next: (response: any) => {
        let rawData = (response.data || response.prices || response) || [];
        const now = new Date();

        // First, filter and map the data
        let filteredData = rawData
          .filter((p: any) => {
            const entryMarket = (p.market_name || p.market || '').toLowerCase();
            const cropMarket = (crop.market || '').toLowerCase();

            const marketMatch = !cropMarket ||
              !entryMarket ||
              entryMarket.includes(cropMarket) ||
              cropMarket.includes(entryMarket) ||
              entryMarket === 'unknown' ||
              cropMarket === 'unknown';

            const entryDate = new Date(p.entry_date || p.created_at);
            const isPastOrPresent = entryDate <= now;

            return marketMatch && isPastOrPresent;
          })
          .map((item: any) => ({
            ...item,
            price: parseFloat(item.price || item.current_price || 0),
            entry_date: item.entry_date || item.created_at,
            timestamp: new Date(item.entry_date || item.created_at).getTime()
          }))
          .sort((a: any, b: any) => a.timestamp - b.timestamp); // Sort by date ascending

        // ✅ CRITICAL FIX: Deduplicate by date (keep only one entry per day)
        const dateMap = new Map<string, any>();

        filteredData.forEach((item: any) => {
          const dateKey = new Date(item.entry_date).toDateString(); // "Mon Jan 08 2026"

          if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, item);
          } else {
            // If we already have an entry for this date, keep the one with the latest timestamp
            const existing = dateMap.get(dateKey)!;
            if (item.timestamp > existing.timestamp) {
              dateMap.set(dateKey, item);
            }
          }
        });

        // Convert map back to array and sort
        this.historyData = Array.from(dateMap.values())
          .sort((a: any, b: any) => a.timestamp - b.timestamp)
          .map((item: any) => {
            const { timestamp, ...rest } = item; // Remove timestamp property
            return rest;
          });

        console.log('History data loaded:', this.historyData.length, 'entries (deduplicated by date)');
        console.log('Dates:', this.historyData.map(d =>
          `${new Date(d.entry_date).toDateString()}: KSh ${d.price}`
        ));

        if (this.historyData.length > 0) {
          this.generateChart();
        }
        this.historyLoading = false;
      },
      error: (err) => {
        console.error('History load error', err);
        this.historyLoading = false;

        if (crop._historicalData && crop._historicalData.length > 0) {
          // Also deduplicate fallback data
          const dateMap = new Map<string, any>();

          crop._historicalData
            .filter((p: any) => {
              const entryDate = new Date(p.entry_date || p.created_at);
              return entryDate <= new Date();
            })
            .forEach((item: any) => {
              const dateKey = new Date(item.entry_date || item.created_at).toDateString();
              if (!dateMap.has(dateKey)) {
                dateMap.set(dateKey, item);
              }
            });

          this.historyData = Array.from(dateMap.values())
            .sort((a: any, b: any) => {
              const dateA = new Date(a.entry_date || a.created_at).getTime();
              const dateB = new Date(b.entry_date || b.created_at).getTime();
              return dateA - dateB;
            })
            .map((item: any) => ({
              ...item,
              price: parseFloat(item.price || item.current_price || 0)
            }));

          if (this.historyData.length > 0) {
            this.generateChart();
          }
        }
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

    // Ensure all prices are numbers
    const prices = this.historyData.map(d => {
      const price = typeof d.price === 'number' ? d.price : parseFloat(d.price);
      return isNaN(price) ? 0 : price;
    });

    // Add some padding to the chart
    const minPrice = Math.min(...prices) * 0.95;
    const maxPrice = Math.max(...prices) * 1.05;
    const priceRange = maxPrice - minPrice;

    // Chart dimensions
    const width = 600;
    const height = 280;
    const padding = { top: 30, right: 20, bottom: 30, left: 50 };

    // Generate path points
    const points = this.historyData.map((d, i) => {
      const x = padding.left + (i / (this.historyData.length - 1)) * (width - padding.left - padding.right);
      const price = typeof d.price === 'number' ? d.price : parseFloat(d.price);
      const y = height - padding.bottom - ((price - minPrice) / priceRange) * (height - padding.top - padding.bottom);
      return `${x},${y}`;
    });

    // Create the SVG path
    if (points.length > 0) {
      this.chartPath = `M ${points.join(' L ')}`;
    } else {
      this.chartPath = '';
    }
  }

  getCurrentTrend(): 'up' | 'down' | 'stable' {
    if (this.historyData.length < 2) return 'stable';

    // Get the FIRST and LAST entries (to match table logic)
    const firstPrice = parseFloat(this.historyData[0]?.price || '0');
    const lastPrice = parseFloat(this.historyData[this.historyData.length - 1]?.price || '0');

    return this.calculateTrend(lastPrice, firstPrice);
  }

  getTotalChange(): number {
    if (this.historyData.length < 2) return 0;

    // Compare last vs first (to match table logic)
    const firstPrice = parseFloat(this.historyData[0]?.price || '0');
    const lastPrice = parseFloat(this.historyData[this.historyData.length - 1]?.price || '0');

    if (!firstPrice || firstPrice === 0) return 0;
    return Math.round(((lastPrice - firstPrice) / firstPrice) * 100);
  }

  getMinPrice(): number {
    if (this.historyData.length === 0) return 0;
    const prices = this.historyData.map(d => parseFloat(d.price));
    return Math.round(Math.min(...prices));
  }

  getMaxPrice(): number {
    if (this.historyData.length === 0) return 0;
    const prices = this.historyData.map(d => parseFloat(d.price));
    return Math.round(Math.max(...prices));
  }

  getAveragePrice(): number {
    if (this.historyData.length === 0) return 0;
    const prices = this.historyData.map(d => parseFloat(d.price));
    const sum = prices.reduce((a, b) => a + b, 0);
    return Math.round(sum / prices.length);
  }

  getPriceVolatility(): number {
    const range = this.getMaxPrice() - this.getMinPrice();
    const avg = this.getAveragePrice();
    if (avg === 0) return 0;
    return Math.round((range / avg) * 100);
  }

  getPreviousPoint(): { x: number, y: number } | null {
    const points = this.getChartPoints();
    if (points.length >= 2) {
      return points[points.length - 2];
    }
    return null;
  }

  getChartPoints(): Array<{ x: number, y: number }> {
    if (this.historyData.length < 2) return [];

    const prices = this.historyData.map(d => {
      const price = typeof d.price === 'number' ? d.price : parseFloat(d.price);
      return isNaN(price) ? 0 : price;
    });

    const minPrice = Math.min(...prices) * 0.95;
    const maxPrice = Math.max(...prices) * 1.05;
    const priceRange = maxPrice - minPrice;

    const width = 600;
    const height = 280;
    const padding = 50;
    const chartHeight = height - 2 * 30;
    const chartWidth = width - 2 * padding;

    return this.historyData.map((d, i) => {
      const price = typeof d.price === 'number' ? d.price : parseFloat(d.price);
      const validPrice = isNaN(price) ? 0 : price;

      const x = padding + (i / (this.historyData.length - 1)) * chartWidth;
      const y = 30 + chartHeight - ((validPrice - minPrice) / priceRange) * chartHeight;
      return { x, y };
    });
  }

  getAreaPath(): string {
    const points = this.getChartPoints();
    if (points.length < 2) return '';

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    let path = `M ${firstPoint.x},260`;
    path += ` L ${firstPoint.x},${firstPoint.y}`;

    points.slice(1).forEach(point => {
      path += ` L ${point.x},${point.y}`;
    });

    path += ` L ${lastPoint.x},260 Z`;

    return path;
  }

  getHighestPoint(): { x: number, y: number } {
    const points = this.getChartPoints();
    if (points.length === 0) return { x: 0, y: 0 };

    const prices = this.historyData.map(d => parseFloat(d.price));
    const maxPrice = Math.max(...prices);
    const maxIndex = prices.indexOf(maxPrice);

    return points[maxIndex];
  }

  getLowestPoint(): { x: number, y: number } {
    const points = this.getChartPoints();
    if (points.length === 0) return { x: 0, y: 0 };

    const prices = this.historyData.map(d => parseFloat(d.price));
    const minPrice = Math.min(...prices);
    const minIndex = prices.indexOf(minPrice);

    return points[minIndex];
  }

  // ✅ NEW: Get time span description for historical data
  getHistoricalTimeSpan(): string {
    if (this.historyData.length < 2) return 'available period';

    const first = new Date(this.historyData[0].entry_date || this.historyData[0].created_at);
    const last = new Date(this.historyData[this.historyData.length - 1].entry_date || this.historyData[this.historyData.length - 1].created_at);

    const diffMs = last.getTime() - first.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 1) return '1 day';
    if (diffDays < 7) return `${diffDays} days`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} ${Math.floor(diffDays / 7) === 1 ? 'week' : 'weeks'}`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} ${Math.floor(diffDays / 30) === 1 ? 'month' : 'months'}`;
    return `${Math.floor(diffDays / 365)} ${Math.floor(diffDays / 365) === 1 ? 'year' : 'years'}`;
  }

  getSellingAdvice(): string {
  if (this.historyData.length < 2) return 'Not enough data for advice';

  const trend = this.getCurrentTrend();
  const totalChange = this.getTotalChange();
  const currentPrice = parseFloat(this.historyData[this.historyData.length - 1].price);
  const firstPrice = parseFloat(this.historyData[0].price);
  const avgPrice = this.getAveragePrice();

  const vsAverage = ((currentPrice - avgPrice) / avgPrice) * 100;
  const timeSpan = this.getHistoricalTimeSpan();

  if (trend === 'up') {
    if (vsAverage > 10) {
      return `Over ${timeSpan}, prices rose ${totalChange}% and are ${Math.abs(Math.round(vsAverage))}% above average. Good time to sell!`;
    } else {
      return `Prices increased ${totalChange}% over ${timeSpan}. Monitor for further increases.`;
    }
  } else if (trend === 'down') {
    if (currentPrice < avgPrice * 0.9) {
      return `Over ${timeSpan}, prices fell ${Math.abs(totalChange)}% and are ${Math.abs(Math.round(vsAverage))}% below average. Consider holding.`;
    } else {
      return `Prices decreased ${Math.abs(totalChange)}% over ${timeSpan}. Sell if urgent, otherwise wait.`;
    }
  } else {
    return `Prices stable (${totalChange > 0 ? '+' : ''}${totalChange}% change over ${timeSpan}). Consistent market conditions.`;
  }
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

  // ============================================================================
  // ✅ UPDATED: loadData - Now uses historical comparison for trends
  // ============================================================================

  loadData(): void {
    this.isLoading = true;
    const crops$ = this.cropService.getCrops();
    const regions$ = this.cropService.getRegions();
    const prices$ = this.priceService.getPrices({ limit: 20000 });
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

        pricesData.sort((a: any, b: any) => {
          const timeA = new Date(a.created_at || a.entry_date).getTime();
          const timeB = new Date(b.created_at || b.entry_date).getTime();
          return timeB - timeA;
        });

        // ✅ NEW: Group prices by crop_id + region_id + market for historical calculation
        const priceGroups = new Map<string, any[]>();

        for (const item of pricesData) {
          const marketName = (item.market_name || item.market || 'unknown').toLowerCase().trim();
          const groupKey = `${item.crop_id}_${item.region_id}_${marketName}`;

          if (!priceGroups.has(groupKey)) {
            priceGroups.set(groupKey, []);
          }
          priceGroups.get(groupKey)!.push(item);
        }

        const uniquePrices: any[] = [];
        const cats = new Set<string>();

        // ✅ NEW: Process each group to get latest entry with historical context
        for (const [groupKey, groupItems] of priceGroups.entries()) {
          // Sort by date ascending (oldest first)
          groupItems.sort((a: any, b: any) =>
            new Date(a.created_at || a.entry_date).getTime() -
            new Date(b.created_at || b.entry_date).getTime()
          );

          const latestItem = groupItems[groupItems.length - 1];
          const firstItem = groupItems[0];

          latestItem._historicalFirst = parseFloat(firstItem.price || firstItem.current_price || 0);
          latestItem._historicalCount = groupItems.length;
          latestItem._historicalData = groupItems;

          uniquePrices.push(latestItem);
          const cat = latestItem.crop_category || latestItem.category || 'General';
          cats.add(cat);
        }

        this.categories = Array.from(cats).sort();

        this.allCrops = uniquePrices.map((item: any) => {
          const currentPrice = parseFloat(item.price || item.current_price || 0);
          const firstHistoricalPrice = item._historicalFirst || currentPrice;

          const predKey = `${item.crop_id}_${item.region_id}`;
          const realPrediction = predictionMap.get(predKey);

          return {
            id: item.id || item.crop_id,
            name: item.crop_name || item.name || 'Unknown',
            category: item.crop_category || item.category || 'General',
            unit: item.crop_unit || item.unit || 'kg',
            source: item.source || 'kamis',
            currentPrice: currentPrice,
            previousPrice: firstHistoricalPrice,
            trend: this.calculateTrend(currentPrice, firstHistoricalPrice),
            region: item.region_name || item.region || 'Unknown',
            market: item.market_name || item.market || 'Unknown',
            lastUpdated: this.formatDate(item.created_at || item.entry_date),
            date: item.created_at || item.entry_date,
            prediction: realPrediction ? realPrediction.predicted_price : currentPrice,
            confidence: realPrediction ? realPrediction.confidence_score : 0,
            crop_id: item.crop_id,
            region_id: item.region_id,
            _historicalData: item._historicalData,
            _historicalCount: item._historicalCount
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
    if (!previous || previous === 0) return 'stable';

    const percentChange = ((current - previous) / previous) * 100;

    if (percentChange > this.TREND_THRESHOLD_PERCENT) return 'up';
    if (percentChange < -this.TREND_THRESHOLD_PERCENT) return 'down';
    return 'stable';
  }

  getPriceChange(current: number, previous: number): number {
    if (!previous || previous <= 0) return 0;

    const percentage = ((current - previous) / previous) * 100;

    if (percentage > 300 || percentage < -80) {
      return 0;
    }
    return Math.round(percentage);
  }

  getPredictionTrend(current: number, predicted: number): string {
    if (!current || current === 0) return 'stable';

    const percentChange = ((predicted - current) / current) * 100;

    if (percentChange > this.TREND_THRESHOLD_PERCENT) return 'up';
    if (percentChange < -this.TREND_THRESHOLD_PERCENT) return 'down';
    return 'stable';
  }

  getPredictionChange(current: number, predicted: number): number {
    if (!current || !predicted || current === 0) return 0;

    const percentage = ((predicted - current) / current) * 100;

    if (percentage > 300 || percentage < -80) {
      return 0;
    }

    return Math.round(percentage);
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

      let matchesSource = true;
      if (this.selectedSource === 'official') {
        matchesSource = crop.source === 'kamis' || crop.source === 'admin';
      } else if (this.selectedSource === 'farmer') {
        matchesSource = crop.source === 'farmer';
      }

      return matchesSearch && matchesCategory && matchesRegion && matchesSource;
    });

    if (this.activeTab === 'predictions') {
      this.filteredCrops.sort((a, b) => {
        const getChange = (c: DisplayCrop) => {
          if (!c.currentPrice || c.prediction == null) return -1;
          return Math.abs((c.prediction - c.currentPrice) / c.currentPrice);
        };
        return getChange(b) - getChange(a);
      });
    } else {
      this.filteredCrops.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    this.currentPage = 1;
  }


  checkAuth() {
    const adminUser = this.authService.getCurrentUser();
    if (adminUser && (adminUser.role === 'admin' || adminUser.role === 'super_admin')) {
      this.isLoggedIn = true;
      this.isAdmin = true;
      this.farmerName = adminUser.full_name || 'Admin';
      return;
    }

    const farmerToken = localStorage.getItem('farmer_token');
    const farmerName = localStorage.getItem('farmer_name');
    if (farmerToken && farmerName) {
      this.isLoggedIn = true;
      this.isAdmin = false;
      this.farmerName = farmerName;
      return;
    }

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
        this.resetMessage = `If an account with phone ${this.resetPhone} exists, a reset link has been processed.`;
        this.resetPhone = '';
      },
      error: (error) => {
        this.isLoading = false;
        this.resetMessage = error.error?.message || 'Failed to process request. Please try again later.';
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
          `Registration Successful!\n\n` +
          `Welcome ${response.data.user.full_name}!\n\n` +
          `═══════════════════════════════\n` +
          `Phone: ${response.data.user.phone}\n` +
          `Password: ${response.data.tempPassword}\n` +
          `═══════════════════════════════\n\n` +
          `SAVE THIS PASSWORD!\n` +
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
    alert('Logging out now.');

    if (this.isAdmin) {
      alert('To fully logout as admin, use the logout button in the header.');
      return;
    } else {
      localStorage.removeItem('farmer_token');
      localStorage.removeItem('farmer_name');
      this.isLoggedIn = false;
      this.isAdmin = false;
      this.farmerName = '';
      alert('You have been logged out successfully');
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
      market: this.priceInput.market
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
        alert('Price submitted successfully! It will be verified by our admin team.');
        this.priceInput = { crop: '', price: 0, market: '', region: '', notes: '' };

        this.loadData();
      },
      error: (error) => {
        console.error('Error submitting price:', error);
        this.isLoading = false;
        this.errorMessage = error.error?.error || 'Failed to submit price. Please try again.';
      }
    });
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