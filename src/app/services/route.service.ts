
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface RouteStop {
  readonly stopId: number;
  readonly name: string;
  readonly stopOrder: number;
  readonly pickupTime: string;
  readonly dropoffTime: string;
}

export interface RouteItem {
  readonly routeId: number;
  readonly routeNumber: string;
  readonly name: string;
  readonly startPoint: string;
  readonly destination: string;
  readonly serviceArea: string;
  readonly capacity: number;
  readonly enrolledStudents: number;
  readonly isActive: boolean;
  readonly stops: readonly RouteStop[];
}

@Injectable({
  providedIn: 'root',
})
export class RouteService {
  private readonly http = inject(HttpClient);

  private readonly routesSignal = signal<readonly RouteItem[]>([]);
  public readonly routes = this.routesSignal.asReadonly();

  // Get all routes, with optional search and area filters
  getRoutes(search?: string, area?: string): Observable<RouteItem[]> {
    let params = new HttpParams();

    if (search) {
      params = params.set('search', search);
    }

    if (area && area !== 'All') {
      params = params.set('area', area);
    }

    return this.http.get<RouteItem[]>('/api/routes', { params });
  }

  // Get available service areas
  getRouteAreas(): Observable<string[]> {
    return this.http.get<string[]>('/api/routes/areas');
  }

  // Get one route with its details
  getRouteDetails(routeId: number): Observable<RouteItem> {
    return this.http.get<RouteItem>(`/api/routes/${routeId}`);
  }

  // Get all stops belonging to a route
  getStopsByRoute(routeId: number): Observable<RouteStop[]> {
    return this.http.get<RouteStop[]>(`/api/stops/route/${routeId}`);
  }

  // Load routes and save them in the shared signal
  fetchRoutes(): Observable<readonly RouteItem[]> {
    return this.getRoutes().pipe(
      tap((routes) => {
        this.routesSignal.set(routes);
      })
    );
  }

  // Find a route that has already been loaded
  findRouteById(routeId: number): RouteItem | undefined {
    return this.routesSignal().find(
      (route) => route.routeId === routeId
    );
  }
}
