import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface SmsLog {
  id: string;
  recipient: string;
  message: string;
  sms_type: 'alert' | 'update' | 'prediction' | 'weather' | 'general';
  status: 'pending' | 'sent' | 'failed' | 'delivered';
  sent_at?: string;
  created_at: string;
}

export interface SmsTemplate {
  id: string;
  name: string;
  template: string;
  variables?: string[];
  sms_type: 'alert' | 'update' | 'prediction' | 'weather' | 'general';
  is_active: boolean;
  created_at: string;
}

export interface SendSmsRequest {
  recipients: string[];
  message: string;
  sms_type: 'alert' | 'update' | 'prediction' | 'weather' | 'general';
  template_id?: string;
  template_variables?: Record<string, string>;
}

export interface SmsSubscription {
  phone: string;
  crops?: string[];
  regions?: string[];
  alert_types?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class SmsService {
  constructor(private apiService: ApiService) {}

  sendSms(smsData: SendSmsRequest): Observable<any> {
    return this.apiService.post<any>('/sms/send', smsData).pipe(
      map(response => response.data!)
    );
  }

  getSmsLogs(page: number = 1, limit: number = 20, status?: string): Observable<{logs: SmsLog[], pagination: any}> {
    const params: any = { page, limit };
    if (status) {
      params.status = status;
    }

    return this.apiService.get<SmsLog[]>('/sms/logs', params).pipe(
      map(response => ({
        logs: response.data || [],
        pagination: response.pagination
      }))
    );
  }

  getSmsTemplates(): Observable<SmsTemplate[]> {
    return this.apiService.get<SmsTemplate[]>('/sms/templates').pipe(
      map(response => response.data || [])
    );
  }

  createSmsTemplate(templateData: Partial<SmsTemplate>): Observable<SmsTemplate> {
    return this.apiService.post<SmsTemplate>('/sms/templates', templateData).pipe(
      map(response => response.data!)
    );
  }

  subscribeSms(subscriptionData: SmsSubscription): Observable<any> {
    return this.apiService.post<any>('/sms/subscribe', subscriptionData).pipe(
      map(response => response.data!)
    );
  }

  getSmsStats(): Observable<any> {
    return this.apiService.get<any>('/sms/stats').pipe(
      map(response => response.data!)
    );
  }
}