import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRouting } from '@angular/ssr';
import { authInterceptor } from './interceptors/auth.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';

export const config: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideServerRouting(serverRoutes),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))
  ]
};