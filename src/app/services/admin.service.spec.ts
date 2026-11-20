import { TestBed } from '@angular/core/testing';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AdminService],
    });
    service = TestBed.inject(AdminService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created and load initial entities', () => {
    expect(service).toBeTruthy();
    expect(service.routes().length).toBeGreaterThan(0);
    expect(service.buses().length).toBeGreaterThan(0);
    expect(service.drivers().length).toBeGreaterThan(0);
    expect(service.students().length).toBeGreaterThan(0);
    expect(service.subscriptions().length).toBeGreaterThan(0);
  });

  it('should allow approving and rejecting subscriptions', () => {
    const sub = service.subscriptions()[0];
    service.approveSubscription(sub.subscriptionId);
    let updated = service.subscriptions().find(s => s.subscriptionId === sub.subscriptionId);
    expect(updated?.status).toBe('Approved');

    service.rejectSubscription(sub.subscriptionId);
    updated = service.subscriptions().find(s => s.subscriptionId === sub.subscriptionId);
    expect(updated?.status).toBe('Rejected');
  });

  it('should toggle route and bus active status', () => {
    const route = service.routes()[0];
    const initialRouteStatus = route.isActive;
    service.toggleRouteActive(route.routeId);
    expect(service.routes().find(r => r.routeId === route.routeId)?.isActive).toBe(!initialRouteStatus);

    const bus = service.buses()[0];
    const initialBusStatus = bus.isActive;
    service.toggleBusActive(bus.busId);
    expect(service.buses().find(b => b.busId === bus.busId)?.isActive).toBe(!initialBusStatus);
  });

  it('should update payment status', () => {
    const payment = service.payments()[0];
    service.updatePaymentStatus(payment.paymentId, 'Paid');
    const updated = service.payments().find(p => p.paymentId === payment.paymentId);
    expect(updated?.status).toBe('Paid');
    expect(updated?.amountPaid).toBe(payment.amountDue);
  });
});
