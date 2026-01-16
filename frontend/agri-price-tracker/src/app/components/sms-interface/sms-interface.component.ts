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
  successMessage = '';

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
  ) { }

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

  private formatPhone(phone: string): string | null {
    let cleaned = phone.replace(/[^0-9+]/g, '');

    if (cleaned.startsWith('0')) {
      cleaned = '+254' + cleaned.substring(1);
    }

    else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
      cleaned = '+254' + cleaned;
    }

    else if (cleaned.startsWith('254')) {
      cleaned = '+' + cleaned;
    }

    if (!cleaned.startsWith('+') || cleaned.length < 10) {
      return null;
    }
    return cleaned;
  }

  private sanitizeSmsType(rawType: string): string {
    const type = rawType.toLowerCase();
    if (type === 'price-alert') return 'alert';
    if (type === 'daily-update') return 'update';

    const validTypes = ['alert', 'update', 'prediction', 'weather', 'general'];
    if (validTypes.includes(type)) return type;

    return 'general';
  }

  sendSms() {
    if (!this.smsData.type || !this.smsData.message) {
      this.errorMessage = 'Please fill in message and type fields';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    let recipientList: string[] = [];

    if (this.smsData.recipients === 'custom') {
      const rawInputs = this.smsData.customNumbers.split(',').map(s => s.trim()).filter(s => s.length > 0);

      const invalid: string[] = [];

      rawInputs.forEach(num => {
        const formatted = this.formatPhone(num);
        if (formatted) {
          recipientList.push(formatted);
        } else {
          invalid.push(num);
        }
      });

      if (invalid.length > 0) {
        this.isLoading = false;
        this.errorMessage = `Invalid numbers: ${invalid.join(', ')}. Use format 0712...`;
        return;
      }

      if (recipientList.length === 0) {
        this.isLoading = false;
        this.errorMessage = 'Please enter at least one valid phone number.';
        return;
      }
    } else {

      this.isLoading = false;
      this.errorMessage = 'Sending to groups is not yet implemented. Please enter numbers manually.';
      return;
    }

    const smsRequest: SendSmsRequest = {
      recipients: recipientList,
      message: this.smsData.message,
      sms_type: this.sanitizeSmsType(this.smsData.type) as any
    };

    this.smsService.sendSms(smsRequest).subscribe({
      next: (response) => {
        this.isLoading = false;
        const count = response.data?.sent || recipientList.length;
        this.successMessage = `✅ SMS sent to ${count} recipient(s)!`;

        this.smsData.message = '';
        this.smsData.customNumbers = '';

        this.loadSmsLogs();
        this.loadSmsStats();

        setTimeout(() => this.successMessage = '', 5000);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Send Error:', error);
        if (error.status === 400) {
          this.errorMessage = 'Validation Failed: Backend rejected the data format.';
        } else {
          this.errorMessage = error.error?.message || 'Failed to send SMS.';
        }
      }
    });
  }


  sendQuickSms(type: string) {
    this.activeTab = 'send';

    switch (type) {
      case 'price-spike':
        this.smsData.type = 'alert';
        this.smsData.recipients = 'custom';
        this.smsData.message = 'AGRI ALERT: Maize price has increased by 15% to KSh 50/kg in Central Kenya. Consider selling now.';
        break;
      case 'weather-alert':
        this.smsData.type = 'weather';
        this.smsData.recipients = 'custom';
        this.smsData.message = 'AGRI WEATHER: Heavy rains expected in your region for next 3 days. Protect your crops and harvest early if ready.';
        break;
      case 'market-opportunity':
        this.smsData.type = 'general';
        this.smsData.recipients = 'custom';
        this.smsData.message = 'AGRI OPPORTUNITY: High demand for tomatoes in Nairobi markets. Premium prices available. Contact local buyers.';
        break;
      case 'daily-update':
        this.smsData.type = 'update';
        this.smsData.recipients = 'custom';
        this.smsData.message = 'AGRI UPDATE: Today\'s prices - Maize: KSh 50/kg, Beans: KSh 90/kg, Tomatoes: KSh 42/kg. Predictions rising.';
        break;
    }
  }

  loadTemplate() {
    const template = this.smsTemplates.find(t => t.id === this.selectedTemplate);
    if (template) {
      this.smsData.message = template.template;
      if (template.sms_type) {
        this.smsData.type = this.sanitizeSmsType(template.sms_type);
      }
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
      this.smsService.deleteSmsTemplate(id).subscribe({
        next: () => {
          this.smsTemplates = this.smsTemplates.filter(t => t.id !== id);
          alert('Template deleted successfully!');
        },
        error: (err) => alert('Failed to delete template')
      });
    }
  }

  getFilteredLogs(): SmsLog[] {
    if (!this.logFilter) {
      return this.smsLogs;
    }
    return this.smsLogs.filter(log => log.status === this.logFilter);
  }

  resendSms(log: SmsLog) {
    this.smsData.customNumbers = log.recipient;
    this.smsData.message = log.message;
    this.smsData.recipients = 'custom';
    this.activeTab = 'send';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}