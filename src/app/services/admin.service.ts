import { Injectable, computed, signal } from '@angular/core';

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
    routeNumber: 'R101',
    name: 'North Amman Route',
    startPoint: 'Abu Nseir',
    destination: 'Basi School',
    serviceArea: 'North Amman',
    capacity: 30,
    enrolledStudents: 22,
    isActive: true,
    busPlate: '50 12345',
    driverName: 'Driver Abu Tariq',
  },
  {
    routeId: 2,
    routeNumber: 'R102',
    name: 'West Amman Route',
    startPoint: 'Khalda',
    destination: 'Basi School',
    serviceArea: 'West Amman',
    capacity: 30,
    enrolledStudents: 26,
    isActive: true,
    busPlate: '50 23456',
    driverName: 'Driver Omar',
  },
  {
    routeId: 3,
    routeNumber: 'R103',
    name: 'Downtown Route',
    startPoint: 'Ras Al Ain',
    destination: 'Basi School',
    serviceArea: 'Downtown',
    capacity: 30,
    enrolledStudents: 24,
    isActive: true,
    busPlate: '50 34567',
    driverName: 'Driver Mustafa',
  },
  {
    routeId: 4,
    routeNumber: 'R104',
    name: 'East Amman Route',
    startPoint: 'Marka',
    destination: 'Basi School',
    serviceArea: 'East Amman',
    capacity: 30,
    enrolledStudents: 20,
    isActive: true,
    busPlate: '50 45678',
    driverName: 'Driver Mahmoud',
  },
];

const INITIAL_STOPS: AdminStopItem[] = [
  { stopId: 101, routeId: 1, routeNumber: 'R101', name: 'Abu Nseir Circle', stopOrder: 1, pickupTime: '6:45 AM', dropoffTime: '2:45 PM' },
  { stopId: 102, routeId: 1, routeNumber: 'R101', name: 'Shafa Badran', stopOrder: 2, pickupTime: '7:00 AM', dropoffTime: '2:30 PM' },
  { stopId: 103, routeId: 1, routeNumber: 'R101', name: 'University Street', stopOrder: 3, pickupTime: '7:15 AM', dropoffTime: '2:15 PM' },
  { stopId: 104, routeId: 1, routeNumber: 'R101', name: 'Basi School Main Gate', stopOrder: 4, pickupTime: '7:30 AM', dropoffTime: '2:00 PM' },
  { stopId: 201, routeId: 2, routeNumber: 'R102', name: 'Khalda Circle', stopOrder: 1, pickupTime: '6:50 AM', dropoffTime: '2:40 PM' },
  { stopId: 202, routeId: 2, routeNumber: 'R102', name: 'Tla Al Ali', stopOrder: 2, pickupTime: '7:00 AM', dropoffTime: '2:30 PM' },
  { stopId: 203, routeId: 2, routeNumber: 'R102', name: 'Dabouq Intersection', stopOrder: 3, pickupTime: '7:12 AM', dropoffTime: '2:18 PM' },
];

const INITIAL_BUSES: AdminBusItem[] = [
  { busId: 1, plateNumber: '50 12345', capacity: 30, assignedRoute: 'R101 North Amman', isActive: true },
  { busId: 2, plateNumber: '50 23456', capacity: 30, assignedRoute: 'R102 West Amman', isActive: true },
  { busId: 3, plateNumber: '50 34567', capacity: 30, assignedRoute: 'R103 Downtown', isActive: true },
  { busId: 4, plateNumber: '50 45678', capacity: 30, assignedRoute: 'R104 East Amman', isActive: true },
  { busId: 5, plateNumber: '50 56789', capacity: 30, assignedRoute: 'Standby Backup Bus', isActive: true },
  { busId: 6, plateNumber: '50 67890', capacity: 25, assignedRoute: 'Maintenance Reserve', isActive: false },
];

const INITIAL_DRIVERS: AdminDriverItem[] = [
  { driverId: 1, fullName: 'Driver Abu Tariq', phone: '0795551122', licenseNumber: 'LIC 2020 901', assignedBus: '50 12345 (R101)', isActive: true },
  { driverId: 2, fullName: 'Driver Omar', phone: '0795552233', licenseNumber: 'LIC 2019 443', assignedBus: '50 23456 (R102)', isActive: true },
  { driverId: 3, fullName: 'Driver Mustafa', phone: '0795553344', licenseNumber: 'LIC 2021 782', assignedBus: '50 34567 (R103)', isActive: true },
  { driverId: 4, fullName: 'Driver Mahmoud', phone: '0795554455', licenseNumber: 'LIC 2018 619', assignedBus: '50 45678 (R104)', isActive: true },
  { driverId: 5, fullName: 'Driver Khaled', phone: '0795556677', licenseNumber: 'LIC 2022 108', assignedBus: 'Standby Reserve', isActive: true },
];

