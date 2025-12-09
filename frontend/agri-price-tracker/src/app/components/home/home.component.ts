import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CropService } from '../../services/crop.service';
import { PriceService } from '../../services/price.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  @Output() navigateToSection = new EventEmitter<string>();
  @Output() navigateToPage = new EventEmitter<string>();
 
  activeFarmers = 2847;  
  trackedProducts = 0;
  regionsCovered = 0;
  accuracyRate = 0;
  lastUpdated = 'Loading...';
 
  heroPrices: any[] = [];
  isLoadingPrices = true;

  constructor(
    private cropService: CropService,
    private priceService: PriceService,
    private apiService: ApiService
  ) { }

  ngOnInit() {
    this.loadPageData();
  }

  loadPageData() { 
    const crops$ = this.cropService.getCrops().pipe(catchError(() => of([])));
    const regions$ = this.cropService.getRegions().pipe(catchError(() => of([])));
    const mlStats$ = this.apiService.get<any>('/ml/').pipe(catchError(() => of({ data: { performance: { r2: 0.85 } } })));
 
    const prices$ = this.priceService.getPrices({ limit: 3 }).pipe(catchError(() => of([])));

    forkJoin([crops$, regions$, mlStats$, prices$]).subscribe({
      next: ([crops, regions, mlStats, pricesResponse]) => { 
        this.trackedProducts = crops.length || 156;
        this.regionsCovered = regions.length || 47;

        const r2 = mlStats?.data?.performance?.r2 || 0.85;
        this.accuracyRate = Math.round(r2 * 100);
 
        const rawPrices = (pricesResponse as any).data || [];
        this.heroPrices = rawPrices.slice(0, 3).map((p: any) => ({
          name: p.crop_name || p.name,
          price: p.price,
          unit: p.unit || 'kg', 
          trend: this.getTrend(p.price, p.previous_price),
          change: this.getChange(p.price, p.previous_price)
        }));

        if (this.heroPrices.length > 0) {
          this.isLoadingPrices = false;
        }
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
    this.navigateToSection.emit('prices');
  }

  navigateToSmsAlerts() {
    this.navigateToSection.emit('sms');
  }

  getStarted() {
    this.navigateToPage.emit('public');
  }

  learnMore() {
    const featuresSection = document.querySelector('.features-section');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
}