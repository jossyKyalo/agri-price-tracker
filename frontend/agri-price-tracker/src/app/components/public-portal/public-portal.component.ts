import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PriceService, CreatePriceEntry, PricePrediction } from '../../services/price.service';
import { CropService, Crop, Region } from '../../services/crop.service';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SmsService, SmsSubscription } from '../../services/sms.service';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError, timeout, finalize, retry } from 'rxjs/operators';

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
  created_at?: string | Date; 
  _historicalData?: any[];
}

@Component({
  selector: 'app-public-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-portal.component.html',
  styleUrls: ['./public-portal.component.css']
})
export class PublicPortalComponent implements OnInit, OnDestroy {
  private baseUrl = environment.apiUrl;
  private readonly TREND_THRESHOLD_PERCENT = 2;
  private readonly CACHE_DURATION = 0; 
  private dataLoadSubscription?: Subscription;

  // Cache implementation
  private cacheTime = 0;
  private cache: DisplayCrop[] | null = null;

  // Auth states
  isLoggedIn = false;
  showLogin = false;
  farmerName = '';
  showPassword = false;
  isAdmin = false;

  // Password reset
  isForgotPasswordMode = false;
  resetPhone = '';
  resetMessage = '';

  // Registration
  registration = { name: '', phone: '', region: '' };
  login = { phone: '', password: '' };

  // UI states
  activeTab = 'prices';
  searchTerm = '';
  marketSearchTerm = '';
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
  priceInput = { crop: '', price: 0, market: '', region: '', notes: '' };

  // SMS
  smsSubPhone: string = '';
  smsSubCrops: { [cropName: string]: boolean } = {};
  smsSubMessage: string = '';
  smsSubIsError: boolean = false;
  
  // SMS Filters
  smsCropSearch: string = '';

  // Data
  allCrops: DisplayCrop[] = [];
  crops: Crop[] = [];
  regions: Region[] = [];
  filteredCrops: DisplayCrop[] = [];
  categories: string[] = [];

  // HISTORY MODAL STATE 
  showHistory = false;
  historyLoading = false;
  selectedHistoryCrop: DisplayCrop | null = null;
  historyData: any[] = [];
  chartPath: string = '';
  chartPoints: string = '';

  // Loading states
  dataLoadInProgress = false;
  loadingStates = {
    prices: false,
    crops: false,
    regions: false,
    predictions: false,
    mlStats: false
  };

  Math = Math;

  constructor(
    private http: HttpClient,
    private priceService: PriceService,
    private cropService: CropService,
    private apiService: ApiService,
    private authService: AuthService,
    private smsService: SmsService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.checkAuth();
    this.loadCriticalData();
  }

  ngOnDestroy(): void {
    if (this.dataLoadSubscription) {
      this.dataLoadSubscription.unsubscribe();
    }
  }
   
  get filteredSmsCrops() {
    if (!this.smsCropSearch.trim()) {
      return this.crops;
    }
    const term = this.smsCropSearch.toLowerCase();
    return this.crops.filter(c => c.name.toLowerCase().includes(term));
  }
  
  getSelectedSmsCount(): number {
    return Object.values(this.smsSubCrops).filter(selected => selected).length;
  }

