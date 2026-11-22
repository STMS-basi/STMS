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
});
