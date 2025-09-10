// User types
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

// Admin request types
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

// Crop types
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

// Region types
export interface Region {
  id: string;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
}

// Market types
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

// Price entry types
export interface PriceEntry {
  id: string;
  crop_id: string;
  crop_name?: string;
  region_id: string;
  region_name?: string;
  market_id?: string;
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
  price: number;
  unit?: string;
  source: 'kamis' | 'farmer' | 'admin';
  notes?: string;
  entry_date?: Date;
}

// Price prediction types
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

// SMS types
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
  sms_type: 'alert' | 'update' | 'prediction' | 'weather' | 'general';
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

// Chat types
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

// KAMIS types
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

// ML types
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

// API Response types
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

// Query parameters
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
  source?: string;
  verified?: boolean;
  date_from?: string;
  date_to?: string;
}

// Error types
export interface ApiError extends Error {
  statusCode: number;
  isOperational: boolean;
}