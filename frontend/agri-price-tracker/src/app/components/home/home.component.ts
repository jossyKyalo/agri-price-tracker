import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CropService } from '../../services/crop.service';
import { PriceService } from '../../services/price.service';
import { ApiService } from '../../services/api.service';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AvatarModule } from 'primeng/avatar';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ButtonModule, ProgressSpinnerModule, AvatarModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {

  activeFarmers = 0;
  trackedProducts = 0;
  regionsCovered = 0;
  accuracyRate = 0;

  heroPrices: any[] = [];
  isLoadingPrices = true;

  commodities = [
    { name: 'Maize', price: 50, trend: 'up', image: 'fas fa-seedling' },
    { name: 'Beans', price: 90, trend: 'down', image: 'fas fa-leaf' },
    { name: 'Potatoes', price: 42, trend: 'stable', image: 'fas fa-carrot' },
    { name: 'Rice', price: 120, trend: 'up', image: 'fas fa-seedling' }
  ];

  newsArticles = [
    { title: 'Price Forecast Q1 2025', date: 'Dec 12, 2025', category: 'Market Analysis', image: 'fas fa-chart-line' },
    { title: 'New KAMIS Integration', date: 'Nov 28, 2025', category: 'Platform Update', image: 'fas fa-link' },
    { title: 'Farming Tips for 2026', date: 'Nov 15, 2025', category: 'Education', image: 'fas fa-tractor' }
  ];

  private staticHeroPrices = [
    { name: 'Maize', price: 50, unit: 'kg', trend: 'up', change: 5 },
    { name: 'Beans', price: 90, unit: 'kg', trend: 'down', change: 2 },
    { name: 'Tomatoes', price: 42, unit: 'kg', trend: 'stable', change: 0 }
  ];

  constructor(
    private cropService: CropService,
    private priceService: PriceService,
    private apiService: ApiService,
    private router: Router
  ) { }

  ngOnInit() {
    this.loadPageData();
  }

  loadPageData() {
    const lookbackWindow = new Date();
    lookbackWindow.setDate(lookbackWindow.getDate() - 60);

    const crops$ = this.cropService.getCrops().pipe(catchError(() => of([])));
    const regions$ = this.cropService.getRegions().pipe(catchError(() => of([])));
    const mlStats$ = this.apiService.get<any>('/ml/').pipe(catchError(() => of({ data: { performance: { r2: 0.85 } } })));

    const publicStats$ = this.apiService.get<any>('/stats/public').pipe(
      catchError(() => of({ data: { farmers: 2847 } }))
    );

    const prices$ = this.priceService.getPrices({
      limit: 3,
      date_from: lookbackWindow.toISOString()
    }).pipe(catchError((err) => {
      console.error('Home Price Fetch Error:', err);
      return of([]);
    }));

    forkJoin([crops$, regions$, mlStats$, publicStats$, prices$]).subscribe({
      next: ([crops, regions, mlStats, publicStats, pricesResponse]) => {
        this.trackedProducts = crops.length || 156;
        this.regionsCovered = regions.length || 47;
        this.activeFarmers = publicStats.data?.farmers || 2847;

        const r2 = mlStats?.data?.performance?.r2 || 0.85;
        this.accuracyRate = Math.round(r2 * 100);

        const rawPrices = (pricesResponse as any).data || [];

        if (rawPrices.length > 0) {
          this.heroPrices = rawPrices.slice(0, 3).map((p: any) => ({
            name: p.crop_name || p.name,
            price: p.price,
            unit: p.unit || 'kg',
            trend: this.getTrend(p.price, p.previous_price),
            change: this.getChange(p.price, p.previous_price)
          }));
        } else {
          console.warn('Live prices empty. Using static fallback.');
          this.heroPrices = this.staticHeroPrices;
        }

        this.isLoadingPrices = false;
      }
    });
  }

  getTrend(current: number, previous: number | null): string {
    if (!previous) return 'stable';
    return current > previous ? 'up' : (current < previous ? 'down' : 'stable');
  }

  getChange(current: number, previous: number | null): number {
    if (!previous) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  navigateToCurrentPrices() {
    this.router.navigate(['/public']);
  }

  navigateToSmsAlerts() {
    this.router.navigate(['/public'], { queryParams: { section: 'sms' } });
  }

  getStarted() {
    this.router.navigate(['/public']);
  }

  learnMore() {
    const featuresSection = document.querySelector('.features-section');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
}