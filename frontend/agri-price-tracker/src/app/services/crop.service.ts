import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface Crop {
  id: string;
  name: string;
  category: string;
  description?: string;
  unit: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Region {
  id: string;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class CropService {
  constructor(private apiService: ApiService) {}

  getCrops(category?: string, is_active: boolean = true): Observable<Crop[]> {
    const params: any = { is_active };
    if (category) {
      params.category = category;
    }
    
    return this.apiService.get<Crop[]>('/crops', params).pipe(
      map(response => response.data || [])
    );
  }

  getCropById(id: string): Observable<Crop> {
    return this.apiService.get<Crop>(`/crops/${id}`).pipe(
      map(response => response.data!)
    );
  }

  getRegions(): Observable<Region[]> {
    return this.apiService.get<Region[]>('/regions').pipe(
      map(response => response.data || [])
    );
  }
}