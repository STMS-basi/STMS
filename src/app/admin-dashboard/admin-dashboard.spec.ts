import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminDashboard } from './admin-dashboard';
import { AdminService } from '../services/admin.service';
import { PreferencesService } from '../services/preferences.service';

describe('AdminDashboard', () => {
  let component: AdminDashboard;
  let fixture: ComponentFixture<AdminDashboard>;
  let adminService: AdminService;

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
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the admin dashboard component', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('overview');
  });

  it('should switch tabs properly', () => {
    component.setTab('students');
    expect(component.activeTab()).toBe('students');

    component.setTab('buses');
    expect(component.activeTab()).toBe('buses');
  });

  it('should approve and reject subscription requests', () => {
    const sub = adminService.subscriptions().find(s => s.status === 'Pending')!;
    component.approveSubscription(sub.subscriptionId);
    let updated = adminService.subscriptions().find(s => s.subscriptionId === sub.subscriptionId);
    expect(updated?.status).toBe('AwaitingPayment');

    const anotherPending = adminService.subscriptions().find(s => s.status === 'Pending')!;
    component.rejectSubscription(anotherPending.subscriptionId);
    updated = adminService.subscriptions().find(s => s.subscriptionId === anotherPending.subscriptionId);
    expect(updated?.status).toBe('Rejected');
  });

  it('should toggle routes and buses', () => {
    const route = adminService.routes()[0];
    const initialRouteStatus = route.isActive;
    component.toggleRoute(route.routeId);
    expect(adminService.routes().find(r => r.routeId === route.routeId)?.isActive).toBe(!initialRouteStatus);

    const bus = adminService.buses()[0];
    const initialBusStatus = bus.isActive;
    component.toggleBus(bus.busId);
    expect(adminService.buses().find(b => b.busId === bus.busId)?.isActive).toBe(!initialBusStatus);
  });

  it('should confirm subscription payment via recordPayment', () => {
    const sub = adminService.subscriptions().find(s => s.status === 'AwaitingPayment')!;
    component.confirmSubscriptionPayment(sub);
    const updated = adminService.subscriptions().find(s => s.subscriptionId === sub.subscriptionId);
    expect(updated?.status).toBe('Approved');
  });

  it('should mark payment as paid', () => {
    const payment = adminService.payments().find(p => p.status === 'Unpaid')!;
    component.markPaymentPaid(payment.paymentId);
    const updated = adminService.payments().find(p => p.paymentId === payment.paymentId);
    expect(updated?.status).toBe('Paid');
  });

  it('should correctly evaluate payment eligibility based on subscription lifecycle', () => {
    // Find payment for AwaitingPayment sub (SUB 2026 19384)
    const awaitingPaymentItem = adminService.payments().find(p => p.referenceNumber === 'SUB 2026 19384')!;
    expect(component.isSubscriptionPending(awaitingPaymentItem)).toBe(false);
    expect(component.isPaymentEligible(awaitingPaymentItem)).toBe(true);

    // Find payment for Pending sub (SUB 2026 73819)
    const pendingPaymentItem = adminService.payments().find(p => p.referenceNumber === 'SUB 2026 73819')!;
    expect(component.isSubscriptionPending(pendingPaymentItem)).toBe(true);
    expect(component.isPaymentEligible(pendingPaymentItem)).toBe(false);

    // Find paid payment (SUB 2026 84920)
    const paidPaymentItem = adminService.payments().find(p => p.referenceNumber === 'SUB 2026 84920')!;
    expect(component.isPaymentEligible(paidPaymentItem)).toBe(false);
  });

  it('should toggle driver and delete stop', () => {
    const driver = adminService.drivers()[0];
    const initialDriverStatus = driver.isActive;
    component.toggleDriver(driver.driverId);
    expect(adminService.drivers().find(d => d.driverId === driver.driverId)?.isActive).toBe(!initialDriverStatus);

    const stop = adminService.stops()[0];
    const initialStopCount = adminService.stops().length;
    component.deleteStop(stop.stopId);
    expect(adminService.stops().length).toBe(initialStopCount - 1);
    expect(adminService.stops().some(s => s.stopId === stop.stopId)).toBe(false);
  });

  it('should add new bus, driver, and stop through forms', () => {
    component.busForm.setValue({
      plateNumber: '50 77777',
      capacity: 30,
      assignedRoute: 'R1 Abdoun Line',
    });
    component.submitNewBus();
    expect(adminService.buses().some(b => b.plateNumber === '50 77777')).toBe(true);
    expect(component.showAddBus()).toBe(false);

    component.driverForm.setValue({
      fullName: 'Driver Majed',
      phone: '0798881122',
      licenseNumber: 'LIC 999',
      assignedBus: '50 77777',
    });
    component.submitNewDriver();
    expect(adminService.drivers().some(d => d.fullName === 'Driver Majed')).toBe(true);
    expect(component.showAddDriver()).toBe(false);

    component.stopForm.setValue({
      routeId: 1,
      name: 'Zahran Street',
      stopOrder: 5,
      pickupTime: '7:20 AM',
      dropoffTime: '2:10 PM',
    });
    component.submitNewStop();
    expect(adminService.stops().some(s => s.name === 'Zahran Street')).toBe(true);
    expect(component.showAddStop()).toBe(false);
  });
});
