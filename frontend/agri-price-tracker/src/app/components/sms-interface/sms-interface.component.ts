import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface SmsTemplate {
  id: number;
  name: string;
  template: string;
  variables: string[];
}

interface SmsLog {
  id: number;
  recipient: string;
  message: string;
  status: 'sent' | 'pending' | 'failed';
  timestamp: string;
  type: 'alert' | 'update' | 'prediction';
}

@Component({
  selector: 'app-sms-interface',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sms-interface.component.html',
  styleUrls: ['./sms-interface.component.css']
})
export class SmsInterfaceComponent implements OnInit {
  activeTab = 'send';
  
  // Stats
  totalSent = 1247;
  subscribedFarmers = 2847;
  pendingSms = 43;
  failedSms = 12;
  
  // SMS Form Data
  smsData = {
    type: '',
    recipients: '',
    customNumbers: '',
    message: '',
    schedule: 'now',
    scheduledTime: ''
  };
  
  selectedTemplate = '';
  showCreateTemplate = false;
  logFilter = '';
  
  // Template Data
  newTemplate = {
    name: '',
    template: '',
    variablesString: ''
  };

  smsTemplates: SmsTemplate[] = [
    {
      id: 1,
      name: 'Price Alert',
      template: 'AGRI ALERT: {crop} price has {trend} by {percentage}% to KSh {price}/kg in {region}. Current market: {market}',
      variables: ['crop', 'trend', 'percentage', 'price', 'region', 'market']
    },
    {
      id: 2,
      name: 'Daily Price Update',
      template: 'AGRI UPDATE: Today\'s prices - {crop}: KSh {price}/kg ({region}). Prediction: {prediction}. For more info, reply HELP',
      variables: ['crop', 'price', 'region', 'prediction']
    },
    {
      id: 3,
      name: 'Weather Alert',
      template: 'AGRI WEATHER: {weather_condition} expected in {region} for next {days} days. Protect your {crop}. More: reply WEATHER',
      variables: ['weather_condition', 'region', 'days', 'crop']
    }
  ];

  smsLogs: SmsLog[] = [
    {
      id: 1,
      recipient: '+254700123456',
      message: 'AGRI ALERT: Maize price has increased by 15% to KSh 50/kg in Central Kenya',
      status: 'sent',
      timestamp: '2025-01-10 14:30',
      type: 'alert'
    },
    {
      id: 2,
      recipient: '+254722987654',
      message: 'AGRI UPDATE: Today\'s prices - Beans: KSh 90/kg (Western). Prediction: KSh 85/kg',
      status: 'sent',
      timestamp: '2025-01-10 14:25',
      type: 'update'
    },
    {
      id: 3,
      recipient: '+254733555777',
      message: 'AGRI WEATHER: Heavy rains expected in Rift Valley for next 3 days',
      status: 'pending',
      timestamp: '2025-01-10 14:20',
      type: 'alert'
    },
    {
      id: 4,
      recipient: '+254700999888',
      message: 'AGRI PREDICTION: Tomato prices likely to increase by 10% next week',
      status: 'failed',
      timestamp: '2025-01-10 14:15',
      type: 'prediction'
    }
  ];

  ngOnInit() {
    // Initialize SMS interface
  }

  sendSms() {
    // Simulate sending SMS
    const newLog: SmsLog = {
      id: this.smsLogs.length + 1,
      recipient: this.smsData.recipients === 'custom' ? this.smsData.customNumbers : `All ${this.smsData.recipients}`,
      message: this.smsData.message,
      status: 'sent',
      timestamp: new Date().toLocaleString(),
      type: this.smsData.type as any
    };
    
    this.smsLogs.unshift(newLog);
    this.totalSent++;
    
    // Reset form
    this.smsData = {
      type: '',
      recipients: '',
      customNumbers: '',
      message: '',
      schedule: 'now',
      scheduledTime: ''
    };
    
    alert('SMS sent successfully!');
  }

  sendQuickSms(type: string) {
    // Pre-fill SMS form with quick action data
    this.activeTab = 'send';
    
    switch(type) {
      case 'price-spike':
        this.smsData.type = 'price-alert';
        this.smsData.recipients = 'region-central';
        this.smsData.message = 'AGRI ALERT: Maize price has increased by 15% to KSh 50/kg in Central Kenya. Consider selling now.';
        break;
      case 'weather-alert':
        this.smsData.type = 'weather';
        this.smsData.recipients = 'all';
        this.smsData.message = 'AGRI WEATHER: Heavy rains expected in your region for next 3 days. Protect your crops and harvest early if ready.';
        break;
      case 'market-opportunity':
        this.smsData.type = 'general';
        this.smsData.recipients = 'crop-tomatoes';
        this.smsData.message = 'AGRI OPPORTUNITY: High demand for tomatoes in Nairobi markets. Premium prices available. Contact local buyers.';
        break;
      case 'daily-update':
        this.smsData.type = 'price-update';
        this.smsData.recipients = 'all';
        this.smsData.message = 'AGRI UPDATE: Today\'s prices - Maize: KSh 50/kg, Beans: KSh 90/kg, Tomatoes: KSh 42/kg. Predictions rising.';
        break;
    }
  }

  loadTemplate() {
    const template = this.smsTemplates.find(t => t.id === parseInt(this.selectedTemplate));
    if (template) {
      this.smsData.message = template.template;
    }
  }

  saveTemplate() {
    const newTemplate: SmsTemplate = {
      id: this.smsTemplates.length + 1,
      name: this.newTemplate.name,
      template: this.newTemplate.template,
      variables: this.newTemplate.variablesString.split(',').map(v => v.trim()).filter(v => v)
    };
    
    this.smsTemplates.push(newTemplate);
    this.cancelTemplate();
    alert('Template saved successfully!');
  }

  cancelTemplate() {
    this.showCreateTemplate = false;
    this.newTemplate = {
      name: '',
      template: '',
      variablesString: ''
    };
  }

  editTemplate(template: SmsTemplate) {
    this.newTemplate = {
      name: template.name,
      template: template.template,
      variablesString: template.variables.join(', ')
    };
    this.showCreateTemplate = true;
  }

  deleteTemplate(id: number) {
    if (confirm('Are you sure you want to delete this template?')) {
      this.smsTemplates = this.smsTemplates.filter(t => t.id !== id);
    }
  }

  getFilteredLogs(): SmsLog[] {
    if (!this.logFilter) {
      return this.smsLogs;
    }
    return this.smsLogs.filter(log => log.status === this.logFilter);
  }

  resendSms(log: SmsLog) {
    log.status = 'pending';
    log.timestamp = new Date().toLocaleString();
    
    setTimeout(() => {
      log.status = 'sent';
      this.failedSms--;
      this.totalSent++;
    }, 2000);
  }
}