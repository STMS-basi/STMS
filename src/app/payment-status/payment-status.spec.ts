import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PaymentStatus } from './payment-status';

describe('PaymentStatus', () => {
  let component: PaymentStatus;
  let fixture: ComponentFixture<PaymentStatus>;
  let httpTesting: HttpTestingController;
  let authService: AuthService;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PaymentStatus],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(PaymentStatus);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.match(() => true).forEach((req) => req.flush([]));
    httpTesting.verify();
    localStorage.clear();
  });

  it('should create the component', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should compute totals cleanly without NaN', () => {
    fixture.detectChanges();
    expect(typeof component.totalDue()).toBe('number');
    expect(isNaN(component.totalDue())).toBe(false);
    expect(typeof component.totalPaid()).toBe('number');
    expect(isNaN(component.totalPaid())).toBe(false);
    expect(typeof component.totalOutstanding()).toBe('number');
    expect(isNaN(component.totalOutstanding())).toBe(false);
  });

  it('should exclude Pending Approval fees from payable totals and resolve real route numbers', () => {
    authService.setSession({
      token: 'jwt',
      role: 'Parent',
      fullName: 'Parent A',
      email: 'parent-a@example.com',
    });

    fixture.detectChanges();

    httpTesting.expectOne('/api/routes').flush([
      {
        routeId: 2,
        routeNumber: 'R2',
        name: 'Jubeiha Route',
        startPoint: 'Jubeiha',
        destination: 'School',
        serviceArea: 'North Amman',
        capacity: 30,
        enrolledStudents: 5,
        isActive: true,
        stops: [],
      },
    ]);

    httpTesting.expectOne('/api/subscriptions').flush([
      {
        subscriptionId: 10,
        referenceNumber: 'SUB-PAID-10',
        studentId: 1,
        studentName: 'Layan',
        studentGrade: 'Grade 4',
        routeId: 2,
        routeNumber: '',
        routeName: '- Jubeiha Route',
        stopId: 5,
        stopName: 'Jubeiha Circle',
        transportType: 'RoundTrip',
        fee: 300,
        status: 'Approved',
        startDate: '2026-09-01',
        endDate: '2026-12-31',
      },
      {
        subscriptionId: 11,
        referenceNumber: 'SUB-PENDING-11',
        studentId: 2,
        studentName: 'Omar',
        studentGrade: 'Grade 2',
        routeId: 2,
        routeNumber: 'R2',
        routeName: 'Jubeiha Route',
        stopId: 5,
        stopName: 'Jubeiha Circle',
        transportType: 'OneWay',
        fee: 150,
        status: 'Pending',
        startDate: '2026-09-01',
        endDate: '2026-12-31',
      },
    ]);

    httpTesting.expectOne('/api/payments/my').flush([
      {
        paymentId: 55,
        subscriptionId: 10,
        referenceNumber: 'SUB-PAID-10',
        studentName: 'Layan',
        amountDue: 300,
        amountPaid: 300,
        remainingAmount: 0,
        paymentStatus: 'Paid',
        paymentDate: '2026-08-25',
      },
    ]);

    fixture.detectChanges();

    // Only the payable Approved/Paid subscription contributes to due/paid; Pending Approval adds 0 payable debt
    expect(component.totalDue()).toBe(300);
    expect(component.totalPaid()).toBe(300);
    expect(component.totalOutstanding()).toBe(0);

    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('R2 - Jubeiha Route');
    expect(html).not.toContain('Outstanding Balance: 150');

    // View Details should open the modal in-place and never navigate to /subscription
    const navSpy = vi.spyOn(router, 'navigate');
    const viewButtons = fixture.nativeElement.querySelectorAll('.view-details-btn') as NodeListOf<HTMLButtonElement>;
    expect(viewButtons.length).toBe(2);
    viewButtons[0].click();
    fixture.detectChanges();

    expect(navSpy).not.toHaveBeenCalled();
    const modal = fixture.nativeElement.querySelector('.payment-modal') as HTMLElement;
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('SUB-PAID-10');
    expect(modal.textContent).toContain('R2 - Jubeiha Route');
  });
});
