import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent {
  @Input() currentPage = 'home';
  @Input() isAdmin = false;
  @Output() pageChange = new EventEmitter<string>();
  @Output() adminRegister = new EventEmitter<void>();
  
  isMenuOpen = false;

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  switchPage(page: string) {
    this.pageChange.emit(page);
    this.isMenuOpen = false;
  }

  registerAdmin() {
    this.adminRegister.emit();
    this.isMenuOpen = false;
  }
}