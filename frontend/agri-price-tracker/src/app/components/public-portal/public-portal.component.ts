import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PriceService, CropPrice, CreatePriceEntry } from '../../services/price.service';
import { CropService, Crop, Region } from '../../services/crop.service';

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
  isLoading = false;
  errorMessage = '';
  
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
  
  allCrops: CropPrice[] = [];
  crops: Crop[] = [];
  regions: Region[] = [];
  
  filteredCrops: CropPrice[] = [];

  constructor(
    private priceService: PriceService,
    private cropService: CropService
  ) {}

  ngOnInit(): void {
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.isLoading = true;
    
    // Load crops, regions, and prices
    Promise.all([
      this.cropService.getCrops().toPromise(),
      this.cropService.getRegions().toPromise(),
      this.priceService.getPrices({ limit: 50 }).toPromise()
    ]).then(([crops, regions, pricesResponse]) => {
      this.crops = crops || [];
      this.regions = regions || [];
      this.allCrops = pricesResponse?.prices || [];
      this.totalCrops = this.crops.length;
      this.filterCrops();
      this.isLoading = false;
    }).catch(error => {
      console.error('Error loading data:', error);
      this.errorMessage = 'Failed to load data. Please try again.';
      this.isLoading = false;
    });
  }

  filterCrops() {
    this.filteredCrops = this.allCrops.filter(crop => {
      const matchesSearch = crop.crop_name?.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchesRegion = !this.selectedRegion || crop.region_name?.toLowerCase().includes(this.selectedRegion.toLowerCase());
      
      return matchesSearch && matchesRegion;
    });
  }

  submitPrice() {
    if (!this.priceInput.crop || !this.priceInput.price || !this.priceInput.region) {
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
 
    const crop = this.crops.find(c => c.name.toLowerCase() === this.priceInput.crop.toLowerCase());
    const region = this.regions.find(r => r.name.toLowerCase().includes(this.priceInput.region.toLowerCase()));

    if (!crop || !region) {
      this.errorMessage = 'Invalid crop or region selected';
      this.isLoading = false;
      return;
    }

    const priceData: CreatePriceEntry = {
      crop_id: crop.id,
      region_id: region.id,
      price: this.priceInput.price,
      notes: this.priceInput.notes
    };

    this.priceService.createPriceEntry(priceData).subscribe({
      next: (response) => {
        this.isLoading = false;
        alert('Price submitted successfully! It will be verified by our admin team.');
        
        // Reset form
        this.priceInput = {
          crop: '',
          price: 0,
          location: '',
          region: '',
          notes: ''
        };
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.userMessage || 'Failed to submit price. Please try again.';
      }
    });
  }
}