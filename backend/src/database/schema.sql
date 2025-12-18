-- Agricultural Price Tracker Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
CREATE TYPE user_role AS ENUM ('farmer', 'admin', 'super_admin');
CREATE TYPE admin_request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE price_trend AS ENUM ('up', 'down', 'stable');
CREATE TYPE sms_status AS ENUM ('pending', 'sent', 'failed', 'delivered');
CREATE TYPE sms_type AS ENUM ('alert', 'update', 'prediction', 'weather', 'general');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role user_role DEFAULT 'farmer',
    region VARCHAR(100),
    organization VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin requests table
CREATE TABLE admin_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    region VARCHAR(100) NOT NULL,
    organization VARCHAR(255) NOT NULL,
    reason TEXT,
    status admin_request_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Crops table
CREATE TABLE crops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    unit VARCHAR(20) DEFAULT 'kg',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Regions table
CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Markets table
CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    region_id UUID NOT NULL REFERENCES regions(id),
    location VARCHAR(255),
    contact_info JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, region_id)
);

-- Price entries table
CREATE TABLE price_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crop_id UUID NOT NULL REFERENCES crops(id),
    region_id UUID NOT NULL REFERENCES regions(id),
    market_id UUID REFERENCES markets(id),
    price DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) DEFAULT 'kg',
    source VARCHAR(50) NOT NULL, -- 'kamis', 'farmer', 'admin'
    entered_by UUID REFERENCES users(id),
    verified_by UUID REFERENCES users(id),
    is_verified BOOLEAN DEFAULT false,
    notes TEXT,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Price predictions table
CREATE TABLE price_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crop_id UUID NOT NULL REFERENCES crops(id),
    region_id UUID NOT NULL REFERENCES regions(id),
    current_price DECIMAL(10,2) NOT NULL,
    predicted_price DECIMAL(10,2) NOT NULL,
    prediction_date DATE NOT NULL,
    confidence_score DECIMAL(5,4),
    model_version VARCHAR(50),
    factors JSONB, -- Store prediction factors as JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- SMS subscriptions table
CREATE TABLE sms_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    user_id UUID REFERENCES users(id),
    crops JSONB, -- Array of crop IDs
    regions JSONB, -- Array of region IDs
    alert_types JSONB, -- Array of alert types
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(phone)
);

-- SMS logs table
CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    sms_type sms_type NOT NULL,
    status sms_status DEFAULT 'pending',
    external_id VARCHAR(255), -- Twilio message SID
    cost DECIMAL(8,4),
    sent_by UUID REFERENCES users(id),
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- SMS templates table
CREATE TABLE sms_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    template TEXT NOT NULL,
    variables JSONB, -- Array of variable names
    sms_type sms_type NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- KAMIS sync logs table
CREATE TABLE kamis_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_date DATE NOT NULL,
    records_processed INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Chat conversations table
CREATE TABLE chat_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    session_id VARCHAR(255),
    messages JSONB NOT NULL, -- Array of message objects
    context JSONB, -- Conversation context
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System settings table
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_region ON users(region);

CREATE INDEX idx_price_entries_crop_region ON price_entries(crop_id, region_id);
CREATE INDEX idx_price_entries_date ON price_entries(entry_date);
CREATE INDEX idx_price_entries_verified ON price_entries(is_verified);
CREATE INDEX idx_price_entries_source ON price_entries(source);

CREATE INDEX idx_price_predictions_crop_region ON price_predictions(crop_id, region_id);
CREATE INDEX idx_price_predictions_date ON price_predictions(prediction_date);

CREATE INDEX idx_sms_logs_recipient ON sms_logs(recipient);
CREATE INDEX idx_sms_logs_status ON sms_logs(status);
CREATE INDEX idx_sms_logs_created_at ON sms_logs(created_at);

CREATE INDEX idx_sms_subscriptions_phone ON sms_subscriptions(phone);
CREATE INDEX idx_sms_subscriptions_active ON sms_subscriptions(is_active);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crops_updated_at BEFORE UPDATE ON crops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_price_entries_updated_at BEFORE UPDATE ON price_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_subscriptions_updated_at BEFORE UPDATE ON sms_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_templates_updated_at BEFORE UPDATE ON sms_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_conversations_updated_at BEFORE UPDATE ON chat_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();