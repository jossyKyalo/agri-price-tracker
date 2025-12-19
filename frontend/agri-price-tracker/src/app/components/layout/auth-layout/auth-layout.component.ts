import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-auth-layout',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './auth-layout.component.html',
    styleUrls: ['./auth-layout.component.css']
})
export class AuthLayoutComponent { }
