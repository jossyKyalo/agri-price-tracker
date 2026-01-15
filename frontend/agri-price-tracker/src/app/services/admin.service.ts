import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, timeout } from 'rxjs/operators';
import { ApiService } from './api.service';
import { environment } from '../../environments/environment';

export interface AdminRequest {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  region: string;
  organization: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface SystemAlert {
  id: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  message: string;
  created_at: string;
}

export interface CreateAdminRequest {
  full_name: string;
  email: string;
  phone: string;
  region: string;
  organization: string;
  reason?: string;
}

export interface AdminStats {
  pendingRequests: number;
  totalAdmins: number;
  todayEntries: number;
  todaySms: number;
}

export interface SyncConfig {
  autoSyncEnabled: boolean;
  frequency: 'daily' | 'weekly' | 'manual';
  syncTime: string;
  retryAttempts: number;
  notifyOnFailure: boolean;
  targetCrops: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private apiUrl = environment.apiUrl;

  constructor(
    private apiService: ApiService,
    private http: HttpClient
  ) { }

  createAdminRequest(requestData: CreateAdminRequest): Observable<AdminRequest> {
    return this.apiService.post<AdminRequest>('/admin/request', requestData).pipe(
      map(response => response.data!)
    );
  }

  getAdminRequests(page: number = 1, limit: number = 10, status?: string): Observable<{ requests: AdminRequest[], pagination: any }> {
    const params: any = { page, limit };
    if (status) {
      params.status = status;
    }

    return this.apiService.get<AdminRequest[]>('/admin/requests', params).pipe(
      map(response => ({
        requests: response.data || [],
        pagination: response.pagination
      }))
    );
  }

  reviewAdminRequest(id: string, status: 'approved' | 'rejected', reason?: string): Observable<void> {
    return this.apiService.put<void>(`/admin/requests/${id}/review`, { status, reason }).pipe(
      map(() => void 0)
    );
  }

  getAdminStats(): Observable<AdminStats> {
    return this.apiService.get<AdminStats>('/admin/stats').pipe(
      map(response => response.data!)
    );
  }

  getSystemHealth(): Observable<any> {
    return this.apiService.get<any>('/admin/health').pipe(
      map(response => response.data!)
    );
  }

  getKamisStatus(): Observable<any> {
    return this.apiService.get<any>('/kamis/status').pipe(
      map(response => response.data!)
    );
  }

  syncKamisData(): Observable<any> {
    const token = localStorage.getItem('authToken') ||
      localStorage.getItem('token') ||
      localStorage.getItem('admin_token') ||
      '';

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.post<any>(`${this.apiUrl}/kamis/sync`, {}, { headers }).pipe(
      timeout(6000000),
      map(response => response.data || {})
    );
  }

  getKamisLogs(page: number = 1, limit: number = 20): Observable<{ logs: any[], pagination: any }> {
    return this.apiService.get<any[]>('/kamis/logs', { page, limit }).pipe(
      map(response => ({
        logs: response.data || [],
        pagination: response.pagination
      }))
    );
  }

  uploadKamisFile(formData: FormData): Observable<any> {
    return this.apiService.post<any>('/kamis/upload', formData).pipe(
      map(response => response.data || {})
    );
  }

  getSyncConfig(): Observable<SyncConfig> {
    return this.apiService.get<SyncConfig>('/kamis/config').pipe(map(r => r.data!));
  }

  updateSyncConfig(config: SyncConfig): Observable<any> {
    return this.apiService.put<any>('/kamis/config', config).pipe(map(r => r.data));
  }

  getSystemAlerts(): Observable<SystemAlert[]> {
    return this.apiService.get<SystemAlert[]>('/admin/alerts').pipe(
      map(response => response.data || [])
    );
  }
}