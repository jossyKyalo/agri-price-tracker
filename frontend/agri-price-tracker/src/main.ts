import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter, withHashLocation } from '@angular/router'; 
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';

const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      [],
      withHashLocation()
    ),
    provideHttpClient(withFetch())
  ]
};
 
bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));