const INITIAL_PARENTS: AdminParentItem[] = [
  { parentId: 1, fullName: 'Ahmad Guardian', email: 'parent@stms.edu', phone: '0791234567', address: 'Amman, Abu Nseir', studentsCount: 2 },
  { parentId: 2, fullName: 'Faris Al Basi', email: 'faris@example.com', phone: '0792345678', address: 'Amman, Khalda', studentsCount: 1 },
  { parentId: 3, fullName: 'Zaid Guardian', email: 'zaid@example.com', phone: '0793456789', address: 'Amman, Shafa Badran', studentsCount: 1 },
  { parentId: 4, fullName: 'Samer Guardian', email: 'samer@example.com', phone: '0794567890', address: 'Amman, University Street', studentsCount: 2 },
];

const INITIAL_STUDENTS: AdminStudentItem[] = [
  { studentId: 101, fullName: 'Yousef Al Basi', parentName: 'Ahmad Guardian', parentEmail: 'parent@stms.edu', grade: 'Grade 5', className: '5A', routeNumber: 'R101', routeName: 'North Amman Route', stopName: 'Abu Nseir Circle', transportType: 'RoundTrip', status: 'Active' },
  { studentId: 102, fullName: 'Layan Al Basi', parentName: 'Ahmad Guardian', parentEmail: 'parent@stms.edu', grade: 'Grade 2', className: '2B', routeNumber: 'R101', routeName: 'North Amman Route', stopName: 'Abu Nseir Circle', transportType: 'RoundTrip', status: 'Active' },
  { studentId: 103, fullName: 'Kareem Faris', parentName: 'Faris Al Basi', parentEmail: 'faris@example.com', grade: 'Grade 4', className: '4A', routeNumber: 'R102', routeName: 'West Amman Route', stopName: 'Khalda Circle', transportType: 'RoundTrip', status: 'Active' },
  { studentId: 104, fullName: 'Salma Zaid', parentName: 'Zaid Guardian', parentEmail: 'zaid@example.com', grade: 'Grade 3', className: '3C', routeNumber: 'R101', routeName: 'North Amman Route', stopName: 'Shafa Badran', transportType: 'OneWay', status: 'Pending' },
  { studentId: 105, fullName: 'Hamza Samer', parentName: 'Samer Guardian', parentEmail: 'samer@example.com', grade: 'Grade 6', className: '6B', routeNumber: 'R103', routeName: 'Downtown Route', stopName: 'Ras Al Ain', transportType: 'RoundTrip', status: 'Active' },
];

const INITIAL_SUBSCRIPTIONS: AdminSubscriptionItem[] = [
  { subscriptionId: 1001, referenceNumber: 'SUB 2026 84920', studentName: 'Yousef Al Basi', parentName: 'Ahmad Guardian', routeNumber: 'R101', routeName: 'North Amman Route', stopName: 'Abu Nseir Circle', transportType: 'RoundTrip', fee: 300, status: 'Approved', requestedAt: '2026-11-18' },
  { subscriptionId: 1002, referenceNumber: 'SUB 2026 51293', studentName: 'Layan Al Basi', parentName: 'Ahmad Guardian', routeNumber: 'R101', routeName: 'North Amman Route', stopName: 'Abu Nseir Circle', transportType: 'RoundTrip', fee: 300, status: 'Approved', requestedAt: '2026-11-18' },
  { subscriptionId: 1003, referenceNumber: 'SUB 2026 19384', studentName: 'Kareem Faris', parentName: 'Faris Al Basi', routeNumber: 'R102', routeName: 'West Amman Route', stopName: 'Khalda Circle', transportType: 'RoundTrip', fee: 300, status: 'AwaitingPayment', requestedAt: '2026-11-17' },
  { subscriptionId: 1004, referenceNumber: 'SUB 2026 73819', studentName: 'Salma Zaid', parentName: 'Zaid Guardian', routeNumber: 'R101', routeName: 'North Amman Route', stopName: 'Shafa Badran', transportType: 'OneWay', fee: 150, status: 'Pending', requestedAt: '2026-11-19' },
  { subscriptionId: 1005, referenceNumber: 'SUB 2026 40291', studentName: 'Hamza Samer', parentName: 'Samer Guardian', routeNumber: 'R103', routeName: 'Downtown Route', stopName: 'Ras Al Ain', transportType: 'RoundTrip', fee: 300, status: 'Pending', requestedAt: '2026-11-19' },
  { subscriptionId: 1006, referenceNumber: 'SUB 2026 62910', studentName: 'Maya Ahmad', parentName: 'Samer Guardian', routeNumber: 'R104', routeName: 'East Amman Route', stopName: 'Marka Center', transportType: 'RoundTrip', fee: 300, status: 'Rejected', requestedAt: '2026-11-15' },
];

