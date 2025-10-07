import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';

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

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  constructor(private apiService: ApiService) {}

  createAdminRequest(requestData: CreateAdminRequest): Observable<AdminRequest> {
    return this.apiService.post<AdminRequest>('/admin/request', requestData).pipe(
      map(response => response.data!)
    );
  }

  getAdminRequests(page: number = 1, limit: number = 10, status?: string): Observable<{requests: AdminRequest[], pagination: any}> {
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
}