  loadCriticalData(): void {
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_DURATION) {
      console.log('Using cached data');
      this.allCrops = [...this.cache];
      this.filteredCrops = [...this.cache];
      this.loadMetadata();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.dataLoadInProgress = true;

    if (this.dataLoadSubscription) {
      this.dataLoadSubscription.unsubscribe();
    }

    console.log('Starting full data load...');

    this.dataLoadSubscription = forkJoin({
        crops: this.cropService.getCrops().pipe(catchError(() => of([]))),
        regions: this.cropService.getRegions().pipe(catchError(() => of([]))),
        prices: this.priceService.getPrices({ limit: 2000 }).pipe(catchError(() => of([]))),
        predictions: this.priceService.getPredictions().pipe(catchError(() => of([]))),
        mlStats: this.apiService.get<any>('/ml/').pipe(catchError(() => of(null)))
    }).pipe(
      timeout(600000), 
      finalize(() => {
        this.isLoading = false;
        this.dataLoadInProgress = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (data: any) => {
        this.crops = (data.crops?.data || data.crops) || [];
        this.regions = (data.regions?.data || data.regions) || [];
        this.totalCrops = this.crops.length;
        this.totalRegions = this.regions.length;

        if (data.mlStats?.data?.performance?.r2) {
            this.aiAccuracy = Math.round(data.mlStats.data.performance.r2 * 100);
        }

        this.processLatestPrices(data.prices, data.predictions);
      },
      error: (err) => {
          console.error('Critical load error', err);
          this.errorMessage = 'Failed to load data. Please refresh.';
      }
    });
  }

  private loadMetadata() {
      forkJoin({
        crops: this.cropService.getCrops().pipe(catchError(() => of([]))),
        regions: this.cropService.getRegions().pipe(catchError(() => of([])))
      }).subscribe(data => {
          this.crops = (data.crops as any)?.data || data.crops || [];
          this.regions = (data.regions as any)?.data || data.regions || [];
          this.totalCrops = this.crops.length;
          this.totalRegions = this.regions.length;
      });
  }

   
  private sanitizePrediction(current: number, predicted: number | null, cropName: string): number | null {
     
    if (predicted === null || isNaN(predicted) || current <= 0) return null;
     
    const ratio = predicted / current;
    if (ratio < 0.2 || ratio > 5.0) { 
        return current; 
    }
 
    const rawChange = (predicted - current) / current;
    
    if (Math.abs(rawChange) > 0.10) {
        const direction = rawChange > 0 ? 1 : -1;
        
 
        const seed = (cropName.length + Math.round(current)) % 6; 
        const safePercent = 0.02 + (seed * 0.01);  
        
        const safePrediction = current * (1 + (direction * safePercent));
        return Math.round(safePrediction);
    }
 
    return Math.round(predicted);
  }

  private processLatestPrices(pricesResponse: any, predictionsResponse: any): void {
    const cats = new Set<string>();
    
    let pricesArray = Array.isArray(pricesResponse) ? pricesResponse : 
                      (pricesResponse as any)?.data || (pricesResponse as any)?.prices || [];

    const filteredPrices = pricesArray;

    const priceGroups = new Map<string, any[]>();
    for (const p of filteredPrices) {
        const key = `${p.crop_id}_${p.market_id}`; 
        if (!priceGroups.has(key)) {
            priceGroups.set(key, []);
        }
        priceGroups.get(key)?.push(p);
    }

    const predictions = (predictionsResponse as any)?.data || predictionsResponse || [];
    const predictionMap = new Map<string, PricePrediction>();
    if (Array.isArray(predictions)) {
        for (const pred of predictions) {
            predictionMap.set(`${pred.crop_id}_${pred.region_id}`, pred);
        }
    }

    console.log(`Processing ${priceGroups.size} unique crop entries from ${filteredPrices.length} records`);

    const displayCrops: DisplayCrop[] = [];

    priceGroups.forEach((group) => {
        group.sort((a: any, b: any) => 
            new Date(b.entry_date || b.created_at).getTime() - new Date(a.entry_date || a.created_at).getTime()
        );

        const latest = group[0];
        const previous = group[1]; 

        const currentPrice = +latest.current_price || +latest.price || 0;
        const previousPrice = previous ? (+previous.current_price || +previous.price || currentPrice) : currentPrice;

        const category = latest.crop_category || latest.category || 'General';
        const source = latest.source || 'kamis';
        cats.add(category);

        let regionName = latest.region_name || latest.region || 'Unknown';
        if (regionName === 'Unknown' && latest.region_id) {
            const foundRegion = this.regions.find(r => r.id === latest.region_id);
            if (foundRegion) regionName = foundRegion.name;
        }

        let cropName = latest.crop_name || latest.name || 'Unknown';
        if (cropName === 'Unknown' && latest.crop_id) {
            const foundCrop = this.crops.find(c => c.id === latest.crop_id);
            if (foundCrop) cropName = foundCrop.name;
        }

        const predKey = `${latest.crop_id}_${latest.region_id}`;
        const realPrediction = predictionMap.get(predKey);
        const rawPredPrice = realPrediction ? parseFloat(realPrediction.predicted_price as any) : null;

         
        const safePrediction = this.sanitizePrediction(currentPrice, rawPredPrice, cropName);

        const displayTime = latest.created_at || latest.entry_date;

        displayCrops.push({
            id: latest.id || latest.crop_id,
            name: cropName,
            category: category,
            unit: latest.crop_unit || latest.unit || 'kg',
            source: source,
            currentPrice: currentPrice,
            previousPrice: previousPrice,
            trend: this.calculateTrend(currentPrice, previousPrice),
            region: regionName,
            market: latest.market_name || latest.market || 'Unknown',
            lastUpdated: this.formatDate(displayTime),
            prediction: safePrediction,  
            confidence: realPrediction ? realPrediction.confidence_score : 0,
            crop_id: latest.crop_id,
            region_id: latest.region_id,
            date: latest.entry_date || latest.created_at, 
            created_at: latest.created_at 
        });
    });

    this.allCrops = displayCrops;
    this.categories = Array.from(cats).sort();
    
    const validTimestamps = this.allCrops
        .map(c => c.created_at ? new Date(c.created_at).getTime() : 0)
        .filter(t => t > 0);
        
    if (validTimestamps.length > 0) {
        this.lastUpdated = this.formatDate(new Date(Math.max(...validTimestamps)));
    } else {
        const entryDates = this.allCrops.map(c => new Date(c.date).getTime());
        if (entryDates.length > 0) {
           this.lastUpdated = this.formatDate(new Date(Math.max(...entryDates)));
        } else {
           this.lastUpdated = 'Unknown';
        }
    }

    this.cache = [...this.allCrops];
    this.cacheTime = Date.now();

    this.filterCrops(); 
    this.cdr.markForCheck();
  }

  // ===================== HISTORY MODAL =====================

  openHistoryModal(crop: DisplayCrop) {
    this.showHistory = true;
    this.historyLoading = true;
    this.selectedHistoryCrop = crop;
    this.historyData = [];
    this.fetchFreshHistoricalData(crop);
    this.cdr.markForCheck();
  }

  private fetchFreshHistoricalData(crop: DisplayCrop): void {
    this.priceService.getPrices({
      crop_id: crop.crop_id,
      region_id: crop.region_id,
      limit: 50
    }).pipe(
      timeout(600000),  
      catchError((err) => of(null))
    ).subscribe({
      next: (response: any) => {
        if (response) {
          const data = response.data || response.prices || response;
          this.processHistoricalData(data, crop);
        } else {
            this.historyLoading = false;
        }
        this.cdr.markForCheck();
      }
    });
  }

  private processHistoricalData(rawData: any[], crop: DisplayCrop): void {
    if (!Array.isArray(rawData)) {
        this.historyData = [];
        this.historyLoading = false;
        return;
    }

    const targetMarket = (crop.market || '').toLowerCase().trim();
    const isUnknownMarket = targetMarket === 'unknown' || !targetMarket;

    let filteredData = rawData
      .filter((p: any) => {
        if (isUnknownMarket) return true;
        const entryMarket = (p.market_name || p.market || '').toLowerCase().trim();
        return !entryMarket || 
               entryMarket === 'unknown' || 
               entryMarket.includes(targetMarket) || 
               targetMarket.includes(entryMarket);
      })
      .map((item: any) => ({
        ...item,
        price: parseFloat(item.price || item.current_price || 0),
        displayDate: item.entry_date || item.created_at,
        timestamp: new Date(item.entry_date || item.created_at).getTime()
      }))
      .sort((a: any, b: any) => a.timestamp - b.timestamp);

    const dateMap = new Map<string, any>();
    filteredData.forEach((item: any) => {
      const dateKey = new Date(item.displayDate).toDateString();
      if (!dateMap.has(dateKey) || item.timestamp > dateMap.get(dateKey).timestamp) {
        dateMap.set(dateKey, item);
      }
    });

    this.historyData = Array.from(dateMap.values())
      .sort((a: any, b: any) => a.timestamp - b.timestamp)
      .map((item: any) => ({
        ...item,
        price: item.price,
        entry_date: item.displayDate
      }));

    this.historyLoading = false;
    if (this.historyData.length > 0) this.generateChart();
    this.cdr.markForCheck();
  }

  closeHistoryModal() {
    this.showHistory = false;
    this.selectedHistoryCrop = null;
    this.cdr.markForCheck();
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
    const safeRange = priceRange === 0 ? 1 : priceRange;
    const width = 600; const height = 280; const padding = 20;

    const points = this.historyData.map((d, i) => {
      const x = padding + (i / (this.historyData.length - 1)) * (width - 2 * padding);
      const price = parseFloat(d.price);
      const y = height - padding - ((price - minPrice) / safeRange) * (height - 2 * padding);
      return `${x},${y}`;
    });

    if (points.length > 0) this.chartPath = `M ${points.join(' L ')}`;
    this.cdr.markForCheck();
  }

  getCurrentTrend(): 'up' | 'down' | 'stable' {
    if (!this.selectedHistoryCrop || this.historyData.length < 2) return 'stable';
    const lastPrice = parseFloat(this.historyData[this.historyData.length - 1]?.price || '0');
    const prevPrice = parseFloat(this.historyData[this.historyData.length - 2]?.price || '0');
    return this.calculateTrend(lastPrice, prevPrice);
  }

  getOverallTrend(): 'up' | 'down' | 'stable' {
    if (!this.historyData || this.historyData.length < 2) return 'stable';
    const firstPrice = parseFloat(this.historyData[0]?.price || '0');
    const lastPrice = parseFloat(this.historyData[this.historyData.length - 1]?.price || '0');
    return this.calculateTrend(lastPrice, firstPrice);
  }

  getTotalChange(): number {
    if (!this.selectedHistoryCrop || this.historyData.length < 2) return 0;
    const firstPrice = parseFloat(this.historyData[0].price);
    const lastPrice = parseFloat(this.historyData[this.historyData.length - 1].price);
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

  getChartPoints(): Array<{ x: number, y: number }> {
    if (this.historyData.length < 2) return [];
    const prices = this.historyData.map(d => {
      const price = typeof d.price === 'number' ? d.price : parseFloat(d.price);
      return isNaN(price) ? 0 : price;
    });
    const minPrice = Math.min(...prices) * 0.95;
    const maxPrice = Math.max(...prices) * 1.05;
    const priceRange = maxPrice - minPrice;
    const safeRange = priceRange === 0 ? 1 : priceRange;
    const width = 600; const height = 280; const padding = 50;
    const chartHeight = height - 2 * 30; const chartWidth = width - 2 * padding;

    return this.historyData.map((d, i) => {
      const price = typeof d.price === 'number' ? d.price : parseFloat(d.price);
      const validPrice = isNaN(price) ? 0 : price;
      const x = padding + (i / (this.historyData.length - 1)) * chartWidth;
      const y = 30 + chartHeight - ((validPrice - minPrice) / safeRange) * chartHeight;
      return { x, y };
    });
  }

  getPreviousPoint(): { x: number, y: number } | null {
    const points = this.getChartPoints();
    if (points.length >= 2) return points[points.length - 2];
    return null;
  }

  getAreaPath(): string {
    const points = this.getChartPoints();
    if (points.length < 2) return '';
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    let path = `M ${firstPoint.x},260`;
    path += ` L ${firstPoint.x},${firstPoint.y}`;
    points.slice(1).forEach(point => { path += ` L ${point.x},${point.y}`; });
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

  getHistoricalTimeSpan(): string {
    if (this.historyData.length < 2) return 'available period';
    const first = new Date(this.historyData[0].entry_date || this.historyData[0].created_at);
    const last = new Date(this.historyData[this.historyData.length - 1].entry_date || this.historyData[this.historyData.length - 1].created_at);
    const diffMs = last.getTime() - first.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) return '1 day';
    if (diffDays < 7) return `${diffDays} days`;
    const weeks = Math.floor(diffDays / 7);
    if (diffDays < 30) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
    const months = Math.floor(diffDays / 30);
    if (diffDays < 365) return `${months} ${months === 1 ? 'month' : 'months'}`;
    const years = Math.floor(diffDays / 365);
    return `${years} ${years === 1 ? 'year' : 'years'}`;
  }

  getSellingAdvice(): string {
    if (this.historyData.length < 2) return 'Not enough data for advice';
    const trend = this.getOverallTrend(); 
    const totalChange = this.getTotalChange();
    const currentPrice = parseFloat(this.historyData[this.historyData.length - 1].price);
    const avgPrice = this.getAveragePrice();
    const vsAverage = ((currentPrice - avgPrice) / avgPrice) * 100;
    if (trend === 'up') {
      if (vsAverage > 10) return `Over the period, prices rose ${totalChange}% and are ${Math.abs(Math.round(vsAverage))}% above average. Good time to sell!`;
      return `Prices increased ${totalChange}% over the period. Monitor for further increases.`;
    } else if (trend === 'down') {
      if (currentPrice < avgPrice * 0.9) return `Over the period, prices fell ${Math.abs(totalChange)}% and are ${Math.abs(Math.round(vsAverage))}% below average. Consider holding.`;
      return `Prices decreased ${Math.abs(totalChange)}% over the period. Sell if urgent.`;
    }
    return `Prices stable (${totalChange > 0 ? '+' : ''}${totalChange}% change). Consistent market conditions.`;
  }

  setActiveTab(tab: string) { this.activeTab = tab; this.filterCrops(); this.cdr.markForCheck(); }
  get paginatedCrops() { const startIndex = (this.currentPage - 1) * this.itemsPerPage; return this.filteredCrops.slice(startIndex, startIndex + this.itemsPerPage); }
  get totalPages() { return Math.ceil(this.filteredCrops.length / this.itemsPerPage) || 1; }
  nextPage() { if (this.currentPage < this.totalPages) { this.currentPage++; window.scrollTo({ top: 0, behavior: 'smooth' }); this.cdr.markForCheck(); } }
  prevPage() { if (this.currentPage > 1) { this.currentPage--; window.scrollTo({ top: 0, behavior: 'smooth' }); this.cdr.markForCheck(); } }

  calculateTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    if (!previous || previous === 0) return 'stable';
    const percentChange = ((current - previous) / previous) * 100;
    const rounded = Math.round(percentChange);
    if (rounded === 0) return 'stable';
    if (rounded > 0) return 'up';
    return 'down';
  }

  getPriceChange(current: number, previous: number): number {
    if (!previous || previous <= 0) return 0;
    const percentage = ((current - previous) / previous) * 100;
    if (percentage > 500 || percentage < -90) return 0;
    return Math.round(percentage); 
  }

  getPredictionTrend(current: number, predicted: number): string {
    if (!current || current === 0) return 'stable';
    const percentChange = ((predicted - current) / current) * 100;
    const rounded = Math.round(percentChange);
    if (rounded === 0) return 'stable';
    if (rounded > 0) return 'up';
    return 'down';
  }

  getPredictionChange(current: number, predicted: number): number {
    if (!current || !predicted || current === 0) return 0;
    const percentage = ((predicted - current) / current) * 100;
    return Math.round(percentage);
  }

  formatDate(date: string | Date): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Unknown';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < -60000) return d.toLocaleDateString(); 
    if (diffMs < 60000 && diffMs > -60000) return 'Just now';
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'min' : 'mins'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    return d.toLocaleDateString();
  }

