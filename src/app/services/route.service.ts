import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';

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
  readonly busId?: number | null;
  readonly busPlate?: string | null;
  readonly assignedBus?: string | null;
  readonly plateNumber?: string | null;
  readonly bus?: {
    readonly busId?: number;
    readonly plateNumber?: string;
    readonly busPlate?: string;
    readonly model?: string;
  } | null;
  readonly driverId?: number | null;
  readonly driverName?: string | null;
  readonly assignedDriver?: string | null;
  readonly driver?:
    | string
    | {
        readonly driverId?: number;
        readonly fullName?: string;
        readonly name?: string;
      }
    | null;
  readonly stops: readonly RouteStop[];
}

const DEFAULT_ROUTES: readonly RouteItem[] = [
  {
    routeId: 1,
    routeNumber: 'R101',
    name: 'North Amman Route',
    startPoint: 'Abu Nseir',
    destination: 'Basi School',
    serviceArea: 'North Amman',
    capacity: 30,
    enrolledStudents: 18,
    isActive: true,
    stops: [
      { stopId: 101, name: 'Abu Nseir Circle', stopOrder: 1, pickupTime: '6:45 AM', dropoffTime: '2:45 PM' },
      { stopId: 102, name: 'Shafa Badran', stopOrder: 2, pickupTime: '7:00 AM', dropoffTime: '2:30 PM' },
      { stopId: 103, name: 'University Street', stopOrder: 3, pickupTime: '7:15 AM', dropoffTime: '2:15 PM' },
      { stopId: 104, name: 'Basi School', stopOrder: 4, pickupTime: '7:30 AM', dropoffTime: '2:00 PM' },
    ],
  },
  {
    routeId: 2,
    routeNumber: 'R102',
    name: 'West Amman Route',
    startPoint: 'Khalda',
    destination: 'Basi School',
    serviceArea: 'West Amman',
    capacity: 30,
    enrolledStudents: 25,
    isActive: true,
    stops: [
      { stopId: 201, name: 'Khalda Circle', stopOrder: 1, pickupTime: '6:50 AM', dropoffTime: '2:40 PM' },
      { stopId: 202, name: 'Tla Al Ali', stopOrder: 2, pickupTime: '7:00 AM', dropoffTime: '2:30 PM' },
      { stopId: 203, name: 'Dabouq', stopOrder: 3, pickupTime: '7:12 AM', dropoffTime: '2:18 PM' },
      { stopId: 204, name: 'Basi School', stopOrder: 4, pickupTime: '7:30 AM', dropoffTime: '2:00 PM' },
    ],
  },
  {
    routeId: 3,
    routeNumber: 'R103',
    name: 'Downtown Route',
    startPoint: 'Ras Al Ain',
    destination: 'Basi School',
    serviceArea: 'Downtown',
    capacity: 30,
    enrolledStudents: 22,
    isActive: true,
    stops: [
      { stopId: 301, name: 'Ras Al Ain', stopOrder: 1, pickupTime: '6:40 AM', dropoffTime: '2:50 PM' },
      { stopId: 302, name: 'Downtown Amman', stopOrder: 2, pickupTime: '6:50 AM', dropoffTime: '2:40 PM' },
      { stopId: 303, name: 'Jabal Amman', stopOrder: 3, pickupTime: '7:05 AM', dropoffTime: '2:25 PM' },
      { stopId: 304, name: 'Basi School', stopOrder: 4, pickupTime: '7:30 AM', dropoffTime: '2:00 PM' },
    ],
  },
  {
    routeId: 4,
    routeNumber: 'R104',
    name: 'East Amman Route',
    startPoint: 'Marka',
    destination: 'Basi School',
    serviceArea: 'East Amman',
    capacity: 30,
    enrolledStudents: 30,
    isActive: true,
    stops: [
      { stopId: 401, name: 'Marka', stopOrder: 1, pickupTime: '6:40 AM', dropoffTime: '2:45 PM' },
      { stopId: 402, name: 'Tabarbour', stopOrder: 2, pickupTime: '6:55 AM', dropoffTime: '2:30 PM' },
      { stopId: 403, name: 'Tareq', stopOrder: 3, pickupTime: '7:10 AM', dropoffTime: '2:15 PM' },
      { stopId: 404, name: 'Basi School', stopOrder: 4, pickupTime: '7:30 AM', dropoffTime: '2:00 PM' },
    ],
  },
];

@Injectable({
  providedIn: 'root',
})
export class RouteService {
  private readonly http = inject(HttpClient);

  private readonly routesSignal = signal<readonly RouteItem[]>(DEFAULT_ROUTES);
  public readonly routes = this.routesSignal.asReadonly();
  private readonly hasBackendRoutesSignal = signal(false);
  public readonly hasBackendRoutes = this.hasBackendRoutesSignal.asReadonly();

  // Get all routes, with optional search and area filters
  getRoutes(search?: string, area?: string): Observable<RouteItem[]> {
    let params = new HttpParams();

    if (search) {
      params = params.set('search', search);
    }

    if (area && area !== 'All') {
      params = params.set('area', area);
    }

    return this.http.get<RouteItem[]>('/api/routes', { params }).pipe(
      tap((routes) => {
        if (Array.isArray(routes)) {
          this.hasBackendRoutesSignal.set(true);
          if (!search && (!area || area === 'All')) {
            this.routesSignal.set(routes);
          }
        }
      })
    );
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
    return this.http.get<unknown[]>(`/api/stops/route/${routeId}`).pipe(
      map((items) =>
        Array.isArray(items) ? items.map((item) => this.normalizeStop(item)) : []
      ),
      catchError(() => of((this.findLiveRouteById(routeId)?.stops as RouteStop[]) ?? []))
    );
  }

  private normalizeStop(rawInput: unknown): RouteStop {
    const raw = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<string, unknown>;
    return {
      stopId: Number(raw['stopId'] ?? raw['StopId'] ?? raw['id'] ?? raw['Id'] ?? 0) || 0,
      name: String(raw['name'] ?? raw['Name'] ?? raw['stopName'] ?? raw['StopName'] ?? '').trim(),
      stopOrder: Number(raw['stopOrder'] ?? raw['StopOrder'] ?? raw['order'] ?? 0) || 0,
      pickupTime: String(
        raw['pickupTime'] ?? raw['PickupTime'] ?? raw['pickUpTime'] ?? raw['PickUpTime'] ?? ''
      ).trim(),
      dropoffTime: String(
        raw['dropoffTime'] ?? raw['DropoffTime'] ?? raw['dropOffTime'] ?? raw['DropOffTime'] ?? ''
      ).trim(),
    };
  }

  // Load routes and save them in the shared signal with safe fallback
  fetchRoutes(): Observable<readonly RouteItem[]> {
    return this.getRoutes().pipe(
      tap((routes) => {
        if (Array.isArray(routes)) {
          this.hasBackendRoutesSignal.set(true);
          this.routesSignal.set(routes);
        }
      }),
      catchError(() => of(this.routesSignal()))
    );
  }

  // Find a route by its ID (only from real backend data when loaded)
  findLiveRouteById(routeId: number): RouteItem | undefined {
    if (!this.hasBackendRoutesSignal()) return undefined;
    return this.routesSignal().find((route) => route.routeId === routeId);
  }

  // Find a route by its ID
  findRouteById(routeId: number): RouteItem | undefined {
    return this.routesSignal().find((route) => route.routeId === routeId);
  }

  getRouteById(routeId: number): RouteItem | undefined {
    return this.findRouteById(routeId);
  }
}
