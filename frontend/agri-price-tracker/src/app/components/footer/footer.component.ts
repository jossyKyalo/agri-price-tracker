import { Component, EventEmitter, Output} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class FooterComponent {
  @Output() navigateToSectionEvent = new EventEmitter<string>();
  @Output() navigateToPageEvent = new EventEmitter<string>();
  @Output() openChatbotEvent = new EventEmitter<void>();
  @Output() showAdminLogin = new EventEmitter<void>();

  navigateToSection(section: string) {
    this.navigateToSectionEvent.emit(section);
  }

  navigateToPage(page: string) {
    this.navigateToPageEvent.emit(page);
  }

  handleAdminDashboard() {
    this.showAdminLogin.emit();
  }

  openChatbot() {
    this.openChatbotEvent.emit();
  }

  showPrivacyPolicy() {
    alert('Privacy Policy: We protect your agricultural data and personal information. Your price submissions help build a transparent farming community while maintaining your privacy.');
  }

  showTermsOfService() {
    alert('Terms of Service: By using AgriPrice, you agree to provide accurate price information and use the platform responsibly to support fellow farmers.');
  }
}