const INITIAL_PAYMENTS: AdminPaymentItem[] = [
  { paymentId: 501, referenceNumber: 'SUB 2026 84920', studentName: 'Yousef Al Basi', parentName: 'Ahmad Guardian', amountDue: 300, amountPaid: 300, status: 'Paid', paymentDate: '2026-11-18', recordedBy: 'Admin Office' },
  { paymentId: 502, referenceNumber: 'SUB 2026 51293', studentName: 'Layan Al Basi', parentName: 'Ahmad Guardian', amountDue: 300, amountPaid: 300, status: 'Paid', paymentDate: '2026-11-18', recordedBy: 'Admin Office' },
  { paymentId: 503, referenceNumber: 'SUB 2026 19384', studentName: 'Kareem Faris', parentName: 'Faris Al Basi', amountDue: 300, amountPaid: 0, status: 'Unpaid', paymentDate: '2026-11-17', recordedBy: 'Finance Desk' },
  { paymentId: 504, referenceNumber: 'SUB 2026 73819', studentName: 'Salma Zaid', parentName: 'Zaid Guardian', amountDue: 150, amountPaid: 0, status: 'Unpaid', paymentDate: '2026-11-19', recordedBy: 'Pending Payment' },
  { paymentId: 505, referenceNumber: 'SUB 2026 40291', studentName: 'Hamza Samer', parentName: 'Samer Guardian', amountDue: 300, amountPaid: 0, status: 'Unpaid', paymentDate: '2026-11-19', recordedBy: 'Pending Payment' },
];

@Injectable({
  providedIn: 'root',
})
export class AdminService {
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

  public addRoute(newRoute: Omit<AdminRouteItem, 'routeId'>): void {
    const routeId = Date.now();
    const item: AdminRouteItem = { ...newRoute, routeId };
    const updated = [...this.routesSignal(), item];
    this.routesSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.ROUTES, updated);
  }

  public toggleRouteActive(routeId: number): void {
    const updated = this.routesSignal().map(r => r.routeId === routeId ? { ...r, isActive: !r.isActive } : r);
    this.routesSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.ROUTES, updated);
  }

  public addStop(newStop: Omit<AdminStopItem, 'stopId'>): void {
    const stopId = Date.now();
    const item: AdminStopItem = { ...newStop, stopId };
    const updated = [...this.stopsSignal(), item];
    this.stopsSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.STOPS, updated);
  }

  public deleteStop(stopId: number): void {
    const updated = this.stopsSignal().filter(s => s.stopId !== stopId);
    this.stopsSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.STOPS, updated);
  }

  public addBus(newBus: Omit<AdminBusItem, 'busId'>): void {
    const busId = Date.now();
    const item: AdminBusItem = { ...newBus, busId };
    const updated = [...this.busesSignal(), item];
    this.busesSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.BUSES, updated);
  }

  public toggleBusActive(busId: number): void {
    const updated = this.busesSignal().map(b => b.busId === busId ? { ...b, isActive: !b.isActive } : b);
    this.busesSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.BUSES, updated);
  }

  public addDriver(newDriver: Omit<AdminDriverItem, 'driverId'>): void {
    const driverId = Date.now();
    const item: AdminDriverItem = { ...newDriver, driverId };
    const updated = [...this.driversSignal(), item];
    this.driversSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.DRIVERS, updated);
  }

  public toggleDriverActive(driverId: number): void {
    const updated = this.driversSignal().map(d => d.driverId === driverId ? { ...d, isActive: !d.isActive } : d);
    this.driversSignal.set(updated);
    this.saveStorage(STORAGE_KEYS.DRIVERS, updated);
  }

  public approveSubscription(subscriptionId: number): void {
    // Preliminary approval moves status to AwaitingPayment
    this.updateSubscriptionStatus(subscriptionId, 'AwaitingPayment');
  }

  public rejectSubscription(subscriptionId: number): void {
    const sub = this.subscriptionsSignal().find(s => s.subscriptionId === subscriptionId);
    if (!sub || sub.status === 'Pending') {
      this.updateSubscriptionStatus(subscriptionId, 'Rejected');
    }
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
    const updated = this.paymentsSignal().map(p => {
      if (p.paymentId === paymentId) {
        targetRef = p.referenceNumber;
        const newPaid = amountPaid !== undefined ? amountPaid : (status === 'Paid' ? p.amountDue : (status === 'Unpaid' ? 0 : p.amountPaid));
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
    }
  }
}
