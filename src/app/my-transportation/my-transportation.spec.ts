import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MyTransportation } from './my-transportation';
import { AuthService } from '../services/auth.service';
import { PreferencesService } from '../services/preferences.service';
import { SubscriptionItem, SubscriptionService } from '../services/subscription.service';

describe('MyTransportation', () => {
  let component: MyTransportation;
  let subscriptionService: SubscriptionService;
  let authService: AuthService;
  let httpTesting: HttpTestingController;
  let fixture: ReturnType<typeof TestBed.createComponent<MyTransportation>>;

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

    fixture = TestBed.createComponent(MyTransportation);
    component = fixture.componentInstance;
    subscriptionService = TestBed.inject(SubscriptionService);
    authService = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
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

  it('should display assigned bus and driver from live route details instead of Not assigned yet', () => {
    authService.setSession({
      token: 'jwt',
      role: 'Parent',
      fullName: 'Parent Test',
      email: 'parent@example.com',
    });

    httpTesting.expectOne('/api/routes').flush([
      {
        routeId: 45,
        routeNumber: 'R26',
        name: 'Active Driver and Bus Test',
        startPoint: 'Origin',
        destination: 'School',
        serviceArea: 'West Amman',
        capacity: 30,
        enrolledStudents: 2,
        isActive: true,
        busId: 21,
        driverId: 3,
        stops: [],
      },
    ]);

    httpTesting.expectOne('/api/subscriptions').flush([
      {
        subscriptionId: 101,
        referenceNumber: 'SUB-A46EB4EEA7FF',
        studentId: 10,
        studentName: 'Capacity Test Student Two',
        studentGrade: 'Grade 5',
        routeId: 45,
        routeNumber: 'R26',
        routeName: 'Active Driver and Bus Test',
        stopId: 62,
        stopName: 'R26 Test Stop',
        transportType: 'OneWay',
        fee: 150,
        status: 'Approved',
        startDate: '2026-09-01',
        endDate: '2026-12-31',
      },
    ]);

    fixture.detectChanges();

    httpTesting.expectOne('/api/stops/route/45').flush([
      {
        stopId: 62,
        name: 'R26 Test Stop',
        stopOrder: 1,
        pickupTime: '07:00',
        dropoffTime: '14:00',
      },
    ]);

    fixture.detectChanges();

    const cardText = fixture.nativeElement.textContent as string;
    expect(cardText).toContain('7:00 AM');
    expect(cardText).toContain('2:00 PM');

    const detailsBtn = fixture.nativeElement.querySelector('.card-actions button') as HTMLButtonElement;
    detailsBtn.click();
    fixture.detectChanges();

    httpTesting.expectOne('/api/routes/45').flush({
      routeId: 45,
      routeNumber: 'R26',
      name: 'Active Driver and Bus Test',
      startPoint: 'Origin',
      destination: 'School',
      serviceArea: 'West Amman',
      capacity: 30,
      enrolledStudents: 2,
      isActive: true,
      busId: 21,
      busPlate: '50-21000',
      driverId: 3,
      driverName: 'Driver Sami',
      stops: [],
    });

    fixture.detectChanges();

    const modalText = fixture.nativeElement.querySelector('.details-modal')?.textContent as string;
    expect(modalText).toContain('50-21000');
    expect(modalText).toContain('Driver Sami');
    expect(modalText).toContain('7:00 AM');
    expect(modalText).toContain('2:00 PM');
    expect(modalText).not.toContain('Not assigned yet');

    // When OneWay specifies explicit Morning or Afternoon direction
    const oneWayMorningOnly: SubscriptionItem = {
      subscriptionId: 88,
      referenceNumber: 'SUB-ID-ONLY',
      studentId: 10,
      studentName: 'Student',
      studentGrade: 'Grade 5',
      routeId: 45,
      routeNumber: 'R26',
      routeName: 'Active Driver and Bus Test',
      stopId: 20,
      stopName: 'R26 Test Stop',
      pickupTime: '',
      dropoffTime: '',
      transportType: 'OneWay',
      direction: 'Morning',
      fee: 150,
      status: 'Approved',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      requestedAt: '2026-08-20',
      busId: 21,
      driverId: 3,
    };
    component['selectedRouteDetails'].set(null);
    expect(component.assignedBusText(oneWayMorningOnly)).toBe('Assigned (Bus #21)');
    expect(component.assignedDriverText(oneWayMorningOnly)).toBe('Assigned (Driver #3)');
    expect(component.morningPickupTime(oneWayMorningOnly)).toBe('7:00 AM');
    expect(component.afternoonDropoffTime(oneWayMorningOnly)).toBe('');
  });
});
