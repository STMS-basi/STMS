import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BackendPaymentItem, PaymentService } from './payment.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let httpTesting: HttpTestingController;

  const mockPayments: BackendPaymentItem[] = [
    {
      paymentId: 45,
      subscriptionId: 101,
      referenceNumber: 'SUB 2026 84920',
      studentName: 'Yousef Al Basi',
      amountDue: 300,
      amountPaid: 300,
      remainingAmount: 0,
      paymentStatus: 'Paid',
      paymentDate: '2026-11-20',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [PaymentService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PaymentService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch my payments from GET /api/payments/my and update signal', () => {
    service.fetchMyPayments().subscribe((res) => {
      expect(res.length).toBe(1);
      expect(res[0].paymentId).toBe(45);
    });

    const req = httpTesting.expectOne('/api/payments/my');
    expect(req.request.method).toBe('GET');
    req.flush(mockPayments);

    expect(service.payments().length).toBe(1);
    expect(service.payments()[0].paymentStatus).toBe('Paid');
  });

  it('should fetch admin payments from GET /api/payments/admin', () => {
    service.fetchAdminPayments().subscribe((res) => {
      expect(res.length).toBe(1);
    });

    const req = httpTesting.expectOne('/api/payments/admin');
    expect(req.request.method).toBe('GET');
    req.flush(mockPayments);

    expect(service.payments().length).toBe(1);
  });

  it('should post payment record to /api/payments/admin', () => {
    const payload = { subscriptionId: 101, amount: 300, notes: 'Full payment' };

    service.recordPayment(payload).subscribe();

    const req = httpTesting.expectOne('/api/payments/admin');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true });
  });

  it('should gracefully handle HTTP error on fetchMyPayments and return signal', () => {
    service.fetchMyPayments().subscribe((res) => {
      expect(Array.isArray(res)).toBe(true);
    });

    const req = httpTesting.expectOne('/api/payments/my');
    req.error(new ProgressEvent('Network error'));
  });
});
