import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

export interface AdminStudentItem {
  readonly studentId: number;
  readonly fullName: string;
  readonly parentName: string;
  readonly parentEmail: string;
  readonly grade: string;
  readonly className: string;
  readonly routeNumber: string;
  readonly routeName: string;
  readonly stopName: string;
  readonly transportType: 'OneWay' | 'RoundTrip';
  readonly status: 'Active' | 'Pending' | 'Inactive';
}

export interface AdminParentItem {
  readonly parentId: number;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly studentsCount: number;
}

export interface AdminRouteItem {
  readonly routeId: number;
  readonly routeNumber: string;
  readonly name: string;
  readonly startPoint: string;
  readonly destination: string;
  readonly serviceArea: string;
  readonly capacity: number;
  readonly enrolledStudents: number;
  readonly isActive: boolean;
  readonly busPlate: string;
  readonly driverName: string;
}

export interface AdminStopItem {
  readonly stopId: number;
  readonly routeId: number;
  readonly routeNumber: string;
  readonly name: string;
  readonly stopOrder: number;
  readonly pickupTime: string;
  readonly dropoffTime: string;
}

export interface AdminBusItem {
  readonly busId: number;
  readonly plateNumber: string;
  readonly capacity: number;
  readonly assignedRoute: string;
  readonly isActive: boolean;
}

export interface AdminDriverItem {
  readonly driverId: number;
  readonly fullName: string;
  readonly phone: string;
  readonly licenseNumber: string;
  readonly assignedBus: string;
  readonly isActive: boolean;
}

export interface AdminSubscriptionItem {
  readonly subscriptionId: number;
  readonly referenceNumber: string;
  readonly studentName: string;
  readonly parentName: string;
  readonly routeNumber: string;
  readonly routeName: string;
  readonly stopName: string;
  readonly transportType: 'OneWay' | 'RoundTrip';
  readonly fee: number;
  readonly status: 'Pending' | 'AwaitingPayment' | 'Approved' | 'Rejected';
  readonly requestedAt: string;
}

export interface AdminPaymentItem {
  readonly paymentId: number;
  readonly subscriptionId?: number;
  readonly referenceNumber: string;
  readonly studentName: string;
  readonly parentName: string;
  readonly amountDue: number;
  readonly amountPaid: number;
  readonly status: 'Unpaid' | 'Partial' | 'Paid';
  readonly paymentDate: string;
  readonly recordedBy: string;
}

const STORAGE_KEYS = {
  ROUTES: 'stms_admin_routes',
  STOPS: 'stms_admin_stops',
  BUSES: 'stms_admin_buses',
  DRIVERS: 'stms_admin_drivers',
  SUBSCRIPTIONS: 'stms_admin_subscriptions',
  PAYMENTS: 'stms_admin_payments',
  STUDENTS: 'stms_admin_students',
  PARENTS: 'stms_admin_parents',
};

const INITIAL_ROUTES: AdminRouteItem[] = [
  {
    routeId: 1,
    routeNumber: 'R1',
    name: 'Abdoun Line (West Amman)',
    startPoint: 'Abdoun Circle',
    destination: 'Basi School',
    serviceArea: 'West Amman',
    capacity: 30,
    enrolledStudents: 22,
    isActive: true,
    busPlate: '50 12345',
    driverName: 'Driver Abu Tariq',
  },
  {
    routeId: 2,
    routeNumber: 'R2',
    name: 'Jubeiha Line (North Amman)',
    startPoint: 'Jubeiha',
    destination: 'Basi School',
    serviceArea: 'North Amman',
    capacity: 25,
    enrolledStudents: 18,
    isActive: true,
    busPlate: '50 23456',
    driverName: 'Driver Omar',
  },
  {
    routeId: 3,
    routeNumber: 'R3',
    name: 'Khalda Line (West Amman)',
    startPoint: 'Khalda',
    destination: 'Basi School',
    serviceArea: 'West Amman',
    capacity: 30,
    enrolledStudents: 24,
    isActive: true,
    busPlate: '50 34567',
    driverName: 'Driver Mustafa',
  },
  {
    routeId: 4,
    routeNumber: 'R4',
    name: 'Shafa Badran Line (North Amman)',
    startPoint: 'Shafa Badran',
    destination: 'Basi School',
    serviceArea: 'North Amman',
    capacity: 30,
    enrolledStudents: 20,
    isActive: true,
    busPlate: '50 45678',
    driverName: 'Driver Mahmoud',
  },
];

const INITIAL_STOPS: AdminStopItem[] = [
  { stopId: 101, routeId: 1, routeNumber: 'R1', name: 'Abdoun Circle', stopOrder: 1, pickupTime: '6:45 AM', dropoffTime: '2:45 PM' },
  { stopId: 102, routeId: 1, routeNumber: 'R1', name: '4th Circle', stopOrder: 2, pickupTime: '7:00 AM', dropoffTime: '2:30 PM' },
  { stopId: 103, routeId: 1, routeNumber: 'R1', name: '5th Circle', stopOrder: 3, pickupTime: '7:15 AM', dropoffTime: '2:15 PM' },
  { stopId: 104, routeId: 1, routeNumber: 'R1', name: 'Basi School Main Gate', stopOrder: 4, pickupTime: '7:30 AM', dropoffTime: '2:00 PM' },
  { stopId: 201, routeId: 2, routeNumber: 'R2', name: 'Jubeiha Center', stopOrder: 1, pickupTime: '6:50 AM', dropoffTime: '2:40 PM' },
  { stopId: 202, routeId: 2, routeNumber: 'R2', name: 'University Street', stopOrder: 2, pickupTime: '7:00 AM', dropoffTime: '2:30 PM' },
  { stopId: 203, routeId: 2, routeNumber: 'R2', name: 'Dabouq Intersection', stopOrder: 3, pickupTime: '7:12 AM', dropoffTime: '2:18 PM' },
];

