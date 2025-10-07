import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: 'farmer' | 'admin' | 'super_admin';
  region?: string;
  organization?: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  region?: string;
  organization?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private apiService: ApiService) {
    this.loadStoredUser();
  }

  private loadStoredUser(): void {
    const token = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('currentUser');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        this.currentUserSubject.next(user);
      } catch (error) {
        console.error('Error parsing stored user:', error);
        this.logout();
      }
    }
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.apiService.post<AuthResponse>('/auth/login', credentials).pipe(
      map(response => response.data!),
      tap(authResponse => {
        localStorage.setItem('authToken', authResponse.token);
        localStorage.setItem('refreshToken', authResponse.refreshToken);
        localStorage.setItem('currentUser', JSON.stringify(authResponse.user));
        localStorage.setItem('userRole', authResponse.user.role);
        this.currentUserSubject.next(authResponse.user);
      })
    );
  }

  register(userData: RegisterRequest): Observable<AuthResponse> {
    return this.apiService.post<AuthResponse>('/auth/register', userData).pipe(
      map(response => response.data!),
      tap(authResponse => {
        localStorage.setItem('authToken', authResponse.token);
        localStorage.setItem('refreshToken', authResponse.refreshToken);
        localStorage.setItem('currentUser', JSON.stringify(authResponse.user));
        localStorage.setItem('userRole', authResponse.user.role);
        this.currentUserSubject.next(authResponse.user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userRole');
    this.currentUserSubject.next(null);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('authToken');
  }

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'admin' || user?.role === 'super_admin';
  }

  getProfile(): Observable<User> {
    return this.apiService.get<User>('/auth/profile').pipe(
      map(response => response.data!)
    );
  }

  updateProfile(profileData: Partial<User>): Observable<User> {
    return this.apiService.put<User>('/auth/profile', profileData).pipe(
      map(response => response.data!),
      tap(user => {
        localStorage.setItem('currentUser', JSON.stringify(user));
        this.currentUserSubject.next(user);
      })
    );
  }
}