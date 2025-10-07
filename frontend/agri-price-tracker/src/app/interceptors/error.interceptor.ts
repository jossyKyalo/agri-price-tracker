import { HttpInterceptorFn } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError(error => {
      let errorMessage = 'An error occurred';
      
      if (error.error?.message) {
        errorMessage = error.error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Log error for debugging
      console.error('HTTP Error:', {
        url: req.url,
        method: req.method,
        status: error.status,
        message: errorMessage,
        error: error
      });
      
      
      return throwError(() => ({
        ...error,
        userMessage: errorMessage
      }));
    })
  );
};