const INITIAL_BUSES: AdminBusItem[] = [
  { busId: 1, plateNumber: '50 12345', capacity: 30, assignedRoute: 'R1 Abdoun Line', isActive: true },
  { busId: 2, plateNumber: '50 23456', capacity: 25, assignedRoute: 'R2 Jubeiha Line', isActive: true },
  { busId: 3, plateNumber: '50 34567', capacity: 30, assignedRoute: 'R3 Khalda Line', isActive: true },
  { busId: 4, plateNumber: '50 45678', capacity: 30, assignedRoute: 'R4 Shafa Badran Line', isActive: true },
  { busId: 5, plateNumber: '50 56789', capacity: 30, assignedRoute: 'Standby Backup Bus', isActive: true },
  { busId: 6, plateNumber: '50 67890', capacity: 25, assignedRoute: 'Maintenance Reserve', isActive: false },
];

const INITIAL_DRIVERS: AdminDriverItem[] = [
  { driverId: 1, fullName: 'Driver Abu Tariq', phone: '0795551122', licenseNumber: 'LIC 2020 901', assignedBus: '50 12345 (R1)', isActive: true },
  { driverId: 2, fullName: 'Driver Omar', phone: '0795552233', licenseNumber: 'LIC 2019 443', assignedBus: '50 23456 (R2)', isActive: true },
  { driverId: 3, fullName: 'Driver Mustafa', phone: '0795553344', licenseNumber: 'LIC 2021 782', assignedBus: '50 34567 (R3)', isActive: true },
  { driverId: 4, fullName: 'Driver Mahmoud', phone: '0795554455', licenseNumber: 'LIC 2018 619', assignedBus: '50 45678 (R4)', isActive: true },
  { driverId: 5, fullName: 'Driver Khaled', phone: '0795556677', licenseNumber: 'LIC 2022 108', assignedBus: 'Standby Reserve', isActive: true },
];

const INITIAL_PARENTS: AdminParentItem[] = [
  { parentId: 1, fullName: 'Ahmad Guardian', email: 'parent@stms.edu', phone: '0791234567', address: 'Amman, West Amman', studentsCount: 2 },
  { parentId: 2, fullName: 'Faris Al Basi', email: 'faris@example.com', phone: '0792345678', address: 'Amman, Khalda', studentsCount: 1 },
  { parentId: 3, fullName: 'Zaid Guardian', email: 'zaid@example.com', phone: '0793456789', address: 'Amman, Shafa Badran', studentsCount: 1 },
  { parentId: 4, fullName: 'Samer Guardian', email: 'samer@example.com', phone: '0794567890', address: 'Amman, Downtown', studentsCount: 2 },
];

const INITIAL_STUDENTS: AdminStudentItem[] = [
  { studentId: 101, fullName: 'Yousef Al Basi', parentName: 'Ahmad Guardian', parentEmail: 'parent@stms.edu', grade: 'Grade 5', className: '5A', routeNumber: 'R1', routeName: 'Abdoun Line (West Amman)', stopName: 'Abdoun Circle', transportType: 'RoundTrip', status: 'Active' },
  { studentId: 102, fullName: 'Layan Al Basi', parentName: 'Ahmad Guardian', parentEmail: 'parent@stms.edu', grade: 'Grade 2', className: '2B', routeNumber: 'R1', routeName: 'Abdoun Line (West Amman)', stopName: 'Abdoun Circle', transportType: 'RoundTrip', status: 'Active' },
  { studentId: 103, fullName: 'Kareem Faris', parentName: 'Faris Al Basi', parentEmail: 'faris@example.com', grade: 'Grade 4', className: '4A', routeNumber: 'R3', routeName: 'Khalda Line (West Amman)', stopName: 'Khalda Circle', transportType: 'RoundTrip', status: 'Active' },
  { studentId: 104, fullName: 'Salma Zaid', parentName: 'Zaid Guardian', parentEmail: 'zaid@example.com', grade: 'Grade 3', className: '3C', routeNumber: 'R4', routeName: 'Shafa Badran Line (North Amman)', stopName: 'Shafa Badran', transportType: 'OneWay', status: 'Pending' },
  { studentId: 105, fullName: 'Hamza Samer', parentName: 'Samer Guardian', parentEmail: 'samer@example.com', grade: 'Grade 6', className: '6B', routeNumber: 'R2', routeName: 'Jubeiha Line (North Amman)', stopName: 'University Street', transportType: 'RoundTrip', status: 'Active' },
];

