import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { PreferencesService } from '../services/preferences.service';
import { RouteItem, RouteService, RouteStop } from '../services/route.service';
import { StudentItem, StudentService } from '../services/student.service';
import { SubscriptionService, TransportType } from '../services/subscription.service';

@Component({
  selector: 'app-transportation-subscription',
  imports: [ReactiveFormsModule, RouterLink, Header],
  templateUrl: './transportation-subscription.html',
  styleUrl: './transportation-subscription.css',
})
export class TransportationSubscription implements OnInit {
  protected readonly prefs = inject(PreferencesService);
  protected readonly t = this.prefs.t;

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly studentService = inject(StudentService);
  private readonly routeService = inject(RouteService);
  private readonly subscriptionService = inject(SubscriptionService);

  public readonly students = this.studentService.students;
  public readonly routes = this.routeService.routes;

  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedStudentId = signal<number>(0);
  protected readonly selectedRouteId = signal<number>(0);
  protected readonly selectedStopId = signal<number>(0);
  protected readonly selectedTransportType = signal<TransportType>('RoundTrip');

  protected readonly subForm = this.fb.group({
    studentId: [0, [Validators.required, Validators.min(1)]],
    routeId: [0, [Validators.required, Validators.min(1)]],
    stopId: [0, [Validators.required, Validators.min(1)]],
    transportType: ['RoundTrip' as TransportType, [Validators.required]],
  });

  public readonly selectedStudent = computed<StudentItem | undefined>(() => {
    const sId = this.selectedStudentId();
    return this.students().find((s) => s.studentId === sId);
  });

  public readonly selectedRoute = computed<RouteItem | undefined>(() => {
    const rId = this.selectedRouteId();
    return this.routes().find((r) => r.routeId === rId);
  });

  public readonly availableStops = computed<readonly RouteStop[]>(() => {
    return this.selectedRoute()?.stops ?? [];
  });

  public readonly selectedStop = computed<RouteStop | undefined>(() => {
    const stId = this.selectedStopId();
    return this.availableStops().find((s) => s.stopId === stId);
  });

  public readonly remainingSeats = computed<number>(() => {
    const r = this.selectedRoute();
    if (!r) return 0;
    return Math.max(0, r.capacity - r.enrolledStudents);
  });

  public readonly isRouteFull = computed<boolean>(() => {
    const r = this.selectedRoute();
    return Boolean(r && this.remainingSeats() <= 0);
  });

  public readonly calculatedFee = computed<number>(() => {
    return this.selectedTransportType() === 'OneWay' ? 150 : 300;
  });

  public ngOnInit(): void {
    this.studentService.fetchStudents().subscribe();
    this.routeService.fetchRoutes().subscribe();

    this.subForm.get('studentId')?.valueChanges.subscribe((id) => {
      this.selectedStudentId.set(Number(id));
    });

    this.subForm.get('routeId')?.valueChanges.subscribe((id) => {
      this.selectedRouteId.set(Number(id));
      this.selectedStopId.set(0);
      this.subForm.patchValue({ stopId: 0 }, { emitEvent: false });
    });

    this.subForm.get('stopId')?.valueChanges.subscribe((id) => {
      this.selectedStopId.set(Number(id));
    });

    this.subForm.get('transportType')?.valueChanges.subscribe((type) => {
      this.selectedTransportType.set(type as TransportType);
    });

    this.route.queryParamMap.subscribe((params) => {
      const qStudentId = params.get('studentId');
      if (qStudentId) {
        const id = Number(qStudentId);
        this.selectedStudentId.set(id);
        this.subForm.patchValue({ studentId: id });
      }
    });
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const control = this.subForm.get(fieldName);
    return Boolean(control && control.invalid && (control.dirty || control.touched));
  }

  public selectTransportType(type: TransportType): void {
    this.selectedTransportType.set(type);
    this.subForm.patchValue({ transportType: type });
  }

  protected onSubmit(): void {
    this.errorMessage.set(null);

    if (this.subForm.invalid) {
      this.subForm.markAllAsTouched();
      this.errorMessage.set(this.t().regGenericError);
      return;
    }

    if (this.isRouteFull()) {
      this.errorMessage.set(this.t().routeFullWarning);
      return;
    }

    const student = this.selectedStudent();
    const routeItem = this.selectedRoute();
    const stop = this.selectedStop();

    if (!student || !routeItem || !stop) {
      this.errorMessage.set(this.t().regGenericError);
      return;
    }

    this.isSubmitting.set(true);

    const formVals = this.subForm.getRawValue();
    const created = this.subscriptionService.createSubscription({
      studentId: student.studentId,
      studentName: student.fullName,
      studentGrade: student.grade,
      routeId: routeItem.routeId,
      routeNumber: routeItem.routeNumber,
      routeName: routeItem.name,
      stopId: stop.stopId,
      stopName: stop.name,
      pickupTime: stop.pickupTime,
      dropoffTime: stop.dropoffTime,
      transportType: formVals.transportType,
      fee: this.calculatedFee(),
    });

    this.isSubmitting.set(false);
    void this.router.navigate(['/subscription-confirmation', created.referenceNumber]);
  }
}
