import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TransportationSubscription } from './transportation-subscription';
import { StudentService } from '../services/student.service';
import { SubscriptionService } from '../services/subscription.service';
import { RouteService } from '../services/route.service';

describe('TransportationSubscription', () => {
  let router: Router;
  let studentService: StudentService;
  let subscriptionService: SubscriptionService;

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
    studentService = TestBed.inject(StudentService);
    subscriptionService = TestBed.inject(SubscriptionService);
  });

  afterEach(() => {
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
});
