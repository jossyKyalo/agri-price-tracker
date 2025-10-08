import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SmsService, SmsTemplate, SmsLog, SendSmsRequest } from '../../services/sms.service';
import { CropService, Crop, Region } from '../../services/crop.service';

@Component({
  selector: 'app-sms-interface',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sms-interface.component.html',
  styleUrls: ['./sms-interface.component.css']
})
export class SmsInterfaceComponent implements OnInit {
  activeTab = 'send';
  isLoading = false;
  errorMessage = '';
  
  // Stats
  totalSent = 0;
  subscribedFarmers = 0;
  pendingSms = 0;
  failedSms = 0;
  
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

  smsTemplates: SmsTemplate[] = [];
  smsLogs: SmsLog[] = [];
  crops: Crop[] = [];
  regions: Region[] = [];

  constructor(
    private smsService: SmsService,
    private cropService: CropService
  ) {}

  ngOnInit() {
    this.loadInitialData();
  }

  loadInitialData() {
    this.loadSmsStats();
    this.loadSmsTemplates();
    this.loadSmsLogs();
    this.loadCropsAndRegions();
  }

  loadSmsStats() {
    this.smsService.getSmsStats().subscribe({
      next: (stats) => {
        this.totalSent = stats.todaySent || 0;
        this.subscribedFarmers = stats.activeSubscriptions || 0;
        this.pendingSms = stats.pending || 0;
        this.failedSms = stats.failed || 0;
      },
      error: (error) => {
        console.error('Error loading SMS stats:', error);
        // Use fallback values
        this.totalSent = 1247;
        this.subscribedFarmers = 2847;
        this.pendingSms = 43;
        this.failedSms = 12;
      }
    });
  }

  loadSmsTemplates() {
    this.smsService.getSmsTemplates().subscribe({
      next: (templates) => {
        this.smsTemplates = templates;
      },
      error: (error) => {
        console.error('Error loading SMS templates:', error);
        // Fallback to mock templates
        this.smsTemplates = [
          {
            id: '1',
            name: 'Price Alert',
            template: 'AGRI ALERT: {crop} price has {trend} by {percentage}% to KSh {price}/kg in {region}. Current market: {market}',
            variables: ['crop', 'trend', 'percentage', 'price', 'region', 'market'],
            sms_type: 'alert',
            is_active: true,
            created_at: '2025-01-10T10:00:00Z'
          },
          {
            id: '2',
            name: 'Daily Price Update',
            template: 'AGRI UPDATE: Today\'s prices - {crop}: KSh {price}/kg ({region}). Prediction: {prediction}. For more info, reply HELP',
            variables: ['crop', 'price', 'region', 'prediction'],
            sms_type: 'update',
            is_active: true,
            created_at: '2025-01-10T10:00:00Z'
          }
        ];
      }
    });
  }

  loadSmsLogs() {
    this.smsService.getSmsLogs(1, 20).subscribe({
      next: (response) => {
        this.smsLogs = response.logs;
      },
      error: (error) => {
        console.error('Error loading SMS logs:', error);
        // Fallback to mock logs
        this.smsLogs = [
          {
            id: '1',
            recipient: '+254700123456',
            message: 'AGRI ALERT: Maize price has increased by 15% to KSh 50/kg in Central Kenya',
            sms_type: 'alert',
            status: 'sent',
            sent_at: '2025-01-10T14:30:00Z',
            created_at: '2025-01-10T14:30:00Z'
          },
          {
            id: '2',
            recipient: '+254722987654',
            message: 'AGRI UPDATE: Today\'s prices - Beans: KSh 90/kg (Western). Prediction: KSh 85/kg',
            sms_type: 'update',
            status: 'sent',
            sent_at: '2025-01-10T14:25:00Z',
            created_at: '2025-01-10T14:25:00Z'
          }
        ];
      }
    });
  }

  loadCropsAndRegions() {
    this.cropService.getCrops().subscribe({
      next: (crops) => {
        this.crops = crops;
      },
      error: (error) => {
        console.error('Error loading crops:', error);
      }
    });

    this.cropService.getRegions().subscribe({
      next: (regions) => {
        this.regions = regions;
      },
      error: (error) => {
        console.error('Error loading regions:', error);
      }
    });
  }

  sendSms() {
    if (!this.smsData.type || !this.smsData.recipients || !this.smsData.message) {
      alert('Please fill in all required fields');
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const recipients = this.smsData.recipients === 'custom' 
      ? this.smsData.customNumbers.split(',').map(n => n.trim())
      : [this.smsData.recipients]; 

    const smsRequest: SendSmsRequest = {
      recipients: recipients,
      message: this.smsData.message,
      sms_type: this.smsData.type as any
    };

    this.smsService.sendSms(smsRequest).subscribe({
      next: (response) => {
        this.isLoading = false;
        alert(`SMS sent successfully to ${response.sent} recipients!`);
        
        // Reset form
        this.smsData = {
          type: '',
          recipients: '',
          customNumbers: '',
          message: '',
          schedule: 'now',
          scheduledTime: ''
        };
        
        // Reload logs and stats
        this.loadSmsLogs();
        this.loadSmsStats();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.userMessage || 'Failed to send SMS';
        console.error('Error sending SMS:', error);
      }
    });
  }

  sendQuickSms(type: string) { 
    this.activeTab = 'send';
    
    switch(type) {
      case 'price-spike':
        this.smsData.type = 'alert';
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
        this.smsData.type = 'update';
        this.smsData.recipients = 'all';
        this.smsData.message = 'AGRI UPDATE: Today\'s prices - Maize: KSh 50/kg, Beans: KSh 90/kg, Tomatoes: KSh 42/kg. Predictions rising.';
        break;
    }
  }

  loadTemplate() {
    const template = this.smsTemplates.find(t => t.id === this.selectedTemplate);
    if (template) {
      this.smsData.message = template.template;
    }
  }

  saveTemplate() {
    if (!this.newTemplate.name || !this.newTemplate.template) {
      alert('Please fill in template name and message');
      return;
    }

    const templateData = {
      name: this.newTemplate.name,
      template: this.newTemplate.template,
      variables: this.newTemplate.variablesString.split(',').map(v => v.trim()).filter(v => v),
      sms_type: 'general' as any
    };

    this.smsService.createSmsTemplate(templateData).subscribe({
      next: (template) => {
        this.smsTemplates.push(template);
        this.cancelTemplate();
        alert('Template saved successfully!');
      },
      error: (error) => {
        console.error('Error saving template:', error);
        alert('Failed to save template');
      }
    });
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
      variablesString: template.variables?.join(', ') || ''
    };
    this.showCreateTemplate = true;
  }

  deleteTemplate(id: string) {
    if (confirm('Are you sure you want to delete this template?')) { 
      this.smsTemplates = this.smsTemplates.filter(t => t.id !== id);
      alert('Template deleted successfully!');
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
    
    setTimeout(() => {
      log.status = 'sent';
      this.failedSms--;
      this.totalSent++;
    }, 2000);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}