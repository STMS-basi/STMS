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
});
