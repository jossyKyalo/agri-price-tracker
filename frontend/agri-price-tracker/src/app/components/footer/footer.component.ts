import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class FooterComponent {

  constructor(private router: Router) { }

  navigateToSection(section: string) {
    if (this.router.url === '/' || this.router.url === '/home') {
      const element = document.getElementById(section);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      this.router.navigate(['/'], { fragment: section });
    }
  }

  handleAdminDashboard() {
    this.router.navigate(['/admin']);
  }

  openChatbot() {
    const event = new CustomEvent('openChatbot');
    window.dispatchEvent(event);
  }

  showPrivacyPolicy() {
    alert('Privacy Policy: We protect your agricultural data and personal information. Your price submissions help build a transparent farming community while maintaining your privacy.');
  }

  showTermsOfService() {
    alert('Terms of Service: By using AgriPrice, you agree to provide accurate price information and use the platform responsibly to support fellow farmers.');
  }
}
