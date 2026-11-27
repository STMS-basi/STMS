import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TransportationSubscription } from './transportation-subscription';
import { AuthService } from '../services/auth.service';
import { PreferencesService } from '../services/preferences.service';
import { StudentService } from '../services/student.service';
import { SubscriptionService } from '../services/subscription.service';
import { RouteService } from '../services/route.service';

describe('TransportationSubscription', () => {
  let router: Router;
  let authService: AuthService;
  let studentService: StudentService;
  let subscriptionService: SubscriptionService;
  let prefsService: PreferencesService;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TransportationSubscription],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        StudentService,
        RouteService,
        SubscriptionService,
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    authService = TestBed.inject(AuthService);
    studentService = TestBed.inject(StudentService);
    subscriptionService = TestBed.inject(SubscriptionService);
    prefsService = TestBed.inject(PreferencesService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    prefsService.setLanguage('en');
    localStorage.clear();
  });

  it('should create the TransportationSubscription component', () => {
    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should calculate correct fees for OneWay and RoundTrip', () => {
    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.selectTransportType('RoundTrip');
    expect(component.calculatedFee()).toBe(300);

    component.selectTransportType('OneWay');
    expect(component.calculatedFee()).toBe(150);
  });

  it('should validate capacity and identify when route has available seats or is full', () => {
    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    // R101 has 30 capacity and 18 enrolled -> remaining 12
    component['subForm'].patchValue({ routeId: 1 });
    expect(component.remainingSeats()).toBe(12);
    expect(component.isRouteFull()).toBe(false);

    // R104 has 30 capacity and 30 enrolled -> full
    component['subForm'].patchValue({ routeId: 4 });
    expect(component.remainingSeats()).toBe(0);
    expect(component.isRouteFull()).toBe(true);
  });

  it('should prevent submission when route is full', () => {
    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    studentService.addStudent({
      fullName: 'Ahmad Student',
      grade: 'Grade 3',
      className: '3A',
    }).subscribe();

    const student = studentService.students()[0];

    component['subForm'].setValue({
      studentId: student.studentId,
      routeId: 4, // Full route
      stopId: 401,
      transportType: 'RoundTrip',
    });

    component['onSubmit']();

    expect(component['errorMessage']()).toBeTruthy();
    expect(subscriptionService.subscriptions().length).toBe(0);
  });

  it('should create subscription and navigate to confirmation upon valid submit', () => {
    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const navigateSpy = vi.spyOn(router, 'navigate');

    studentService.addStudent({
      fullName: 'Sara Student',
      grade: 'Grade 5',
      className: '5B',
    }).subscribe();

    const student = studentService.students().find((s) => s.fullName === 'Sara Student')!;

    component['subForm'].setValue({
      studentId: student.studentId,
      routeId: 1,
      stopId: 101,
      transportType: 'RoundTrip',
    });

    component['onSubmit']();

    expect(component['errorMessage']()).toBeNull();
    expect(subscriptionService.subscriptions().length).toBe(1);
    expect(subscriptionService.subscriptions()[0].studentName).toBe('Sara Student');
    expect(navigateSpy).toHaveBeenCalled();
  });

  it('should map registrationInfo from backend response and format dates correctly', () => {
    subscriptionService.getRegistrationInfo().subscribe((info) => {
      expect(info.registrationOpen).toBe(true);
      expect(info.isRegistrationOpen).toBe(true);
      expect(info.semesterName).toBe('First Semester 2026/2027');
      expect(info.startDate).toContain('September 1, 2026');
      expect(info.registrationOpenDate).toContain('August 18, 2026');
      expect(info.rawStartDate).toBe('2026-09-01');
      expect(info.rawRegistrationOpenDate).toBe('2026-08-18');
    });

    const req = httpTesting.expectOne('/api/subscriptions/registration-info');
    req.flush({
      registrationOpen: true,
      semesterName: 'First Semester 2026/2027',
      startDate: '2026-09-01T00:00:00',
      endDate: '2026-12-31T00:00:00',
      message: 'Registration is open',
    });
  });

  it('should translate Not selected, semester name, and dates when language is Arabic', () => {
    prefsService.setLanguage('ar');
    studentService.addStudent({
      fullName: 'Sara Student',
      grade: 'Grade 5',
      className: '5B',
    }).subscribe();

    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();

    httpTesting.expectOne('/api/subscriptions/registration-info').flush({
      registrationOpen: true,
      semesterName: 'First Semester 2026/2027',
      startDate: '2026-09-01T00:00:00',
      endDate: '2026-12-31T00:00:00',
    });

    fixture.detectChanges();

    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('غير محدد');
    expect(html).not.toContain('Not selected');
    expect(html).toContain('الفصل الدراسي الأول 2026/2027');
    expect(html).not.toContain('First Semester 2026/2027');
    expect(html).not.toContain('2026-09-01T00:00:00');
  });

  it('should show No Registered Students and ignore stale cache when GET /api/students returns empty array', () => {
    localStorage.setItem(
      'stms_parent_students_api.test@example.com',
      JSON.stringify([
        { studentId: 101, parentEmail: 'api.test@example.com', fullName: 'Yousef Al Basi', grade: 'Grade 5', className: '5A' },
      ])
    );

    authService.setSession({
      token: 'jwt-api-test',
      role: 'Parent',
      fullName: 'Frontend API Test',
      email: 'api.test@example.com',
    });

    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();

    httpTesting.expectOne('/api/subscriptions/registration-info').flush({
      registrationOpen: true,
      semesterName: 'First Semester 2026/2027',
      startDate: '2026-09-01T00:00:00',
    });
    httpTesting.expectOne('/api/routes').flush([]);
    httpTesting.expectOne('/api/students').flush([]);

    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.students().length).toBe(0);
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain(component['t']().noRegisteredStudentsWarning);
    expect(html).not.toContain('Yousef Al Basi');
    expect(html).not.toContain('Layan Al Basi');
  });

  it('should clear old students when switching authenticated user accounts', () => {
    authService.setSession({
      token: 'jwt-user-a',
      role: 'Parent',
      fullName: 'Parent A',
      email: 'parent-a@example.com',
    });

    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();

    httpTesting.expectOne('/api/subscriptions/registration-info').flush({ registrationOpen: true });
    httpTesting.expectOne('/api/routes').flush([]);
    httpTesting.expectOne('/api/students').flush([
      { studentId: 501, fullName: 'Child Of Parent A', grade: 'Grade 3', className: '3A' },
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.students().map((s) => s.fullName)).toEqual(['Child Of Parent A']);

    authService.setSession({
      token: 'jwt-user-b',
      role: 'Parent',
      fullName: 'Parent B',
      email: 'parent-b@example.com',
    });
    fixture.detectChanges();

    httpTesting.expectOne('/api/students').flush([]);
    fixture.detectChanges();

    expect(fixture.componentInstance.students().length).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('Child Of Parent A');
    expect(fixture.nativeElement.textContent).toContain(fixture.componentInstance['t']().noRegisteredStudentsWarning);
  });

  it('should filter eligibleRoutes strictly by active status, qualified bus & driver, and seat availability', () => {
    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();

    httpTesting.expectOne('/api/subscriptions/registration-info').flush({ registrationOpen: true });
    httpTesting.expectOne('/api/routes').flush([
      {
        routeId: 10,
        routeNumber: 'R1',
        name: 'Eligible Route',
        startPoint: 'A',
        destination: 'School',
        serviceArea: 'West Amman',
        capacity: 30,
        enrolledStudents: 10,
        isActive: true,
        busId: 1,
        driverId: 2,
        stops: [],
      },
      {
        routeId: 11,
        routeNumber: 'R2',
        name: 'Inactive Route',
        startPoint: 'A',
        destination: 'School',
        serviceArea: 'North Amman',
        capacity: 30,
        enrolledStudents: 0,
        isActive: false,
        busId: 3,
        driverId: 4,
        stops: [],
      },
      {
        routeId: 12,
        routeNumber: 'R3',
        name: 'No Bus Route',
        startPoint: 'A',
        destination: 'School',
        serviceArea: 'East Amman',
        capacity: 30,
        enrolledStudents: 5,
        isActive: true,
        busId: null,
        driverId: 5,
        stops: [],
      },
      {
        routeId: 13,
        routeNumber: 'R4',
        name: 'No Driver Route',
        startPoint: 'A',
        destination: 'School',
        serviceArea: 'South Amman',
        capacity: 30,
        enrolledStudents: 5,
        isActive: true,
        busId: 6,
        driverId: null,
        stops: [],
      },
      {
        routeId: 14,
        routeNumber: 'R5',
        name: 'Inactive Driver Route',
        startPoint: 'A',
        destination: 'School',
        serviceArea: 'Downtown',
        capacity: 30,
        enrolledStudents: 5,
        isActive: true,
        busId: 7,
        driverId: 8,
        driverIsActive: false,
        stops: [],
      },
      {
        routeId: 15,
        routeNumber: 'R6',
        name: 'Full Route',
        startPoint: 'A',
        destination: 'School',
        serviceArea: 'West Amman',
        capacity: 25,
        enrolledStudents: 25,
        isActive: true,
        busId: 9,
        driverId: 10,
        stops: [],
      },
      {
        routeId: 16,
        routeNumber: 'TEST-16',
        name: 'TEST Qualified Route',
        startPoint: 'A',
        destination: 'School',
        serviceArea: 'North Amman',
        capacity: 20,
        enrolledStudents: 2,
        isActive: true,
        busId: 11,
        driverId: 12,
        stops: [],
      },
    ]);

    const eligible = fixture.componentInstance.eligibleRoutes().map((r) => r.routeId);
    expect(eligible).toEqual([10, 16]);
  });

  it('should require and submit OneWay direction choice (Morning Pickup Only or Afternoon Drop-off Only)', () => {
    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    studentService.addStudent({
      fullName: 'Omar Student',
      grade: 'Grade 4',
      className: '4A',
    }).subscribe();
    const student = studentService.students().find((s) => s.fullName === 'Omar Student')!;

    component['subForm'].patchValue({
      studentId: student.studentId,
      routeId: 1,
      stopId: 101,
    });
    fixture.detectChanges();

    // RoundTrip should NOT render direction selector
    expect(fixture.nativeElement.querySelector('.direction-selector')).toBeNull();

    // Switching to OneWay renders Morning Pickup Only and Afternoon Drop-off Only options
    component.selectTransportType('OneWay');
    fixture.detectChanges();

    const directionEl = fixture.nativeElement.querySelector('.direction-selector') as HTMLElement;
    expect(directionEl).toBeTruthy();
    expect(directionEl.textContent).toContain('Morning Pickup Only');
    expect(directionEl.textContent).toContain('Afternoon Drop-off Only');

    // Submitting OneWay without selecting a direction must block submission and show validation error
    component['onSubmit']();
    fixture.detectChanges();
    expect(component['isDirectionInvalid']()).toBe(true);
    expect(subscriptionService.subscriptions().length).toBe(0);

    // Selecting Afternoon Drop-off Only enables submission and persists direction
    component.selectOneWayDirection('Afternoon');
    fixture.detectChanges();
    expect(component['isDirectionInvalid']()).toBe(false);
    expect(fixture.nativeElement.querySelector('.summary-card')?.textContent).toContain('Afternoon Drop-off Only');

    // Verify Arabic labels render properly
    prefsService.setLanguage('ar');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.direction-selector')?.textContent).toContain('الاصطحاب الصباحي فقط');
    expect(fixture.nativeElement.querySelector('.direction-selector')?.textContent).toContain('التوصيل بعد الظهر فقط');

    prefsService.setLanguage('en');
    fixture.detectChanges();

    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component['onSubmit']();
    expect(subscriptionService.subscriptions().length).toBe(1);
    expect(subscriptionService.subscriptions()[0].transportType).toBe('OneWay');
    expect(subscriptionService.subscriptions()[0].direction).toBe('Afternoon');
    expect(navigateSpy).toHaveBeenCalled();

    const postReq = httpTesting.expectOne('/api/subscriptions');
    expect(postReq.request.body).toEqual({
      studentId: student.studentId,
      routeId: 1,
      stopId: 101,
      transportType: 'OneWay',
      direction: 'Afternoon',
      oneWayDirection: 'Afternoon',
    });
    postReq.flush({ subscriptionId: 901, referenceNumber: 'SUB 2026 901' });
  });

  it('should disable stops without scheduled times and block submission with clear notices', () => {
    const fixture = TestBed.createComponent(TransportationSubscription);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    httpTesting.expectOne('/api/subscriptions/registration-info').flush({ registrationOpen: true });
    httpTesting.expectOne('/api/routes').flush([
      {
        routeId: 2,
        routeNumber: 'R2',
        name: 'Jubeiha Line',
        startPoint: 'University Street',
        destination: 'School',
        serviceArea: 'North Amman',
        capacity: 25,
        enrolledStudents: 0,
        isActive: true,
        busId: 1,
        driverId: 1,
        stops: [],
      },
    ]);

    studentService.addStudent({
      fullName: 'Tariq Student',
      grade: 'Grade 4',
      className: '4A',
    }).subscribe();
    httpTesting.expectOne('/api/students').flush({
      studentId: 10,
      fullName: 'Tariq Student',
      grade: 'Grade 4',
      className: '4A',
    });
    const student = studentService.students().find((s) => s.fullName === 'Tariq Student')!;

    component['subForm'].patchValue({ studentId: student.studentId, routeId: 2 });
    httpTesting.expectOne('/api/stops/route/2').flush([
      { stopId: 201, name: 'University Street', stopOrder: 1, pickupTime: '', dropoffTime: '' },
      { stopId: 202, name: 'Jubeiha Circle', stopOrder: 2, pickupTime: '06:55', dropoffTime: '14:15' },
    ]);
    fixture.detectChanges();

    const options = Array.from(
      fixture.nativeElement.querySelectorAll('#stopId option') as NodeListOf<HTMLOptionElement>
    );
    const uniOption = options.find((o) => o.textContent?.includes('University Street'))!;
    const circleOption = options.find((o) => o.textContent?.includes('Jubeiha Circle'))!;

    expect(uniOption.disabled).toBe(true);
    expect(uniOption.textContent).toContain('Schedule not set (unavailable)');
    expect(uniOption.textContent).not.toMatch(/:\s*$/);

    expect(circleOption.disabled).toBe(false);
    expect(circleOption.textContent).toContain('06:55');
    expect(circleOption.textContent).toContain('14:15');
    expect(component.hasUnscheduledStops()).toBe(true);

    // Arabic note & disabled label check
    prefsService.setLanguage('ar');
    fixture.detectChanges();
    expect(uniOption.textContent).toContain('المواعيد غير محددة');
    expect(fixture.nativeElement.textContent).toContain('غير متاحة للاختيار لحين تسجيل مواعيد الصعود والنزول');

    // Defensive check: if an unscheduled stop were ever programmatically selected, block submission
    component['subForm'].patchValue({ stopId: 201 });
    fixture.detectChanges();
    expect(component.selectedStopMissingSchedule()).toBe(true);
    component['onSubmit']();
    expect(component['errorMessage']()).toContain('لا تحتوي على مواعيد صعود أو نزول محددة');
    expect(subscriptionService.subscriptions().length).toBe(0);
  });
});
