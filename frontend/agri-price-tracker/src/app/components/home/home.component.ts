import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  @Output() navigateToSection = new EventEmitter<string>();
  @Output() navigateToPage = new EventEmitter<string>();

  ngOnInit() {
    // Initialize home page
  }

  navigateToCurrentPrices() {
    this.navigateToSection.emit('prices');
  }

  navigateToSmsAlerts() {
    this.navigateToSection.emit('sms');
  }

  getStarted() {
    this.navigateToPage.emit('public');
  }
  learnMore() {
    // Scroll to features section
    const featuresSection = document.querySelector('.features-section');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
}