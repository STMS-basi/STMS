import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { AuthService } from '../services/auth.service';
import { PreferencesService } from '../services/preferences.service';
import { RouteItem, RouteService, RouteStop } from '../services/route.service';
import { StudentItem, StudentService } from '../services/student.service';
import { RegistrationInfo, SubscriptionService, TransportType } from '../services/subscription.service';

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
    return this.routes().filter((r) => {
      if (r.isActive === false) return false;
      const num = r.routeNumber?.toUpperCase() ?? '';
      const name = r.name?.toUpperCase() ?? '';
      if (num.startsWith('TEST') || name.startsWith('TEST')) return false;
      return true;
    });
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
    if (!r) return 0;
    const enrolled = typeof r.enrolledStudents === 'number' && !isNaN(r.enrolledStudents) ? r.enrolledStudents : 0;
    const capacity = typeof r.capacity === 'number' && !isNaN(r.capacity) ? r.capacity : 30;
    return Math.max(0, capacity - enrolled);
  });

  public readonly isRouteFull = computed<boolean>(() => {
    const r = this.selectedRoute();
    return Boolean(r && this.remainingSeats() <= 0);
  });

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
      this.selectedTransportType.set(type as TransportType);
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
