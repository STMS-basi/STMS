import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
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

  public readonly remainingSeats = computed<number | null>(() => {
    const r = this.selectedRoute();
    return r ? this.routeRemainingSeats(r) : null;
  });

  public readonly hasSeatData = computed<boolean>(() => {
    return this.remainingSeats() !== null;
  });

  public readonly isRouteFull = computed<boolean>(() => {
    const r = this.selectedRoute();
    const seats = this.remainingSeats();
    return Boolean(r && seats !== null && seats <= 0);
  });

  public routeRemainingSeats(route: RouteItem): number | null {
    // 1. Prefer the backend-computed remainingSeats directly (even if 0)
    if (typeof route.remainingSeats === 'number' && !isNaN(route.remainingSeats)) {
      return Math.max(0, route.remainingSeats);
    }

    // 2. Computed from capacity - reservedSeats if present
    if (
      typeof route.capacity === 'number' &&
      !isNaN(route.capacity) &&
      typeof route.reservedSeats === 'number' &&
      !isNaN(route.reservedSeats)
    ) {
      return Math.max(0, route.capacity - route.reservedSeats);
    }

    // 3. Fallback only if enrolledStudents is explicitly provided
    if (
      typeof route.capacity === 'number' &&
      !isNaN(route.capacity) &&
      typeof route.enrolledStudents === 'number' &&
      !isNaN(route.enrolledStudents)
    ) {
      return Math.max(0, route.capacity - route.enrolledStudents);
    }

    // Never fallback to raw capacity when seat data is missing/null
    return null;
  }

  /** Whether the route has valid seat information (remainingSeats is not null/undefined) */
  public routeHasSeatData(route: RouteItem): boolean {
    return this.routeRemainingSeats(route) !== null;
  }

  private isRouteEligible(route: RouteItem): boolean {
    if (route.isActive === false) return false;
    if (route.isEligible === false || route.eligibleForSubscription === false) return false;

    // Exclude full routes
    const seats = this.routeRemainingSeats(route);
    if (seats !== null && seats <= 0) return false;

    // Routes must have an active bus and driver assigned to be eligible
    if (!this.hasQualifiedBus(route) || !this.hasQualifiedDriver(route)) {
      return false;
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
      const numId = Number(id);
      this.selectedStopId.set(numId);
      if (numId > 0) {
        const stop = this.availableStops().find((s) => s.stopId === numId);
        if (stop && !this.isStopSelectable(stop)) {
          this.selectedStopId.set(0);
          this.subForm.patchValue({ stopId: 0 }, { emitEvent: false });
        }
      }
    });

    this.subForm.get('transportType')?.valueChanges.subscribe((type) => {
      const nextType = type as TransportType;
      this.selectedTransportType.set(nextType);
      if (nextType !== 'OneWay') {
        this.selectedDirection.set(null);
        this.directionTouched.set(false);
      }
      const stop = this.selectedStop();
      if (stop && !this.isStopSelectable(stop)) {
        this.selectedStopId.set(0);
        this.subForm.patchValue({ stopId: 0 }, { emitEvent: false });
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

  /**
   * Whether a stop satisfies the schedule requirements of the current transport type and direction:
   * - RoundTrip: MUST have BOTH pickupTime and dropoffTime.
   * - OneWay + Morning: MUST have pickupTime.
   * - OneWay + Afternoon: MUST have dropoffTime.
   * - OneWay (direction not chosen yet): must have at least one time.
   */
  public isStopSelectable(stop?: RouteStop | null): boolean {
    if (!stop) return false;
    const type = this.selectedTransportType();
    const dir = this.selectedDirection();

    const hasPickup = this.hasStopTime(stop.pickupTime);
    const hasDropoff = this.hasStopTime(stop.dropoffTime);

    if (type === 'RoundTrip') {
      return hasPickup && hasDropoff;
    }

    if (type === 'OneWay') {
      if (dir === 'Morning') {
        return hasPickup;
      }
      if (dir === 'Afternoon') {
        return hasDropoff;
      }
      return hasPickup || hasDropoff;
    }

    return false;
  }

  public stopMatchesDirection(stop?: RouteStop | null): boolean {
    return this.isStopSelectable(stop);
  }

  public readonly schedulableStops = computed<readonly RouteStop[]>(() =>
    this.availableStops().filter((stop) => this.isStopSelectable(stop))
  );

  public readonly hasUnscheduledStops = computed<boolean>(() =>
    this.availableStops().some((stop) => !this.isStopSelectable(stop))
  );

  public readonly selectedStopMissingSchedule = computed<boolean>(() => {
    const stop = this.selectedStop();
    return Boolean(stop && !this.isStopSelectable(stop));
  });

  public readonly isSubmitDisabled = computed<boolean>(() => {
    if (this.isSubmitting()) return true;
    if (this.isRouteFull()) return true;
    if (this.selectedRouteId() <= 0) return true;
    if (this.selectedStopId() <= 0) return true;
    if (this.subForm.invalid) return true;
    const stop = this.selectedStop();
    if (!stop || !this.isStopSelectable(stop)) return true;
    if (this.selectedTransportType() === 'OneWay' && !this.selectedDirection()) return true;
    return false;
  });

  public readonly stopScheduleErrorMessage = computed<string>(() => {
    const stop = this.selectedStop();
    if (!stop || this.isStopSelectable(stop)) return '';

    const isAr = this.prefs.lang() === 'ar';
    const type = this.selectedTransportType();
    const dir = this.selectedDirection();
    const hasPickup = this.hasStopTime(stop.pickupTime);
    const hasDropoff = this.hasStopTime(stop.dropoffTime);

    if (type === 'RoundTrip') {
      if (hasPickup && !hasDropoff) {
        return isAr
          ? 'المحطة المختارة تحتوي على موعد اصطحاب صباحي فقط وتفتقر لموعد العودة، ولا يمكن الاشتراك بها لاشتراك الذهاب والإياب.'
          : 'The selected stop only has a morning pickup time and is missing a return time. It cannot be used for a Round Trip subscription.';
      }
      if (!hasPickup && hasDropoff) {
        return isAr
          ? 'المحطة المختارة تحتوي على موعد عودة بعد الظهر فقط وتفتقر لموعد الاصطحاب، ولا يمكن الاشتراك بها لاشتراك الذهاب والإياب.'
          : 'The selected stop only has an afternoon drop-off time and is missing a pickup time. It cannot be used for a Round Trip subscription.';
      }
      return isAr
        ? 'المحطة المختارة غير محددة المواعيد ولا يمكن الاشتراك بها لاشتراك الذهاب والإياب.'
        : 'The selected stop has no scheduled times and cannot be used for a Round Trip subscription.';
    }

    if (type === 'OneWay' && dir === 'Morning' && !hasPickup) {
      return isAr
        ? 'المحطة المختارة لا تحتوي على موعد اصطحاب صباحي، يرجى اختيار محطة أخرى أو تغيير نوع الاشتراك.'
        : 'The selected stop does not have a morning pickup time. Please choose another stop or subscription type.';
    }

    if (type === 'OneWay' && dir === 'Afternoon' && !hasDropoff) {
      return isAr
        ? 'المحطة المختارة لا تحتوي على موعد عودة بعد الظهر، يرجى اختيار محطة أخرى أو تغيير نوع الاشتراك.'
        : 'The selected stop does not have an afternoon drop-off time. Please choose another stop or subscription type.';
    }

    return isAr
      ? 'المواعيد المطلوبة لهذه المحطة غير مكتملة لنوع الاشتراك المحدد.'
      : 'The required schedule for this stop is not complete for the selected subscription type.';
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
    const label = `${stop.name} • ${parts.join(' | ')}`;

    if (!this.isStopSelectable(stop)) {
      const type = this.selectedTransportType();
      if (type === 'RoundTrip') {
        if (hasPickup && !hasDropoff) {
          return `${label} (${isAr ? 'غير متاحة لذهاب وإياب - بدون عودة' : 'Unavailable for Round Trip - missing dropoff'})`;
        }
        if (!hasPickup && hasDropoff) {
          return `${label} (${isAr ? 'غير متاحة لذهاب وإياب - بدون اصطحاب' : 'Unavailable for Round Trip - missing pickup'})`;
        }
      }
      return `${label} (${isAr ? 'غير متاحة للاشتراك الحالي' : 'Unavailable for current selection'})`;
    }

    return label;
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
    const stop = this.selectedStop();
    if (stop && !this.isStopSelectable(stop)) {
      this.selectedStopId.set(0);
      this.subForm.patchValue({ stopId: 0 }, { emitEvent: false });
    }
  }

  public selectOneWayDirection(direction: OneWayDirection): void {
    this.selectedDirection.set(direction);
    this.directionTouched.set(true);
    this.errorMessage.set(null);

    // Re-validate the currently selected stop against the new direction
    const stop = this.selectedStop();
    if (stop && !this.isStopSelectable(stop)) {
      this.selectedStopId.set(0);
      this.subForm.patchValue({ stopId: 0 }, { emitEvent: false });
    }
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

    if (!this.isStopSelectable(stop)) {
      this.errorMessage.set(
        this.prefs.lang() === 'ar'
          ? 'المحطة المختارة لا تحتوي على المواعيد المطلوبة لنوع الاشتراك المحدد.'
          : 'The selected stop does not have the required schedule for the chosen subscription type.'
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

    this.subscriptionService
      .createSubscription({
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
      })
      .subscribe({
        next: (created) => {
          this.isSubmitting.set(false);
          void this.router.navigate(['/subscription-confirmation', created.referenceNumber]);
        },
        error: (err: HttpErrorResponse) => {
          this.isSubmitting.set(false);
          if (err.status === 0) {
            this.errorMessage.set(
              this.prefs.lang() === 'ar'
                ? 'تعذر الاتصال بالخادم. يرجى التحقق من الاتصال والمحاولة مرة أخرى.'
                : 'Could not connect to the server. Please check your connection and try again.'
            );
          } else if (err.status === 409) {
            this.errorMessage.set(
              this.prefs.lang() === 'ar'
                ? 'هذا الطالب مشترك مسبقاً في هذا المسار.'
                : 'This student is already subscribed to this route.'
            );
          } else if (err.error && typeof err.error === 'object' && 'message' in err.error) {
            this.errorMessage.set(String(err.error.message));
          } else {
            this.errorMessage.set(
              this.prefs.lang() === 'ar'
                ? 'حدث خطأ أثناء إرسال طلب الاشتراك. يرجى المحاولة مرة أخرى.'
                : 'An error occurred while submitting the subscription. Please try again.'
            );
          }
        },
      });
  }
}
