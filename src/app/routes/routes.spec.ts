import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Routes } from './routes';

describe('Routes', () => {
  let fixture: ComponentFixture<Routes>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Routes],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Routes);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should load active non-test routes from GET /api/routes', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne('/api/routes');
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        routeId: 1,
        routeNumber: 'R1',
        name: 'Abdoun Route',
        startPoint: 'Abdoun Circle',
        destination: 'Basi School',
        serviceArea: 'West Amman',
        capacity: 30,
        enrolledStudents: 12,
        isActive: true,
        stops: [],
      },
      {
        routeId: 2,
        routeNumber: 'R2',
        name: 'Inactive Route',
        startPoint: 'Marka',
        destination: 'Basi School',
        serviceArea: 'East Amman',
        capacity: 30,
        enrolledStudents: 0,
        isActive: false,
        stops: [],
      },
      {
        routeId: 3,
        routeNumber: 'TEST-99',
        name: 'TEST Smoke Route',
        startPoint: 'Test',
        destination: 'School',
        serviceArea: 'North Amman',
        capacity: 20,
        enrolledStudents: 0,
        isActive: true,
        stops: [],
      },
    ]);

    fixture.detectChanges();

    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('R1');
    expect(html).toContain('Abdoun Route');
    expect(html).not.toContain('Inactive Route');
    expect(html).not.toContain('TEST-99');
    expect(html).not.toContain('R101');
  });

  it('should fetch route details and stops when clicking View Route Details', () => {
    fixture.detectChanges();

    httpTesting.expectOne('/api/routes').flush([
      {
        routeId: 5,
        routeNumber: 'R2',
        name: 'Jubeiha Route',
        startPoint: 'Jubeiha Circle',
        destination: 'Basi School',
        serviceArea: 'North Amman',
        capacity: 28,
        enrolledStudents: 10,
        isActive: true,
        stops: [],
      },
    ]);

    fixture.detectChanges();

    const detailsBtn = fixture.nativeElement.querySelector('.details-btn') as HTMLButtonElement;
    expect(detailsBtn).toBeTruthy();
    detailsBtn.click();

    const detailReq = httpTesting.expectOne('/api/routes/5');
    detailReq.flush({
      routeId: 5,
      routeNumber: 'R2',
      name: 'Jubeiha Route',
      startPoint: 'Jubeiha Circle',
      destination: 'Basi School',
      serviceArea: 'North Amman',
      capacity: 28,
      enrolledStudents: 10,
      isActive: true,
      busPlate: '50-12345',
      driverName: 'Driver Khalid',
      stops: [],
    });

    const stopsReq = httpTesting.expectOne('/api/stops/route/5');
    stopsReq.flush([
      {
        stopId: 10,
        name: 'Jubeiha Circle',
        stopOrder: 1,
        pickupTime: '06:45:00',
        dropoffTime: '14:45:00',
      },
    ]);

    fixture.detectChanges();

    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('50-12345');
    expect(html).toContain('Driver Khalid');
    expect(html).toContain('Jubeiha Circle');
    expect(html).toContain('6:45 AM');
    expect(html).toContain('2:45 PM');
    expect(html).not.toContain('demonstration schedules');
  });

  it('should display an error state and not demo data when GET /api/routes fails', () => {
    fixture.detectChanges();

    httpTesting.expectOne('/api/routes').flush('Server Error', {
      status: 500,
      statusText: 'Server Error',
    });

    fixture.detectChanges();

    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Unable to load routes');
    expect(html).not.toContain('R101');
  });
});
