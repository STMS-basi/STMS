import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MyTransportation } from './my-transportation';
import { AuthService } from '../services/auth.service';
import { PreferencesService } from '../services/preferences.service';
import { SubscriptionItem, SubscriptionService } from '../services/subscription.service';

describe('MyTransportation', () => {
  let component: MyTransportation;
  let subscriptionService: SubscriptionService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [MyTransportation],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
        PreferencesService,
        SubscriptionService,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MyTransportation);
    component = fixture.componentInstance;
    subscriptionService = TestBed.inject(SubscriptionService);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should format route name cleanly without leading dash', () => {
    const itemWithoutNum: SubscriptionItem = {
      subscriptionId: 1,
      referenceNumber: 'SUB-123',
      studentId: 10,
      studentName: 'Student One',
      studentGrade: 'Grade 5',
      routeId: 2,
      routeNumber: '',
      routeName: '- Active Driver and Bus Test',
      stopId: 20,
      stopName: 'Stop A',
      pickupTime: '07:30',
      dropoffTime: '14:30',
      transportType: 'RoundTrip',
      fee: 300,
      status: 'Approved',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      requestedAt: '2026-08-20',
    };

    expect(component.formatRoute(itemWithoutNum)).toBe('Active Driver and Bus Test');

    const itemWithNum: SubscriptionItem = {
      ...itemWithoutNum,
      routeNumber: 'R1',
      routeName: 'Abdoun Line',
    };

    expect(component.formatRoute(itemWithNum)).toBe('R1 - Abdoun Line');
  });

  it('should identify whether pickup and dropoff times are valid', () => {
    expect(component.hasTime('07:30')).toBe(true);
    expect(component.hasTime('')).toBe(false);
    expect(component.hasTime(null)).toBe(false);
    expect(component.hasTime('—')).toBe(false);
    expect(component.hasTime('   ')).toBe(false);
  });
});
