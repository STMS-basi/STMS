import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { AuthService } from '../services/auth.service';
import { PreferencesService } from '../services/preferences.service';
import { RouteItem, RouteService, RouteStop } from '../services/route.service';
import { StudentItem, StudentService } from '../services/student.service';
import { OneWayDirection, RegistrationInfo, SubscriptionService, TransportType } from '../services/subscription.service';

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
  private readonly authService = inject(AuthService);
  private readonly studentService = inject(StudentService);
  private readonly routeService = inject(RouteService);
  private readonly subscriptionService = inject(SubscriptionService);

  public readonly students = computed<readonly StudentItem[]>(() => {
    const list = this.studentService.students();
    if (!this.authService.isAuthenticated()) {
      return list;
    }
    const email = this.authService.userEmail()?.trim().toLowerCase();
    if (!email) return [];
    return list.filter((s) => s.parentEmail?.trim().toLowerCase() === email);
  });

  public readonly routes = this.routeService.routes;

  protected readonly isLoadingStudents = signal<boolean>(false);
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly registrationInfo = signal<RegistrationInfo | null>(null);
  protected readonly routeStopsSignal = signal<readonly RouteStop[]>([]);

  protected readonly selectedStudentId = signal<number>(0);
  protected readonly selectedRouteId = signal<number>(0);
  protected readonly selectedStopId = signal<number>(0);
  protected readonly selectedTransportType = signal<TransportType>('RoundTrip');
  protected readonly selectedDirection = signal<OneWayDirection | null>(null);
  protected readonly directionTouched = signal<boolean>(false);

  protected readonly isDirectionInvalid = computed<boolean>(
    () =>
      this.selectedTransportType() === 'OneWay' &&
      this.directionTouched() &&
      this.selectedDirection() === null
  );

  private trackedEmail = this.authService.userEmail()?.trim().toLowerCase() ?? null;

  constructor() {
    effect(() => {
      const currentEmail = this.authService.userEmail()?.trim().toLowerCase() ?? null;
      if (currentEmail !== this.trackedEmail) {
        this.trackedEmail = currentEmail;
        untracked(() => {
          this.selectedStudentId.set(0);
          this.subForm.patchValue({ studentId: 0 }, { emitEvent: false });
          if (this.authService.isAuthenticated()) {
            this.loadStudentsForSession();
          } else {
            this.studentService.clearInMemoryStudents();
          }
        });
      }
    });
  }

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

  public readonly eligibleRoutes = computed<readonly RouteItem[]>(() => {
    return this.routes().filter((r) => this.isRouteEligible(r));
  });

  public readonly selectedRoute = computed<RouteItem | undefined>(() => {
    const rId = this.selectedRouteId();
    return this.routes().find((r) => r.routeId === rId);
  });

  public readonly availableStops = computed<readonly RouteStop[]>(() => {
    const fetched = this.routeStopsSignal();
    if (fetched.length > 0) return fetched;
    return this.selectedRoute()?.stops ?? [];
  });

  public readonly selectedStop = computed<RouteStop | undefined>(() => {
    const stId = this.selectedStopId();
    return this.availableStops().find((s) => s.stopId === stId);
  });

  public readonly remainingSeats = computed<number>(() => {
    const r = this.selectedRoute();
    return r ? this.routeRemainingSeats(r) : 0;
  });

  public readonly isRouteFull = computed<boolean>(() => {
    const r = this.selectedRoute();
    return Boolean(r && this.remainingSeats() <= 0);
  });

  public routeRemainingSeats(route: RouteItem): number {
    const capacity = typeof route.capacity === 'number' && !isNaN(route.capacity) ? route.capacity : 0;
    const enrolled =
      typeof route.enrolledStudents === 'number' && !isNaN(route.enrolledStudents)
        ? route.enrolledStudents
        : 0;
    return Math.max(0, capacity - enrolled);
  }

  private isRouteEligible(route: RouteItem): boolean {
    if (route.isActive === false) return false;
    if (route.isEligible === false || route.eligibleForSubscription === false) return false;
    if (this.routeRemainingSeats(route) <= 0) return false;

    const enforceAssignment =
      this.routeService.hasBackendRoutes() || this.hasAssignmentMetadata(route);
    if (enforceAssignment) {
      if (!this.hasQualifiedBus(route) || !this.hasQualifiedDriver(route)) {
        return false;
      }
    }

    return true;
  }

  private hasAssignmentMetadata(route: RouteItem): boolean {
    return (
      'busId' in route ||
      'busPlate' in route ||
      'assignedBus' in route ||
      'plateNumber' in route ||
      'bus' in route ||
      'busIsActive' in route ||
      'driverId' in route ||
      'driverName' in route ||
      'assignedDriver' in route ||
      'driver' in route ||
      'driverIsActive' in route
    );
  }

  private hasQualifiedBus(route: RouteItem): boolean {
    if (
      route.busIsActive === false ||
      route.bus?.isActive === false ||
      this.isInactiveStatus(route.busStatus ?? route.bus?.status)
    ) {
      return false;
    }

    if (
      (typeof route.busId === 'number' && route.busId > 0) ||
      (typeof route.bus?.busId === 'number' && route.bus.busId > 0)
    ) {
      return true;
    }

    return this.hasNonEmptyLabel([
      route.busPlate,
      route.assignedBus,
      route.plateNumber,
      route.bus?.plateNumber,
      route.bus?.busPlate,
    ]);
  }

  private hasQualifiedDriver(route: RouteItem): boolean {
    const driverObj = route.driver && typeof route.driver === 'object' ? route.driver : null;
    if (
      route.driverIsActive === false ||
      driverObj?.isActive === false ||
      this.isInactiveStatus(route.driverStatus ?? driverObj?.status)
    ) {
      return false;
    }

    if (
      (typeof route.driverId === 'number' && route.driverId > 0) ||
      (typeof driverObj?.driverId === 'number' && driverObj.driverId > 0)
    ) {
      return true;
    }

    const nestedDriverName = typeof route.driver === 'string' ? route.driver : driverObj?.fullName ?? driverObj?.name;
    return this.hasNonEmptyLabel([route.driverName, route.assignedDriver, nestedDriverName]);
  }

  private isInactiveStatus(status?: string | null): boolean {
    return (status ?? '').trim().toLowerCase() === 'inactive';
  }

  private hasNonEmptyLabel(values: readonly (string | null | undefined)[]): boolean {
    return values.some((val) => {
      if (typeof val !== 'string') return false;
      const trimmed = val.trim();
      return trimmed.length > 0 && trimmed !== '-' && trimmed !== '—';
    });
  }

  public readonly calculatedFee = computed<number>(() => {
    return this.selectedTransportType() === 'OneWay' ? 150 : 300;
  });

  protected readonly notSelectedText = computed(() =>
    this.prefs.lang() === 'ar' ? 'غير محدد' : 'Not selected'
  );

  protected formatSemesterName(name?: string | null): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed || this.prefs.lang() !== 'ar') {
      return trimmed;
    }

    return trimmed
      .replace(/^First Semester\b/i, 'الفصل الدراسي الأول')
      .replace(/^Second Semester\b/i, 'الفصل الدراسي الثاني')
      .replace(/^Summer Semester\b/i, 'الفصل الصيفي')
      .replace(/^Fall Semester\b/i, 'فصل الخريف')
      .replace(/^Spring Semester\b/i, 'فصل الربيع');
  }

  protected formatBannerDate(rawIso?: string, fallbackFormatted?: string): string {
    const source = (rawIso || fallbackFormatted || '').trim();
    if (!source) return '';
    return this.prefs.formatDate(source, 'long');
  }

  public ngOnInit(): void {
    this.subscriptionService.getRegistrationInfo().subscribe((info) => {
      this.registrationInfo.set(info);
    });

    if (this.authService.isAuthenticated()) {
      this.loadStudentsForSession();
    }

    this.routeService.fetchRoutes().subscribe();

    this.subForm.get('studentId')?.valueChanges.subscribe((id) => {
      this.selectedStudentId.set(Number(id));
    });

    this.subForm.get('routeId')?.valueChanges.subscribe((id) => {
      const numId = Number(id);
      this.selectedRouteId.set(numId);
      this.selectedStopId.set(0);
      this.subForm.patchValue({ stopId: 0 }, { emitEvent: false });

      if (numId > 0) {
        this.routeService.getStopsByRoute(numId).subscribe({
          next: (stops) => {
            if (stops && stops.length > 0) {
              this.routeStopsSignal.set(stops);
            } else {
              const currentRoute = this.routes().find((r) => r.routeId === numId);
              this.routeStopsSignal.set(currentRoute?.stops ?? []);
            }
          },
          error: () => {
            const currentRoute = this.routes().find((r) => r.routeId === numId);
            this.routeStopsSignal.set(currentRoute?.stops ?? []);
          },
        });
      } else {
        this.routeStopsSignal.set([]);
      }
    });

    this.subForm.get('stopId')?.valueChanges.subscribe((id) => {
      this.selectedStopId.set(Number(id));
    });

    this.subForm.get('transportType')?.valueChanges.subscribe((type) => {
      const nextType = type as TransportType;
      this.selectedTransportType.set(nextType);
      if (nextType !== 'OneWay') {
        this.selectedDirection.set(null);
        this.directionTouched.set(false);
      }
    });

    this.route.queryParamMap.subscribe(() => {
      this.applyStudentParam(this.students());
    });
  }

  private loadStudentsForSession(): void {
    this.isLoadingStudents.set(true);
    this.studentService.fetchLiveStudents().subscribe((students) => {
      this.isLoadingStudents.set(false);
      this.applyStudentParam(students);
    });
  }

  private applyStudentParam(studentsList: readonly StudentItem[]): void {
    const qStudentId = this.route.snapshot.queryParamMap.get('studentId');
    if (qStudentId) {
      const id = Number(qStudentId);
      const match = studentsList.find((s) => s.studentId === id);
      if (match) {
        this.selectedStudentId.set(match.studentId);
        this.subForm.patchValue({ studentId: match.studentId });
        return;
      }
    }
    const currentId = this.selectedStudentId();
    if (currentId > 0 && !studentsList.some((s) => s.studentId === currentId)) {
      this.selectedStudentId.set(0);
      this.subForm.patchValue({ studentId: 0 });
    }
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const control = this.subForm.get(fieldName);
    return Boolean(control && control.invalid && (control.dirty || control.touched));
  }

  public hasStopTime(value?: string | null): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return !['-', '—', 'null', 'undefined', 'n/a'].includes(trimmed.toLowerCase());
  }

  public stopHasSchedule(stop?: RouteStop | null): boolean {
    return Boolean(stop && (this.hasStopTime(stop.pickupTime) || this.hasStopTime(stop.dropoffTime)));
  }

  public readonly schedulableStops = computed<readonly RouteStop[]>(() =>
    this.availableStops().filter((stop) => this.stopHasSchedule(stop))
  );

  public readonly hasUnscheduledStops = computed<boolean>(() =>
    this.availableStops().some((stop) => !this.stopHasSchedule(stop))
  );

  public readonly selectedStopMissingSchedule = computed<boolean>(() => {
    const stop = this.selectedStop();
    return Boolean(stop && !this.stopHasSchedule(stop));
  });

  public formatStopOptionLabel(stop: RouteStop): string {
    const isAr = this.prefs.lang() === 'ar';
    const hasPickup = this.hasStopTime(stop.pickupTime);
    const hasDropoff = this.hasStopTime(stop.dropoffTime);

    if (!hasPickup && !hasDropoff) {
      return isAr
        ? `${stop.name} • المواعيد غير محددة (غير متاحة للاختيار)`
        : `${stop.name} • Schedule not set (unavailable)`;
    }

    const parts: string[] = [];
    if (hasPickup) {
      parts.push(`${this.t().pickupTimeLabel}: ${stop.pickupTime.trim()}`);
    }
    if (hasDropoff) {
      parts.push(`${this.t().dropoffTimeLabel}: ${stop.dropoffTime.trim()}`);
    }
    return `${stop.name} • ${parts.join(' | ')}`;
  }

  protected readonly selectedDirectionLabel = computed<string>(() => {
    const dir = this.selectedDirection();
    const isAr = this.prefs.lang() === 'ar';
    if (dir === 'Morning') {
      return isAr ? 'الاصطحاب الصباحي فقط' : 'Morning Pickup Only';
    }
    if (dir === 'Afternoon') {
      return isAr ? 'التوصيل بعد الظهر فقط' : 'Afternoon Drop-off Only';
    }
    return this.notSelectedText();
  });

  public selectTransportType(type: TransportType): void {
    this.selectedTransportType.set(type);
    this.subForm.patchValue({ transportType: type });
    if (type !== 'OneWay') {
      this.selectedDirection.set(null);
      this.directionTouched.set(false);
    }
  }

  public selectOneWayDirection(direction: OneWayDirection): void {
    this.selectedDirection.set(direction);
    this.directionTouched.set(true);
    this.errorMessage.set(null);
  }

  protected onSubmit(): void {
    this.errorMessage.set(null);

    if (this.subForm.invalid) {
      this.subForm.markAllAsTouched();
      if (this.selectedTransportType() === 'OneWay') {
        this.directionTouched.set(true);
      }
      this.errorMessage.set(this.t().regGenericError);
      return;
    }

    const formVals = this.subForm.getRawValue();
    if (formVals.transportType === 'OneWay' && !this.selectedDirection()) {
      this.directionTouched.set(true);
      this.errorMessage.set(
        this.prefs.lang() === 'ar'
          ? 'يرجى اختيار اتجاه الاشتراك (الاصطحاب الصباحي فقط أو التوصيل بعد الظهر فقط).'
          : 'Please choose a one-way direction (Morning Pickup Only or Afternoon Drop-off Only).'
      );
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

    if (!this.stopHasSchedule(stop)) {
      this.errorMessage.set(
        this.prefs.lang() === 'ar'
          ? 'المحطة المختارة لا تحتوي على مواعيد صعود أو نزول محددة حالياً ولا يمكن الاشتراك بها.'
          : 'The selected stop does not have scheduled pickup or drop-off times yet and cannot be selected.'
      );
      return;
    }

    if (!this.isRouteEligible(routeItem)) {
      this.errorMessage.set(
        this.prefs.lang() === 'ar'
          ? 'هذا المسار غير مؤهل للاشتراك حالياً.'
          : 'This route is currently not eligible for subscription.'
      );
      return;
    }

    this.isSubmitting.set(true);

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
      direction: formVals.transportType === 'OneWay' ? this.selectedDirection() : null,
      fee: this.calculatedFee(),
    });

    this.isSubmitting.set(false);
    void this.router.navigate(['/subscription-confirmation', created.referenceNumber]);
  }
}