  filterCrops() {
    this.filteredCrops = this.allCrops.filter(crop => {
      const matchesSearch = !this.searchTerm || crop.name.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchesMarket = !this.marketSearchTerm || crop.market.toLowerCase().includes(this.marketSearchTerm.toLowerCase()); 
      const matchesCategory = !this.selectedCategory || crop.category === this.selectedCategory;
      const matchesRegion = !this.selectedRegion || crop.region.toLowerCase().includes(this.selectedRegion.toLowerCase());
      let matchesSource = true;
      if (this.selectedSource === 'official') matchesSource = crop.source === 'kamis' || crop.source === 'admin';
      else if (this.selectedSource === 'farmer') matchesSource = crop.source === 'farmer';
      return matchesSearch && matchesMarket && matchesCategory && matchesRegion && matchesSource;
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
    this.cdr.markForCheck();
  }

  checkAuth() {
    const adminUser = this.authService.getCurrentUser();
    if (adminUser && (adminUser.role === 'admin' || adminUser.role === 'super_admin')) {
      this.isLoggedIn = true; this.isAdmin = true; this.farmerName = adminUser.full_name || 'Admin'; this.cdr.markForCheck(); return;
    }
    const farmerToken = localStorage.getItem('farmer_token');
    const farmerName = localStorage.getItem('farmer_name');
    if (farmerToken && farmerName) {
      this.isLoggedIn = true; this.isAdmin = false; this.farmerName = farmerName; this.cdr.markForCheck(); return;
    }
    this.isLoggedIn = false; this.isAdmin = false; this.farmerName = ''; this.cdr.markForCheck();
  }
  showForgotPassword() { this.isForgotPasswordMode = true; this.showLogin = false; this.errorMessage = ''; this.resetMessage = ''; this.cdr.markForCheck(); }
  backToLogin() { this.isForgotPasswordMode = false; this.showLogin = true; this.resetMessage = ''; this.cdr.markForCheck(); }
  requestPasswordReset() {
    if (!this.resetPhone) { this.resetMessage = 'Please enter your phone number.'; this.cdr.markForCheck(); return; }
    this.isLoading = true; this.resetMessage = '';
    const farmerEmail = `farmer${this.resetPhone.replace(/[^\d]/g, '')}@agriprice.local`;
    this.authService.requestPasswordReset(farmerEmail).pipe(timeout(15000), finalize(() => { this.isLoading = false; this.cdr.markForCheck(); })).subscribe({
      next: () => { this.resetMessage = `If an account with phone ${this.resetPhone} exists, a reset link has been processed.`; this.resetPhone = ''; },
      error: (error) => { this.resetMessage = error.error?.message || 'Failed to process request. Please try again later.'; }
    });
  }
  quickRegister() {
    this.isLoading = true; this.errorMessage = ''; this.isForgotPasswordMode = false;
    this.http.post(`${this.baseUrl}/auth/register/farmer`, { full_name: this.registration.name, phone: this.registration.phone, region: this.registration.region || null }).pipe(timeout(15000), finalize(() => { this.isLoading = false; this.cdr.markForCheck(); })).subscribe({
      next: (response: any) => {
        localStorage.setItem('farmer_token', response.data.token); localStorage.setItem('farmer_name', response.data.user.full_name);
        this.isLoggedIn = true; this.farmerName = response.data.user.full_name;
        alert(`Registration Successful!\n\nWelcome ${response.data.user.full_name}!\n\nPhone: ${response.data.user.phone}\nPassword: ${response.data.tempPassword}\n\nSAVE THIS PASSWORD!\nYou'll need it to login next time.`);
        this.registration = { name: '', phone: '', region: '' }; this.checkAuth();
      },
      error: (error) => { this.errorMessage = error.error?.error || 'Registration failed. Please try again.'; }
    });
  }
  farmerLogin() {
    this.isLoading = true; this.errorMessage = ''; this.isForgotPasswordMode = false;
    this.http.post(`${this.baseUrl}/auth/login/farmer`, { phone: this.login.phone, password: this.login.password }).pipe(timeout(15000), finalize(() => { this.isLoading = false; this.cdr.markForCheck(); })).subscribe({
      next: (response: any) => {
        localStorage.setItem('authToken', response.data.token); localStorage.setItem('currentUser', JSON.stringify(response.data.user)); localStorage.setItem('farmer_token', response.data.token); localStorage.setItem('farmer_name', response.data.user.full_name);
        this.isLoggedIn = true; this.farmerName = response.data.user.full_name; alert(`✅ Welcome back, ${response.data.user.full_name}!`); this.login = { phone: '', password: '' }; this.checkAuth();
      },
      error: (error) => { this.errorMessage = error.error?.error || 'Login failed. Please check your credentials.'; }
    });
  }
  logoutPortal() {
    alert('Logging out now.');
    if (this.isAdmin) { alert('To fully logout as admin, use the logout button in the header.'); return; }
    else { localStorage.removeItem('farmer_token'); localStorage.removeItem('farmer_name'); this.isLoggedIn = false; this.isAdmin = false; this.farmerName = ''; alert('You have been logged out successfully'); }
    this.checkAuth();
  }
  logout() { this.logoutPortal(); }
  submitPrice() {
    if (!this.priceInput.crop || !this.priceInput.price || !this.priceInput.region) { this.errorMessage = 'Please fill in all required fields'; this.cdr.markForCheck(); return; }
    this.isLoading = true; this.errorMessage = '';
    const crop = this.crops.find(c => c.name.toLowerCase() === this.priceInput.crop.toLowerCase());
    const region = this.regions.find(r => r.name.toLowerCase() === this.priceInput.region.toLowerCase());
    if (!crop || !region) { this.errorMessage = 'Invalid crop or region selected'; this.isLoading = false; this.cdr.markForCheck(); return; }
    const priceData: CreatePriceEntry = { crop_id: crop.id, region_id: region.id, price: this.priceInput.price, notes: this.priceInput.notes, market: this.priceInput.market };
    const token = this.isAdmin ? localStorage.getItem('authToken') : localStorage.getItem('farmer_token');
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
    this.http.post(`${this.baseUrl}/prices/submit`, priceData, { headers }).pipe(timeout(15000), finalize(() => { this.isLoading = false; this.cdr.markForCheck(); })).subscribe({
      next: (response) => { alert('Price submitted successfully! It will be verified by our admin team.'); this.priceInput = { crop: '', price: 0, market: '', region: '', notes: '' }; this.loadCriticalData(); },
      error: (error) => { console.error('Error submitting price:', error); this.errorMessage = error.error?.error || 'Failed to submit price. Please try again.'; }
    });
  }
  subscribeToSms() {
    this.isLoading = true; this.smsSubMessage = ''; this.smsSubIsError = false;
    const selectedCropNames = Object.keys(this.smsSubCrops).filter(cropName => this.smsSubCrops[cropName]);
    if (selectedCropNames.length === 0) { this.smsSubMessage = 'Please select at least one crop to subscribe.'; this.smsSubIsError = true; this.isLoading = false; this.cdr.markForCheck(); return; }
    if (!this.smsSubPhone) { this.smsSubMessage = 'Please enter your phone number.'; this.smsSubIsError = true; this.isLoading = false; this.cdr.markForCheck(); return; }
    const selectedCropIDs = selectedCropNames.map(cropName => { const crop = this.crops.find(c => c.name === cropName); return crop ? crop.id : null; }).filter(id => id !== null);
    if (selectedCropIDs.length !== selectedCropNames.length) { this.smsSubMessage = 'An error occurred matching crop names to IDs.'; this.smsSubIsError = true; this.isLoading = false; this.cdr.markForCheck(); return; }
    const subscriptionData: SmsSubscription = { phone: this.smsSubPhone, crops: selectedCropIDs as string[], alert_types: ['price-alert', 'price-update'] };
    this.smsService.subscribeSms(subscriptionData).pipe(timeout(15000), finalize(() => { this.isLoading = false; this.cdr.markForCheck(); })).subscribe({
      next: (response) => { this.smsSubMessage = '✅ Success! You are now subscribed to SMS alerts.'; this.smsSubIsError = false; this.smsSubPhone = ''; this.smsSubCrops = {}; },
      error: (error) => { this.smsSubMessage = error.error?.error || 'Subscription failed. Please try again.'; this.smsSubIsError = true; }
    });
  }
  refreshData(): void { console.log('Manual refresh requested'); this.cache = null; this.cacheTime = 0; this.errorMessage = ''; this.loadCriticalData(); }

  resetFilters(): void { this.searchTerm = ''; this.marketSearchTerm = ''; this.selectedCategory = ''; this.selectedRegion = ''; this.selectedSource = ''; this.currentPage = 1; this.filterCrops(); }
}