import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SubscriptionConfirmation } from './subscription-confirmation';
import { SubscriptionService } from '../services/subscription.service';

describe('SubscriptionConfirmation', () => {
  let subscriptionService: SubscriptionService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SubscriptionConfirmation],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        SubscriptionService,
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({
              get: (key: string) => (key === 'reference' ? 'SUB 2026 12345' : null),
            }),
          },
        },
      ],
    }).compileComponents();

    subscriptionService = TestBed.inject(SubscriptionService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the SubscriptionConfirmation component', () => {
    const fixture = TestBed.createComponent(SubscriptionConfirmation);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should display subscription details when reference matches', () => {
    subscriptionService.createSubscription({
      studentId: 1,
      studentName: 'Zaid Student',
      studentGrade: 'Grade 7',
      routeId: 1,
      routeNumber: 'R101',
      routeName: 'North Amman Route',
      stopId: 101,
      stopName: 'Abu Nseir Circle',
      pickupTime: '6:45 AM',
      dropoffTime: '2:45 PM',
      transportType: 'RoundTrip',
      fee: 300,
    });

    const created = subscriptionService.subscriptions()[0];
    const fixture = TestBed.createComponent(SubscriptionConfirmation);
    const component = fixture.componentInstance;
    component['refParam'].set(created.referenceNumber);

    expect(component.subscription()).toBeDefined();
    expect(component.subscription()?.studentName).toBe('Zaid Student');
    expect(component.subscription()?.fee).toBe(300);
    expect(component.subscription()?.status).toBe('Pending');
  });

  it('should trigger window.print when printReceipt is called', () => {
    const fixture = TestBed.createComponent(SubscriptionConfirmation);
    const component = fixture.componentInstance;
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    component['printReceipt']();

    expect(printSpy).toHaveBeenCalled();
  });
});

