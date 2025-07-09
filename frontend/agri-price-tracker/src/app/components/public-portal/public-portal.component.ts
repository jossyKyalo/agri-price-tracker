import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface CropPrice {
  id: number;
  name: string;
  category: string;
  currentPrice: number;
  previousPrice: number;
  trend: 'up' | 'down' | 'stable';
  prediction: number;
  region: string;
  market: string;
  lastUpdated: string;
}

@Component({
  selector: 'app-public-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-portal.component.html',
  styleUrls: ['./public-portal.component.css']
})
export class PublicPortalComponent implements OnInit {
  activeTab = 'prices';
  searchTerm = '';
  selectedCategory = '';
  selectedRegion = '';
  
  // Stats
  totalCrops = 156;
  totalRegions = 47;
  lastUpdated = '2 mins ago';
  
  // Price input form
  priceInput = {
    crop: '',
    price: 0,
    location: '',
    region: '',
    notes: ''
  };
  
  allCrops: CropPrice[] = [
    {
      id: 1,
      name: 'Maize',
      category: 'cereals',
      currentPrice: 50,
      previousPrice: 48,
      trend: 'up',
      prediction: 55,
      region: 'Central Kenya',
      market: 'Nairobi',
      lastUpdated: '2 hours ago'
    },
    {
      id: 2,
      name: 'Beans',
      category: 'legumes',
      currentPrice: 90,
      previousPrice: 92,
      trend: 'down',
      prediction: 85,
      region: 'Western Kenya',
      market: 'Kisumu',
      lastUpdated: '1 hour ago'
    },
    {
      id: 3,
      name: 'Tomatoes',
      category: 'vegetables',
      currentPrice: 42,
      previousPrice: 42,
      trend: 'stable',
      prediction: 43,
      region: 'Rift Valley',
      market: 'Nakuru',
      lastUpdated: '30 mins ago'
    },
    {
      id: 4,
      name: 'Potatoes',
      category: 'vegetables',
      currentPrice: 35,
      previousPrice: 32,
      trend: 'up',
      prediction: 38,
      region: 'Eastern Kenya',
      market: 'Meru',
      lastUpdated: '1 hour ago'
    },
    {
      id: 5,
      name: 'Onions',
      category: 'vegetables',
      currentPrice: 55,
      previousPrice: 58,
      trend: 'down',
      prediction: 52,
      region: 'Central Kenya',
      market: 'Nairobi',
      lastUpdated: '45 mins ago'
    },
    {
      id: 6,
      name: 'Bananas',
      category: 'fruits',
      currentPrice: 25,
      previousPrice: 25,
      trend: 'stable',
      prediction: 26,
      region: 'Central Kenya',
      market: 'Nairobi',
      lastUpdated: '2 hours ago'
    }
  ];
  
  filteredCrops: CropPrice[] = [];

  ngOnInit() {
    this.filteredCrops = [...this.allCrops];
  }

  filterCrops() {
    this.filteredCrops = this.allCrops.filter(crop => {
      const matchesSearch = crop.name.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchesCategory = !this.selectedCategory || crop.category === this.selectedCategory;
      const matchesRegion = !this.selectedRegion || crop.region.toLowerCase().includes(this.selectedRegion);
      
      return matchesSearch && matchesCategory && matchesRegion;
    });
  }

  getPriceChange(current: number, previous: number): number {
    return Math.round(((current - previous) / previous) * 100);
  }

  getPredictionChange(current: number, prediction: number): number {
    return Math.round(((prediction - current) / current) * 100);
  }

  getPredictionTrend(current: number, prediction: number): string {
    if (prediction > current) return 'up';
    if (prediction < current) return 'down';
    return 'stable';
  }

  submitPrice() {
    // Submit price to backend
    console.log('Submitting price:', this.priceInput);
    alert('Price submitted successfully! It will be verified by our admin team.');
    
    // Reset form
    this.priceInput = {
      crop: '',
      price: 0,
      location: '',
      region: '',
      notes: ''
    };
  }
}