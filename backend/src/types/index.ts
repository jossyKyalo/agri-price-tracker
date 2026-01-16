
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
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  region?: string;
  organization?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, 'password_hash'>;
  token: string;
  refreshToken: string;
}


export interface AdminRequest {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  region: string;
  organization: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: Date;
  created_at: Date;
}

export interface CreateAdminRequest {
  full_name: string;
  email: string;
  phone: string;
  region: string;
  organization: string;
  reason?: string;
}


export interface Crop {
  id: string;
  name: string;
  category: string;
  description?: string;
  unit: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}


export interface Region {
  id: string;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
}

export interface Market {
  id: string;
  name: string;
  region_id: string;
  region_name?: string;
  location?: string;
  contact_info?: any;
  is_active: boolean;
  created_at: Date;
}

export interface PriceEntry {
  id: string;
  crop_id: string;
  crop_name?: string;
  region_id: string;
  region_name?: string;
  market_id?: string;
  market?: string;
  market_name?: string;
  price: number;
  unit: string;
  source: 'kamis' | 'farmer' | 'admin';
  entered_by?: string;
  entered_by_name?: string;
  verified_by?: string;
  verified_by_name?: string;
  is_verified: boolean;
  notes?: string;
  entry_date: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePriceEntry {
  crop_id: string;
  region_id: string;
  market_id?: string;
  market?: string;
  price: number;
  unit?: string;
  source: 'kamis' | 'farmer' | 'admin';
  notes?: string;
  entry_date?: Date;
}
 
export interface PricePrediction {
  id: string;
  crop_id: string;
  crop_name?: string;
  region_id: string;
  region_name?: string;
  current_price: number;
  predicted_price: number;
  prediction_date: Date;
  confidence_score?: number;
  model_version?: string;
  factors?: any;
  created_at: Date;
}

 
export interface SmsSubscription {
  id: string;
  phone: string;
  user_id?: string;
  crops?: string[];
  regions?: string[];
  alert_types?: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SmsLog {
  id: string;
  recipient: string;
  message: string;
  sms_type: 'alert' | 'update' | 'prediction' | 'weather' | 'general' | 'password-reset';
  status: 'pending' | 'sent' | 'failed' | 'delivered';
  external_id?: string;
  cost?: number;
  sent_by?: string;
  error_message?: string;
  sent_at?: Date;
  delivered_at?: Date;
  created_at: Date;
}

export interface SmsTemplate {
  id: string;
  name: string;
  template: string;
  variables?: string[];
  sms_type: 'alert' | 'update' | 'prediction' | 'weather' | 'general';
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface SendSmsRequest {
  recipients: string[];
  message: string;
  sms_type: 'alert' | 'update' | 'prediction' | 'weather' | 'general';
  template_id?: string;
  template_variables?: Record<string, string>;
}


export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatConversation {
  id: string;
  user_id?: string;
  session_id?: string;
  messages: ChatMessage[];
  context?: any;
  created_at: Date;
  updated_at: Date;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  context?: any;
}


export interface KamisSyncLog {
  id: string;
  sync_date: Date;
  records_processed: number;
  records_inserted: number;
  records_updated: number;
  status: string;
  error_message?: string;
  started_at: Date;
  completed_at?: Date;
}


export interface PredictionRequest {
  crop_id: string;
  region_id: string;
  historical_data?: PriceEntry[];
  prediction_days?: number;
}

export interface PredictionResponse {
  crop_id: string;
  region_id: string;
  current_price: number;
  predicted_prices: Array<{
    date: Date;
    price: number;
    confidence: number;
  }>;
  factors: any;
  model_version: string;
}


export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}


export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PriceQueryParams extends PaginationParams {
  crop_id?: string;
  region_id?: string;
  market_id?: string;
  market?: string;
  source?: string;
  verified?: boolean;
  date_from?: string;
  date_to?: string;
}


export interface ApiError extends Error {
  statusCode: number;
  isOperational: boolean;
}

export interface SendSmsWithReplyRequest {
  recipients: string[];
  message: string;
  sms_type?: string;
  template_id?: number;
  template_variables?: Record<string, string>;
  reply_webhook_url?: string;
  webhook_data?: string;
  sender?: string;
}

export interface TestSmsReplyRequest {
  test_phone: string;
}

export interface SmsReply {
  id: number;
  external_id: string;
  from_number: string;
  reply_text: string;
  processed_action: string;
  created_at: string;
}