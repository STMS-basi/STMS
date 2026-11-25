import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminDashboard } from './admin-dashboard';
import { AdminService } from '../services/admin.service';
import { PreferencesService } from '../services/preferences.service';

describe('AdminDashboard', () => {
  let component: AdminDashboard;
  let fixture: ComponentFixture<AdminDashboard>;
  let adminService: AdminService;
  let httpTesting: HttpTestingController;

  const flushInitialLoads = () => {
    httpTesting.match('/api/students/admin').forEach((r) =>
      r.flush([
        { studentId: 101, fullName: 'Yousef', parentName: 'Ahmad', grade: 'Grade 5', className: '5A' },
      ])
    );
    httpTesting.match('/api/parents/admin').forEach((r) =>
      r.flush([
        { parentId: 1, fullName: 'Ahmad', email: 'ahmad@test.com', phone: '0791234567', studentCount: 1 },
      ])
    );
    httpTesting.match('/api/routes/admin').forEach((r) =>
      r.flush([
        { routeId: 1, routeNumber: 'R1', name: 'Abdoun', capacity: 30, enrolledStudents: 5, isActive: true, busId: 1, driverId: 1 },
      ])
    );
    httpTesting.match('/api/stops/admin').forEach((r) =>
      r.flush([
        { stopId: 101, routeId: 1, name: 'Abdoun Circle', stopOrder: 1 },
      ])
    );
    httpTesting.match('/api/buses/admin').forEach((r) =>
      r.flush([
        { busId: 1, plateNumber: '50-12345', capacity: 30, isActive: true },
      ])
    );
    httpTesting.match('/api/drivers/admin').forEach((r) =>
      r.flush([
        { driverId: 1, fullName: 'Abu Tariq', phone: '0795551122', licenseNumber: 'LIC-1', isActive: true },
      ])
    );
    httpTesting.match('/api/subscriptions/admin').forEach((r) =>
      r.flush([
        { subscriptionId: 1001, referenceNumber: 'SUB-1001', studentName: 'Yousef', parentName: 'Ahmad', routeNumber: 'R1', routeName: 'Abdoun', stopName: 'Abdoun Circle', transportType: 'RoundTrip', fee: 300, status: 'Approved' },
        { subscriptionId: 1003, referenceNumber: 'SUB-1003', studentName: 'Kareem', parentName: 'Faris', routeNumber: 'R1', routeName: 'Abdoun', stopName: 'Abdoun Circle', transportType: 'RoundTrip', fee: 300, status: 'AwaitingPayment' },
        { subscriptionId: 1004, referenceNumber: 'SUB-1004', studentName: 'Salma', parentName: 'Zaid', routeNumber: 'R1', routeName: 'Abdoun', stopName: 'Abdoun Circle', transportType: 'OneWay', fee: 150, status: 'Pending' },
      ])
    );
    httpTesting.match('/api/payments/admin').forEach((r) =>
      r.flush([
        { paymentId: 501, subscriptionId: 1001, referenceNumber: 'SUB-1001', studentName: 'Yousef', parentName: 'Ahmad', amountDue: 300, amountPaid: 300, paymentStatus: 'Paid' },
        { paymentId: 503, subscriptionId: 1003, referenceNumber: 'SUB-1003', studentName: 'Kareem', parentName: 'Faris', amountDue: 300, amountPaid: 0, paymentStatus: 'Unpaid' },
        { paymentId: 504, subscriptionId: 1004, referenceNumber: 'SUB-1004', studentName: 'Salma', parentName: 'Zaid', amountDue: 150, amountPaid: 0, paymentStatus: 'Unpaid' },
      ])
    );
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminDashboard],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        AdminService,
        PreferencesService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboard);
    component = fixture.componentInstance;
    adminService = TestBed.inject(AdminService);
    httpTesting = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushInitialLoads();
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should create the admin dashboard component', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('overview');
  });

  it('should switch tabs and call matching GET endpoints', () => {
    component.setTab('students');
    expect(component.activeTab()).toBe('students');
    httpTesting.expectOne('/api/students/admin').flush([]);

    component.setTab('buses');
    expect(component.activeTab()).toBe('buses');
    httpTesting.expectOne('/api/buses/admin').flush([]);
  });

  it('should approve and reject subscriptions only after backend succeeds', () => {
    component.approveSubscription(1004);
    expect(adminService.subscriptions().find((s) => s.subscriptionId === 1004)?.status).toBe('Pending');

    const approveReq = httpTesting.expectOne('/api/subscriptions/admin/1004/approve');
    expect(approveReq.request.method).toBe('PATCH');
    approveReq.flush({});

    // Refreshes after success
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 1004, referenceNumber: 'SUB-1004', studentName: 'Salma', parentName: 'Zaid', status: 'AwaitingPayment', fee: 150 },
    ]);
    httpTesting.expectOne('/api/payments/admin').flush([]);
    expect(adminService.subscriptions().find((s) => s.subscriptionId === 1004)?.status).toBe('AwaitingPayment');
  });

  it('should show error and preserve status if approve fails on backend', () => {
    component.approveSubscription(1004);
    const approveReq = httpTesting.expectOne('/api/subscriptions/admin/1004/approve');
    approveReq.flush({ message: 'Forbidden action' }, { status: 403, statusText: 'Forbidden' });

    expect(component.actionError()).toBe('Forbidden action');
    expect(adminService.subscriptions().find((s) => s.subscriptionId === 1004)?.status).toBe('Pending');
  });

  it('should toggle routes and buses after PATCH succeeds', () => {
    component.toggleRoute(1);
    expect(adminService.routes()[0].isActive).toBe(true);
    httpTesting.expectOne('/api/routes/admin/1/deactivate').flush({});
    httpTesting.expectOne('/api/routes/admin').flush([
      { routeId: 1, routeNumber: 'R1', name: 'Abdoun', capacity: 30, enrolledStudents: 5, isActive: false },
    ]);
    expect(adminService.routes()[0].isActive).toBe(false);

    component.toggleBus(1);
    expect(adminService.buses()[0].isActive).toBe(true);
    httpTesting.expectOne('/api/buses/admin/1/deactivate').flush({});
    httpTesting.expectOne('/api/buses/admin').flush([
      { busId: 1, plateNumber: '50-12345', capacity: 30, isActive: false },
    ]);
    expect(adminService.buses()[0].isActive).toBe(false);
  });

  it('should mark eligible payment as paid only after POST /api/payments/admin succeeds', () => {
    component.markPaymentPaid(503);
    expect(adminService.payments().find((p) => p.paymentId === 503)?.status).toBe('Unpaid');

    const postReq = httpTesting.expectOne('/api/payments/admin');
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({
      subscriptionId: 1003,
      amount: 300,
      notes: 'Full payment confirmed by admin',
    });
    postReq.flush({ success: true });

    httpTesting.expectOne('/api/payments/admin').flush([
      { paymentId: 503, subscriptionId: 1003, referenceNumber: 'SUB-1003', studentName: 'Kareem', parentName: 'Faris', amountDue: 300, amountPaid: 300, paymentStatus: 'Paid' },
    ]);
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 1003, referenceNumber: 'SUB-1003', studentName: 'Kareem', parentName: 'Faris', status: 'Approved', fee: 300 },
    ]);

    expect(adminService.payments().find((p) => p.paymentId === 503)?.status).toBe('Paid');
  });

  it('should prevent Mark as Paid on Pending subscriptions', () => {
    const awaitingItem = adminService.payments().find((p) => p.referenceNumber === 'SUB-1003')!;
    expect(component.isSubscriptionPending(awaitingItem)).toBe(false);
    expect(component.isPaymentEligible(awaitingItem)).toBe(true);

    const pendingItem = adminService.payments().find((p) => p.referenceNumber === 'SUB-1004')!;
    expect(component.isSubscriptionPending(pendingItem)).toBe(true);
    expect(component.isPaymentEligible(pendingItem)).toBe(false);

    component.markPaymentPaid(504);
    httpTesting.expectNone('/api/payments/admin');
    expect(component.actionError()).toBeTruthy();
  });

  it('should toggle driver and delete stop after backend response', () => {
    component.toggleDriver(1);
    httpTesting.expectOne('/api/drivers/admin/1/deactivate').flush({});
    httpTesting.expectOne('/api/drivers/admin').flush([
      { driverId: 1, fullName: 'Abu Tariq', phone: '0795551122', licenseNumber: 'LIC-1', isActive: false },
    ]);
    expect(adminService.drivers()[0].isActive).toBe(false);

    component.deleteStop(101);
    httpTesting.expectOne('/api/stops/admin/101').flush({});
    httpTesting.expectOne('/api/stops/admin').flush([]);
    expect(adminService.stops().length).toBe(0);
  });

  it('should add new bus, driver, and stop and close form only on backend success', () => {
    component.showAddBus.set(true);
    component.busForm.setValue({ plateNumber: '50-77777', capacity: 30, assignedRoute: 'R1' });
    component.submitNewBus();
    expect(component.showAddBus()).toBe(true);

    httpTesting.expectOne('/api/buses/admin').flush({ busId: 99 });
    httpTesting.expectOne('/api/buses/admin').flush([{ busId: 99, plateNumber: '50-77777', capacity: 30 }]);
    expect(adminService.buses().some((b) => b.plateNumber === '50-77777')).toBe(true);
    expect(component.showAddBus()).toBe(false);

    component.showAddDriver.set(true);
    component.driverForm.setValue({ fullName: 'Driver Majed', phone: '0798881122', licenseNumber: 'LIC-999', assignedBus: '50-77777' });
    component.submitNewDriver();
    expect(component.showAddDriver()).toBe(true);

    httpTesting.expectOne('/api/drivers/admin').flush({ driverId: 88 });
    httpTesting.expectOne('/api/drivers/admin').flush([{ driverId: 88, fullName: 'Driver Majed', phone: '0798881122', licenseNumber: 'LIC-999' }]);
    expect(adminService.drivers().some((d) => d.fullName === 'Driver Majed')).toBe(true);
    expect(component.showAddDriver()).toBe(false);

    component.showAddStop.set(true);
    component.stopForm.setValue({ routeId: 1, name: 'Zahran Street', stopOrder: 5, pickupTime: '07:20', dropoffTime: '14:10' });
    component.submitNewStop();
    expect(component.showAddStop()).toBe(true);

    httpTesting.expectOne('/api/stops/admin').flush({ stopId: 77 });
    httpTesting.expectOne('/api/stops/admin').flush([{ stopId: 77, routeId: 1, name: 'Zahran Street', stopOrder: 5 }]);
    expect(adminService.stops().some((s) => s.name === 'Zahran Street')).toBe(true);
    expect(component.showAddStop()).toBe(false);
  });
});