const INITIAL_SUBSCRIPTIONS: AdminSubscriptionItem[] = [
  { subscriptionId: 1001, referenceNumber: 'SUB 2026 84920', studentName: 'Yousef Al Basi', parentName: 'Ahmad Guardian', routeNumber: 'R1', routeName: 'Abdoun Line (West Amman)', stopName: 'Abdoun Circle', transportType: 'RoundTrip', fee: 300, status: 'Approved', requestedAt: '2026-11-18' },
  { subscriptionId: 1002, referenceNumber: 'SUB 2026 51293', studentName: 'Layan Al Basi', parentName: 'Ahmad Guardian', routeNumber: 'R1', routeName: 'Abdoun Line (West Amman)', stopName: 'Abdoun Circle', transportType: 'RoundTrip', fee: 300, status: 'Approved', requestedAt: '2026-11-18' },
  { subscriptionId: 1003, referenceNumber: 'SUB 2026 19384', studentName: 'Kareem Faris', parentName: 'Faris Al Basi', routeNumber: 'R3', routeName: 'Khalda Line (West Amman)', stopName: 'Khalda Circle', transportType: 'RoundTrip', fee: 300, status: 'AwaitingPayment', requestedAt: '2026-11-17' },
  { subscriptionId: 1004, referenceNumber: 'SUB 2026 73819', studentName: 'Salma Zaid', parentName: 'Zaid Guardian', routeNumber: 'R4', routeName: 'Shafa Badran Line (North Amman)', stopName: 'Shafa Badran', transportType: 'OneWay', fee: 150, status: 'Pending', requestedAt: '2026-11-19' },
  { subscriptionId: 1005, referenceNumber: 'SUB 2026 40291', studentName: 'Hamza Samer', parentName: 'Samer Guardian', routeNumber: 'R2', routeName: 'Jubeiha Line (North Amman)', stopName: 'University Street', transportType: 'RoundTrip', fee: 300, status: 'Pending', requestedAt: '2026-11-19' },
  { subscriptionId: 1006, referenceNumber: 'SUB 2026 62910', studentName: 'Maya Ahmad', parentName: 'Samer Guardian', routeNumber: 'R4', routeName: 'Shafa Badran Line (North Amman)', stopName: 'Shafa Badran', transportType: 'RoundTrip', fee: 300, status: 'Rejected', requestedAt: '2026-11-15' },
];

