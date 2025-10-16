import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface CropPrice {
  id: string;
  crop_id: string;
  crop_name: string;
  region_id: string;
  region_name: string;
  market_id?: string;
  market_name?: string;
  price: number;
  unit: string;
  source: 'kamis' | 'farmer' | 'admin';
  is_verified: boolean;
  entry_date: string;
  created_at: string;
  updated_at: string;
  name: string;
  category: string;
  currentPrice: number;
  previousPrice: number;
  trend: string;
  region: string;
  market: string;
  lastUpdated: string;
  prediction?: number;
}

export interface PriceQueryParams {
  page?: number;
  limit?: number;
  crop_id?: string;
  region_id?: string;
  market_id?: string;
  source?: string;
  verified?: boolean;
  date_from?: string;
  date_to?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface CreatePriceEntry {
  crop_id: string;
  region_id: string;
  market_id?: string;
  price: number;
  unit?: string;
  notes?: string;
  entry_date?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PriceService {
  constructor(private apiService: ApiService) {}

  getPrices(params?: PriceQueryParams): Observable<{prices: CropPrice[], pagination: any}> {
    return this.apiService.get<CropPrice[]>('/prices', params).pipe(
      map(response => ({
        prices: response.data || [],
        pagination: response.pagination
      }))
    );
  }

  createPriceEntry(priceData: CreatePriceEntry): Observable<CropPrice> {
    return this.apiService.post<CropPrice>('/prices', priceData).pipe(
      map(response => response.data!)
    );
  }

  getPendingVerifications(): Observable<CropPrice[]> {
    return this.apiService.get<CropPrice[]>('/prices/pending').pipe(
      map(response => response.data || [])
    );
  }

  verifyPriceEntry(id: string): Observable<CropPrice> {
    return this.apiService.put<CropPrice>(`/prices/${id}/verify`, {}).pipe(
      map(response => response.data!)
    );
  }

  rejectPriceEntry(id: string): Observable<void> {
    return this.apiService.delete<void>(`/prices/${id}/reject`).pipe(
      map(() => void 0)
    );
  }
}