const INITIAL_PAYMENTS: AdminPaymentItem[] = [
  { paymentId: 501, subscriptionId: 1001, referenceNumber: 'SUB 2026 84920', studentName: 'Yousef Al Basi', parentName: 'Ahmad Guardian', amountDue: 300, amountPaid: 300, status: 'Paid', paymentDate: '2026-11-18', recordedBy: 'Admin Office' },
  { paymentId: 502, subscriptionId: 1002, referenceNumber: 'SUB 2026 51293', studentName: 'Layan Al Basi', parentName: 'Ahmad Guardian', amountDue: 300, amountPaid: 300, status: 'Paid', paymentDate: '2026-11-18', recordedBy: 'Admin Office' },
  { paymentId: 503, subscriptionId: 1003, referenceNumber: 'SUB 2026 19384', studentName: 'Kareem Faris', parentName: 'Faris Al Basi', amountDue: 300, amountPaid: 0, status: 'Unpaid', paymentDate: '2026-11-17', recordedBy: 'Finance Desk' },
  { paymentId: 504, subscriptionId: 1004, referenceNumber: 'SUB 2026 73819', studentName: 'Salma Zaid', parentName: 'Zaid Guardian', amountDue: 150, amountPaid: 0, status: 'Unpaid', paymentDate: '2026-11-19', recordedBy: 'Pending Payment' },
  { paymentId: 505, subscriptionId: 1005, referenceNumber: 'SUB 2026 40291', studentName: 'Hamza Samer', parentName: 'Samer Guardian', amountDue: 300, amountPaid: 0, status: 'Unpaid', paymentDate: '2026-11-19', recordedBy: 'Pending Payment' },
];

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly http = inject(HttpClient);

  private readonly routesSignal = signal<AdminRouteItem[]>(this.loadStorage(STORAGE_KEYS.ROUTES, INITIAL_ROUTES));
  private readonly stopsSignal = signal<AdminStopItem[]>(this.loadStorage(STORAGE_KEYS.STOPS, INITIAL_STOPS));
  private readonly busesSignal = signal<AdminBusItem[]>(this.loadStorage(STORAGE_KEYS.BUSES, INITIAL_BUSES));
  private readonly driversSignal = signal<AdminDriverItem[]>(this.loadStorage(STORAGE_KEYS.DRIVERS, INITIAL_DRIVERS));
  private readonly subscriptionsSignal = signal<AdminSubscriptionItem[]>(this.loadStorage(STORAGE_KEYS.SUBSCRIPTIONS, INITIAL_SUBSCRIPTIONS));
  private readonly paymentsSignal = signal<AdminPaymentItem[]>(this.loadStorage(STORAGE_KEYS.PAYMENTS, INITIAL_PAYMENTS));
  private readonly studentsSignal = signal<AdminStudentItem[]>(this.loadStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS));
  private readonly parentsSignal = signal<AdminParentItem[]>(this.loadStorage(STORAGE_KEYS.PARENTS, INITIAL_PARENTS));

  public readonly routes = this.routesSignal.asReadonly();
  public readonly stops = this.stopsSignal.asReadonly();
  public readonly buses = this.busesSignal.asReadonly();
  public readonly drivers = this.driversSignal.asReadonly();
  public readonly subscriptions = this.subscriptionsSignal.asReadonly();
  public readonly payments = this.paymentsSignal.asReadonly();
  public readonly students = this.studentsSignal.asReadonly();
  public readonly parents = this.parentsSignal.asReadonly();

  public readonly totalStudents = computed(() => this.studentsSignal().length);
  public readonly activeSubscriptions = computed(() => this.subscriptionsSignal().filter(s => s.status === 'Approved').length);
  public readonly availableBuses = computed(() => this.busesSignal().filter(b => b.isActive).length);
  public readonly pendingRequests = computed(() => this.subscriptionsSignal().filter(s => s.status === 'Pending').length);

  public readonly totalCapacity = computed(() => this.busesSignal().filter(b => b.isActive).reduce((sum, b) => sum + b.capacity, 0));
  public readonly occupiedCapacity = computed(() => this.routesSignal().filter(r => r.isActive).reduce((sum, r) => sum + r.enrolledStudents, 0));

  private loadStorage<T>(key: string, fallback: T): T {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const item = localStorage.getItem(key);
        if (item) {
          return JSON.parse(item) as T;
        }
      }
    } catch {
      // Fallback on storage errors
    }
    return fallback;
  }

  private saveStorage<T>(key: string, data: T): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch {
      // Ignore write errors
    }
  }

  public addRoute(newRoute: Omit<AdminRouteItem, 'routeId'>): Observable<unknown> {
    const tempId = Date.now();
    const localItem: AdminRouteItem = { ...newRoute, routeId: tempId };
    const updated = [...this.routesSignal(), localItem];
    this.routesSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.ROUTES, updated);

    const payload = {
      routeNumber: newRoute.routeNumber,
      name: newRoute.name,
      startPoint: newRoute.startPoint,
      destination: newRoute.destination,
      serviceArea: newRoute.serviceArea,
      capacity: newRoute.capacity,
      busId: null,
      driverId: null,
    };

    return this.http.post<Record<string, unknown>>('/api/routes/admin', payload).pipe(
      tap((res) => {
        if (res && (res['routeId'] || res['id'])) {
          const backendId = Number(res['routeId'] ?? res['id']);
          const synced = this.routesSignal().map((r) =>
            r.routeId === tempId ? { ...r, routeId: backendId } : r
          );
          this.routesSignal.set(synced);
          this.saveStorage(STORAGE_KEYS.ROUTES, synced);
        }
        this.fetchRoutes().subscribe();
      }),
      catchError(() => of(localItem))
    );
  }

  public toggleRouteActive(routeId: number): Observable<unknown> {
    const route = this.routesSignal().find((r) => r.routeId === routeId);
    if (!route) return of(null);

    const newStatus = !route.isActive;
    const updated = this.routesSignal().map((r) =>
      r.routeId === routeId ? { ...r, isActive: newStatus } : r
    );
    this.routesSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.ROUTES, updated);

    const endpoint = newStatus
      ? `/api/routes/admin/${routeId}/activate`
      : `/api/routes/admin/${routeId}/deactivate`;

    return this.http.patch(endpoint, {}).pipe(
      tap(() => {
        this.fetchRoutes().subscribe();
      }),
      catchError(() => of(null))
    );
  }

  public addStop(newStop: Omit<AdminStopItem, 'stopId'>): Observable<unknown> {
    const tempId = Date.now();
    const item: AdminStopItem = { ...newStop, stopId: tempId };
    const updated = [...this.stopsSignal(), item];
    this.stopsSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.STOPS, updated);

    const payload = {
      name: newStop.name.trim(),
      routeId: newStop.routeId,
      stopOrder: newStop.stopOrder,
      pickupTime: newStop.pickupTime.trim(),
      dropoffTime: newStop.dropoffTime.trim(),
    };

    return this.http.post<Record<string, unknown>>('/api/stops/admin', payload).pipe(
      tap((res) => {
        if (res && (res['stopId'] || res['id'])) {
          const backendId = Number(res['stopId'] ?? res['id']);
          const synced = this.stopsSignal().map((s) => (s.stopId === tempId ? { ...s, stopId: backendId } : s));
          this.stopsSignal.set(synced);
          this.saveStorage(STORAGE_KEYS.STOPS, synced);
        }
        this.fetchStops().subscribe();
      }),
      catchError(() => of(item))
    );
  }

  public deleteStop(stopId: number): Observable<unknown> {
    const updated = this.stopsSignal().filter((s) => s.stopId !== stopId);
    this.stopsSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.STOPS, updated);

    return this.http.delete(`/api/stops/admin/${stopId}`).pipe(
      tap(() => {
        this.fetchStops().subscribe();
      }),
      catchError(() => of(null))
    );
  }

  public addBus(newBus: Omit<AdminBusItem, 'busId'>): Observable<unknown> {
    const tempId = Date.now();
    const item: AdminBusItem = { ...newBus, busId: tempId };
    const updated = [...this.busesSignal(), item];
    this.busesSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.BUSES, updated);

    const payload = {
      plateNumber: newBus.plateNumber.trim(),
      capacity: newBus.capacity,
    };

    return this.http.post<Record<string, unknown>>('/api/buses/admin', payload).pipe(
      tap((res) => {
        if (res && (res['busId'] || res['id'])) {
          const backendId = Number(res['busId'] ?? res['id']);
          const synced = this.busesSignal().map((b) => (b.busId === tempId ? { ...b, busId: backendId } : b));
          this.busesSignal.set(synced);
          this.saveStorage(STORAGE_KEYS.BUSES, synced);
        }
        this.fetchBuses().subscribe();
      }),
      catchError(() => of(item))
    );
  }

  public toggleBusActive(busId: number): Observable<unknown> {
    const bus = this.busesSignal().find((b) => b.busId === busId);
    if (!bus) return of(null);

    const newStatus = !bus.isActive;
    const updated = this.busesSignal().map((b) => (b.busId === busId ? { ...b, isActive: newStatus } : b));
    this.busesSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.BUSES, updated);

    const endpoint = newStatus
      ? `/api/buses/admin/${busId}/activate`
      : `/api/buses/admin/${busId}/deactivate`;

    return this.http.patch(endpoint, {}).pipe(
      tap(() => {
        this.fetchBuses().subscribe();
      }),
      catchError(() => of(null))
    );
  }

  public addDriver(newDriver: Omit<AdminDriverItem, 'driverId'>): Observable<unknown> {
    const tempId = Date.now();
    const item: AdminDriverItem = { ...newDriver, driverId: tempId };
    const updated = [...this.driversSignal(), item];
    this.driversSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.DRIVERS, updated);

    const payload = {
      fullName: newDriver.fullName.trim(),
      phone: newDriver.phone.trim(),
      licenseNumber: newDriver.licenseNumber.trim(),
    };

    return this.http.post<Record<string, unknown>>('/api/drivers/admin', payload).pipe(
      tap((res) => {
        if (res && (res['driverId'] || res['id'])) {
          const backendId = Number(res['driverId'] ?? res['id']);
          const synced = this.driversSignal().map((d) => (d.driverId === tempId ? { ...d, driverId: backendId } : d));
          this.driversSignal.set(synced);
          this.saveStorage(STORAGE_KEYS.DRIVERS, synced);
        }
        this.fetchDrivers().subscribe();
      }),
      catchError(() => of(item))
    );
  }

  public toggleDriverActive(driverId: number): Observable<unknown> {
    const driver = this.driversSignal().find((d) => d.driverId === driverId);
    if (!driver) return of(null);

    const newStatus = !driver.isActive;
    const updated = this.driversSignal().map((d) => (d.driverId === driverId ? { ...d, isActive: newStatus } : d));
    this.driversSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.DRIVERS, updated);

    const endpoint = newStatus
      ? `/api/drivers/admin/${driverId}/activate`
      : `/api/drivers/admin/${driverId}/deactivate`;

    return this.http.patch(endpoint, {}).pipe(
      tap(() => {
        this.fetchDrivers().subscribe();
      }),
      catchError(() => of(null))
    );
  }

  public fetchBuses(): Observable<AdminBusItem[]> {
    return this.http.get<unknown[]>('/api/buses/admin').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => this.mapBus(item as Record<string, unknown>));
      }),
      tap((items) => {
        if (Array.isArray(items) && items.length > 0) {
          this.busesSignal.set(items);
          this.saveStorage(STORAGE_KEYS.BUSES, items);
        }
      }),
      catchError(() => of(this.busesSignal()))
    );
  }

  private mapBus(item: Record<string, unknown>): AdminBusItem {
    const busId = Number(item['busId'] ?? item['id'] ?? 0);
    const plateNumber = String(item['plateNumber'] ?? item['busPlate'] ?? '50 12345');
    const capacity = Number(item['capacity'] ?? 30);
    const assignedRoute = String(
      item['assignedRoute'] ?? item['routeName'] ?? (item['routeNumber'] ? `${item['routeNumber']} Line` : 'Standby Reserve')
    );
    const isActive = item['isActive'] !== false && item['status'] !== 'Inactive';
    return { busId, plateNumber, capacity, assignedRoute, isActive };
  }

  public fetchDrivers(): Observable<AdminDriverItem[]> {
    return this.http.get<unknown[]>('/api/drivers/admin').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => this.mapDriver(item as Record<string, unknown>));
      }),
      tap((items) => {
        if (Array.isArray(items) && items.length > 0) {
          this.driversSignal.set(items);
          this.saveStorage(STORAGE_KEYS.DRIVERS, items);
        }
      }),
      catchError(() => of(this.driversSignal()))
    );
  }

  private mapDriver(item: Record<string, unknown>): AdminDriverItem {
    const driverId = Number(item['driverId'] ?? item['id'] ?? 0);
    const fullName = String(item['fullName'] ?? item['name'] ?? 'Driver');
    const phone = String(item['phone'] ?? item['phoneNumber'] ?? '0795551122');
    const licenseNumber = String(item['licenseNumber'] ?? 'LIC 2026');
    const assignedBus = String(item['assignedBus'] ?? (item['busPlate'] ? String(item['busPlate']) : 'Standby Reserve'));
    const isActive = item['isActive'] !== false && item['status'] !== 'Inactive';
    return { driverId, fullName, phone, licenseNumber, assignedBus, isActive };
  }

  public fetchStops(): Observable<AdminStopItem[]> {
    return this.http.get<unknown[]>('/api/stops/admin').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => this.mapStop(item as Record<string, unknown>));
      }),
      tap((items) => {
        if (Array.isArray(items) && items.length > 0) {
          this.stopsSignal.set(items);
          this.saveStorage(STORAGE_KEYS.STOPS, items);
        }
      }),
      catchError(() => {
        const routes = this.routesSignal();
        if (routes.length === 0) return of(this.stopsSignal());

        routes.forEach((r) => {
          this.http
            .get<unknown[]>(`/api/stops/route/${r.routeId}`)
            .pipe(
              map((stops) => {
                if (!Array.isArray(stops)) return [];
                return stops.map((s) => this.mapStop(s as Record<string, unknown>, r));
              }),
              tap((mappedStops) => {
                if (mappedStops.length > 0) {
                  const current = this.stopsSignal().filter((s) => s.routeId !== r.routeId);
                  const combined = [...current, ...mappedStops];
                  this.stopsSignal.set(combined);
                  this.saveStorage(STORAGE_KEYS.STOPS, combined);
                }
              }),
              catchError(() => of([]))
            )
            .subscribe();
        });

        return of(this.stopsSignal());
      })
    );
  }

  private mapStop(item: Record<string, unknown>, route?: AdminRouteItem): AdminStopItem {
    const stopId = Number(item['stopId'] ?? item['id'] ?? 0);
    const routeId = Number(item['routeId'] ?? route?.routeId ?? 1);
    const r = route ?? this.routesSignal().find((x) => x.routeId === routeId);
    const routeNumber = String(item['routeNumber'] ?? r?.routeNumber ?? 'R1');
    const name = String(item['name'] ?? item['stopName'] ?? 'Stop');
    const stopOrder = Number(item['stopOrder'] ?? item['order'] ?? 1);
    const pickupTime = String(item['pickupTime'] ?? '7:00 AM');
    const dropoffTime = String(item['dropoffTime'] ?? '2:30 PM');
    return { stopId, routeId, routeNumber, name, stopOrder, pickupTime, dropoffTime };
  }

  public fetchParents(): Observable<AdminParentItem[]> {
    return this.http.get<unknown[]>('/api/parents/admin').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => this.mapParent(item as Record<string, unknown>));
      }),
      tap((items) => {
        if (Array.isArray(items) && items.length > 0) {
          this.parentsSignal.set(items);
          this.saveStorage(STORAGE_KEYS.PARENTS, items);
        }
      }),
      catchError(() => {
        const subs = this.subscriptionsSignal();
        const parentsMap = new Map<string, AdminParentItem>();

        let nextId = 1;
        subs.forEach((s) => {
          const key = s.parentName.toLowerCase();
          if (!parentsMap.has(key)) {
            parentsMap.set(key, {
              parentId: nextId++,
              fullName: s.parentName,
              email: `${s.parentName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
              phone: '079' + Math.floor(1000000 + Math.random() * 9000000),
              address: 'Amman, Jordan',
              studentsCount: 1,
            });
          } else {
            const existing = parentsMap.get(key)!;
            parentsMap.set(key, { ...existing, studentsCount: existing.studentsCount + 1 });
          }
        });

        const derived = Array.from(parentsMap.values());
        if (derived.length > 0) {
          this.parentsSignal.set(derived);
          this.saveStorage(STORAGE_KEYS.PARENTS, derived);
        }

        return of(this.parentsSignal());
      })
    );
  }

  private mapParent(item: Record<string, unknown>): AdminParentItem {
    const parentId = Number(item['parentId'] ?? item['id'] ?? 0);
    const fullName = String(item['fullName'] ?? item['name'] ?? 'Parent');
    const email = String(item['email'] ?? '');
    const phone = String(item['phone'] ?? item['phoneNumber'] ?? '');
    const address = String(item['address'] ?? 'Amman');
    const studentsCount = Number(item['studentsCount'] ?? item['childrenCount'] ?? 1);
    return { parentId, fullName, email, phone, address, studentsCount };
  }

  public fetchSubscriptions(): Observable<AdminSubscriptionItem[]> {
    return this.http.get<unknown[]>('/api/subscriptions/admin').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => this.mapSubscription(item as Record<string, unknown>));
      }),
      tap((items) => {
        if (items.length > 0) {
          this.subscriptionsSignal.set(items);
          this.saveStorage(STORAGE_KEYS.SUBSCRIPTIONS, items);
        }
      }),
      catchError(() => of(this.subscriptionsSignal()))
    );
  }

  public fetchStudents(): Observable<AdminStudentItem[]> {
    return this.http.get<unknown[]>('/api/students').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => this.mapStudent(item as Record<string, unknown>));
      }),
      tap((items) => {
        if (items.length > 0) {
          this.studentsSignal.set(items);
          this.saveStorage(STORAGE_KEYS.STUDENTS, items);
        }
      }),
      catchError(() => of(this.studentsSignal()))
    );
  }

  public fetchRoutes(): Observable<AdminRouteItem[]> {
    return this.http.get<unknown[]>('/api/routes/admin').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => this.mapRoute(item as Record<string, unknown>));
      }),
      tap((items) => {
        if (Array.isArray(items) && items.length > 0) {
          this.routesSignal.set(items);
          this.saveStorage(STORAGE_KEYS.ROUTES, items);
        }
      }),
      catchError(() => of(this.routesSignal()))
    );
  }

  private mapStudent(item: Record<string, unknown>): AdminStudentItem {
    const studentId = Number(item['studentId'] ?? item['id'] ?? 0);
    const fullName = String(item['fullName'] ?? item['name'] ?? 'Student');
    const grade = String(item['grade'] ?? 'Grade 1');
    const className = String(item['className'] ?? 'A');
    const parentName = String(item['parentName'] ?? item['guardianName'] ?? 'Parent');
    const parentEmail = String(item['parentEmail'] ?? item['email'] ?? '');

    const matchedSub = this.subscriptionsSignal().find(
      (s) => s.studentName.toLowerCase() === fullName.toLowerCase()
    );

    const routeNumber = matchedSub ? matchedSub.routeNumber : String(item['routeNumber'] ?? 'R1');
    const routeName = matchedSub ? matchedSub.routeName : String(item['routeName'] ?? 'Abdoun Line');
    const stopName = matchedSub ? matchedSub.stopName : String(item['stopName'] ?? 'Abdoun Circle');
    const transportType = (matchedSub?.transportType ?? (item['transportType'] === 'OneWay' ? 'OneWay' : 'RoundTrip')) as 'OneWay' | 'RoundTrip';
    const status = (matchedSub
      ? (matchedSub.status === 'Approved' ? 'Active' : (matchedSub.status === 'Pending' || matchedSub.status === 'AwaitingPayment' ? 'Pending' : 'Inactive'))
      : (item['status'] as 'Active' | 'Pending' | 'Inactive') || 'Active') as 'Active' | 'Pending' | 'Inactive';

    return {
      studentId,
      fullName,
      parentName,
      parentEmail,
      grade,
      className,
      routeNumber,
      routeName,
      stopName,
      transportType,
      status,
    };
  }

  private mapRoute(item: Record<string, unknown>): AdminRouteItem {
    const routeId = Number(item['routeId'] ?? item['id'] ?? 0);
    const routeNumber = String(item['routeNumber'] ?? (routeId ? `R${routeId}` : 'R1'));
    const name = String(item['name'] ?? item['routeName'] ?? 'Route');
    const startPoint = String(item['startPoint'] ?? 'Amman');
    const destination = String(item['destination'] ?? 'Basi School');
    const serviceArea = String(item['serviceArea'] ?? 'Amman');
    const capacity = Number(item['capacity'] ?? 30);
    const enrolledStudents = Number(item['enrolledStudents'] ?? item['studentsCount'] ?? 0);

    let isActive = true;
    if (typeof item['isActive'] === 'boolean') {
      isActive = item['isActive'];
    } else if (typeof item['status'] === 'string') {
      isActive = (item['status'] as string).toLowerCase() === 'active';
    } else if (item['isActive'] !== undefined) {
      isActive = Boolean(item['isActive']);
    }

    let busPlate = '50 12345';
    if (typeof item['busPlate'] === 'string' && item['busPlate']) {
      busPlate = item['busPlate'];
    } else if (typeof item['plateNumber'] === 'string' && item['plateNumber']) {
      busPlate = item['plateNumber'];
    } else if (item['bus'] && typeof item['bus'] === 'object') {
      const busObj = item['bus'] as Record<string, unknown>;
      busPlate = String(busObj['plateNumber'] ?? busObj['busPlate'] ?? '50 12345');
    }

    let driverName = 'Assigned Driver';
    if (typeof item['driverName'] === 'string' && item['driverName']) {
      driverName = item['driverName'];
    } else if (typeof item['driver'] === 'string' && item['driver']) {
      driverName = item['driver'];
    } else if (item['driver'] && typeof item['driver'] === 'object') {
      const driverObj = item['driver'] as Record<string, unknown>;
      driverName = String(driverObj['fullName'] ?? driverObj['name'] ?? 'Assigned Driver');
    }

    return {
      routeId,
      routeNumber,
      name,
      startPoint,
      destination,
      serviceArea,
      capacity,
      enrolledStudents,
      isActive,
      busPlate,
      driverName,
    };
  }

  private mapSubscription(item: Record<string, unknown>): AdminSubscriptionItem {
    const subId = Number(item['subscriptionId'] ?? item['id'] ?? 0);
    const refNum = (item['referenceNumber'] as string) || (subId ? `SUB 2026 ${subId}` : 'SUB-PENDING');
    const student = (item['studentName'] as string) || (item['student'] ? String(item['student']) : 'Student');
    const parent = (item['parentName'] as string) || (item['parentEmail'] as string) || 'Parent';
    const routeNum = (item['routeNumber'] as string) || 'R1';
    const routeName = (item['routeName'] as string) || 'School Bus Route';
    const stop = (item['stopName'] as string) || 'Pickup Stop';
    const type = item['transportType'] === 'OneWay' ? 'OneWay' : 'RoundTrip';
    const fee = typeof item['fee'] === 'number' ? item['fee'] : (type === 'OneWay' ? 150 : 300);
    const status = (item['status'] as 'Pending' | 'AwaitingPayment' | 'Approved' | 'Rejected') || 'Pending';
    const requestedAt = (item['requestedAt'] as string) || (item['createdAt'] as string) || new Date().toISOString().split('T')[0];

    return {
      subscriptionId: subId,
      referenceNumber: refNum,
      studentName: student,
      parentName: parent,
      routeNumber: routeNum,
      routeName: routeName,
      stopName: stop,
      transportType: type,
      fee,
      status,
      requestedAt,
    };
  }

  public fetchPayments(): Observable<AdminPaymentItem[]> {
    return this.http.get<unknown[]>('/api/payments/admin').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        return items.map((item) => this.mapPayment(item as Record<string, unknown>));
      }),
      tap((backendPayments) => {
        const awaitingSubs = this.subscriptionsSignal().filter((s) => s.status === 'AwaitingPayment');
        const pendingPayments: AdminPaymentItem[] = awaitingSubs
          .filter(
            (sub) =>
              !backendPayments.some(
                (p) => p.subscriptionId === sub.subscriptionId || p.referenceNumber === sub.referenceNumber
              )
          )
          .map((sub) => ({
            paymentId: sub.subscriptionId + 100000,
            subscriptionId: sub.subscriptionId,
            referenceNumber: sub.referenceNumber,
            studentName: sub.studentName,
            parentName: sub.parentName,
            amountDue: sub.fee,
            amountPaid: 0,
            status: 'Unpaid' as const,
            paymentDate: sub.requestedAt,
            recordedBy: 'Pending Admin Settlement',
          }));

        const combined = [...backendPayments, ...pendingPayments];
        if (combined.length > 0) {
          this.paymentsSignal.set(combined);
          this.saveStorage(STORAGE_KEYS.PAYMENTS, combined);
        }
      }),
      catchError(() => of(this.paymentsSignal()))
    );
  }

  private mapPayment(item: Record<string, unknown>): AdminPaymentItem {
    const paymentId = Number(item['paymentId'] ?? item['id'] ?? Date.now());
    const subscriptionId = item['subscriptionId'] ? Number(item['subscriptionId']) : undefined;
    const refNum = String(item['referenceNumber'] ?? (subscriptionId ? `SUB 2026 ${subscriptionId}` : `PAY-${paymentId}`));
    const student = String(item['studentName'] ?? item['student'] ?? 'Student');
    const parent = String(item['parentName'] ?? item['parentEmail'] ?? 'Parent');
    const amountDue = typeof item['amountDue'] === 'number' ? item['amountDue'] : (typeof item['amount'] === 'number' ? item['amount'] : 300);
    const amountPaid = typeof item['amountPaid'] === 'number' ? item['amountPaid'] : (item['paymentStatus'] === 'Paid' || item['status'] === 'Paid' ? amountDue : 0);

    let rawStatus = String(item['paymentStatus'] ?? item['status'] ?? 'Unpaid');
    let status: 'Unpaid' | 'Partial' | 'Paid' = 'Unpaid';
    if (rawStatus === 'Paid' || amountPaid >= amountDue) {
      status = 'Paid';
    } else if (rawStatus === 'Partial' || amountPaid > 0) {
      status = 'Partial';
    }

    const paymentDate = String(item['paymentDate'] ?? item['createdAt'] ?? new Date().toISOString().split('T')[0]);
    const recordedBy = String(item['recordedBy'] ?? 'Admin Office');

    return {
      paymentId,
      subscriptionId,
      referenceNumber: refNum,
      studentName: student,
      parentName: parent,
      amountDue,
      amountPaid,
      status,
      paymentDate,
      recordedBy,
    };
  }

  public recordPayment(req: { subscriptionId: number; amount: number; notes?: string }): Observable<unknown> {
    this.updateSubscriptionStatus(req.subscriptionId, 'Approved');
    const targetSub = this.subscriptionsSignal().find((s) => s.subscriptionId === req.subscriptionId);
    const updatedPayments = this.paymentsSignal().map((p) => {
      if (
        p.subscriptionId === req.subscriptionId ||
        (targetSub && p.referenceNumber === targetSub.referenceNumber)
      ) {
        return {
          ...p,
          status: 'Paid' as const,
          amountPaid: req.amount,
          paymentDate: new Date().toISOString().split('T')[0],
          recordedBy: 'Admin Office',
        };
      }
      return p;
    });
    this.paymentsSignal.set(updatedPayments);
    this.saveStorage(STORAGE_KEYS.PAYMENTS, updatedPayments);

    return this.http.post('/api/payments/admin', req).pipe(catchError(() => of(null)));
  }

  public approveSubscription(subscriptionId: number): Observable<unknown> {
    // Preliminary approval moves status to AwaitingPayment
    this.updateSubscriptionStatus(subscriptionId, 'AwaitingPayment');

    return this.http
      .patch(`/api/subscriptions/admin/${subscriptionId}/approve`, {})
      .pipe(catchError(() => of(null)));
  }

  public rejectSubscription(subscriptionId: number): Observable<unknown> {
    const sub = this.subscriptionsSignal().find(s => s.subscriptionId === subscriptionId);
    if (!sub || sub.status === 'Pending') {
      this.updateSubscriptionStatus(subscriptionId, 'Rejected');

      return this.http
        .patch(`/api/subscriptions/admin/${subscriptionId}/reject`, {})
        .pipe(catchError(() => of(null)));
    }
    return of(null);
  }

  public updateSubscriptionStatus(
    subscriptionId: number,
    status: 'Pending' | 'AwaitingPayment' | 'Approved' | 'Rejected'
  ): void {
    const updated = this.subscriptionsSignal().map(s => s.subscriptionId === subscriptionId ? { ...s, status } : s);
    this.subscriptionsSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.SUBSCRIPTIONS, updated);
  }

  public updatePaymentStatus(paymentId: number, status: 'Unpaid' | 'Partial' | 'Paid', amountPaid?: number): void {
    let targetRef = '';
    let targetPaid = 0;
    const updated = this.paymentsSignal().map(p => {
      if (p.paymentId === paymentId) {
        targetRef = p.referenceNumber;
        const newPaid = amountPaid !== undefined ? amountPaid : (status === 'Paid' ? p.amountDue : (status === 'Unpaid' ? 0 : p.amountPaid));
        targetPaid = newPaid;
        return {
          ...p,
          status,
          amountPaid: newPaid,
          paymentDate: new Date().toISOString().split('T')[0],
          recordedBy: 'Admin Office',
        };
      }
      return p;
    });
    this.paymentsSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.PAYMENTS, updated);

    // Full payment confirmation automatically approves the subscription
    if (status === 'Paid' && targetRef) {
      const updatedSubs = this.subscriptionsSignal().map(s =>
        s.referenceNumber === targetRef ? { ...s, status: 'Approved' as const } : s
      );
      this.subscriptionsSignal.set(updatedSubs);
      this.saveStorage(STORAGE_KEYS.SUBSCRIPTIONS, updatedSubs);

      const sub = this.subscriptionsSignal().find(s => s.referenceNumber === targetRef);
      if (sub) {
        this.http
          .post('/api/payments/admin', {
            subscriptionId: sub.subscriptionId,
            amount: targetPaid || sub.fee,
            notes: 'Confirmed by School Administration',
          })
          .pipe(catchError(() => of(null)))
          .subscribe();
      }
    }
  }
}
