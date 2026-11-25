
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { Header } from '../header/header';
import { AuthService } from '../services/auth.service';
import { PreferencesService } from '../services/preferences.service';
import { RouteItem, RouteService, RouteStop } from '../services/route.service';
import {
  SubscriptionItem,
  SubscriptionService
} from '../services/subscription.service';

type RequestType = 'Cancellation' | 'Modification';

interface TransportationRequest {
  requestId: number;
  subscriptionId: number;
  referenceNumber: string;
  parentEmail: string;
  type: RequestType;
  message: string;
  submittedAt: string;
  status: string;
}

const REQUESTS_KEY = 'stms_transportation_requests';

@Component({
  selector: 'app-my-transportation',
  imports: [Header, RouterLink],
  templateUrl: './my-transportation.html',
  styleUrl: './my-transportation.css',
})
export class MyTransportation implements OnInit {
  protected readonly prefs = inject(PreferencesService);
  protected readonly t = this.prefs.t;

  private readonly authService = inject(AuthService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly routeService = inject(RouteService);

  private readonly routeStopsMap = signal<Record<number, readonly RouteStop[]>>({});
  private readonly loadedStopRoutes = new Set<number>();
  private readonly inFlightStopRoutes = new Set<number>();

  constructor() {
    effect(() => {
      const subs = this.subscriptions();
      this.routeService.routes();
      untracked(() => {
        this.loadMissingStopsForSubscriptions(subs);
      });
    });
  }

  public ngOnInit(): void {
    this.routeService.fetchRoutes().subscribe(() => {
      this.loadMissingStopsForSubscriptions(this.subscriptions());
    });
    this.subscriptionService.fetchSubscriptions().subscribe(() => {
      this.loadMissingStopsForSubscriptions(this.subscriptions());
    });
  }

  private loadMissingStopsForSubscriptions(subs: readonly SubscriptionItem[]): void {
    for (const sub of subs) {
      const matchedRoute = this.findMatchedLiveRoute(sub);
      const routeId = sub.routeId > 0 ? sub.routeId : (matchedRoute?.routeId ?? 0);
      if (routeId > 0) {
        this.ensureStopsLoaded(routeId);
      }
    }
  }

  private ensureStopsLoaded(routeId: number): void {
    if (routeId <= 0 || this.loadedStopRoutes.has(routeId) || this.inFlightStopRoutes.has(routeId)) {
      return;
    }
    this.inFlightStopRoutes.add(routeId);
    this.routeService
      .getStopsByRoute(routeId)
      .pipe(catchError(() => of<RouteStop[] | null>(null)))
      .subscribe((stops) => {
        this.inFlightStopRoutes.delete(routeId);
        if (Array.isArray(stops)) {
          this.loadedStopRoutes.add(routeId);
          this.routeStopsMap.update((prev) => ({
            ...prev,
            [routeId]: stops,
          }));
        }
      });
  }

  protected readonly selectedSubscriptionId = signal<number | null>(null);
  protected readonly selectedRouteDetails = signal<RouteItem | null>(null);
  protected readonly requestSubscriptionId = signal<number | null>(null);
  protected readonly requestType = signal<RequestType>('Cancellation');
  protected readonly requestMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly errorMessage = signal('');

  public readonly subscriptions = computed(() => {
    const email = this.authService.userEmail()?.toLowerCase();
    if (!this.authService.isAuthenticated() || !email) {
      return [];
    }

    return this.subscriptionService
      .subscriptions()
      .filter((sub) => sub.parentEmail?.toLowerCase() === email);
  });

  public readonly selectedSubscription = computed(() => {
    const id = this.selectedSubscriptionId();

    return this.subscriptions().find(
      (sub) => sub.subscriptionId === id
    );
  });

  public readonly totalSubscriptions = computed(
    () => this.subscriptions().length
  );

  public readonly activeSubscriptions = computed(
    () =>
      this.subscriptions().filter(
        (sub) => sub.status === 'Approved'
      ).length
  );

  public readonly pendingSubscriptions = computed(
    () =>
      this.subscriptions().filter(
        (sub) => sub.status === 'Pending' || sub.status === 'AwaitingPayment'
      ).length
  );

  protected readonly isLoggedIn = computed(
    () => this.authService.isAuthenticated()
  );

  protected readonly requestPanelSubscription = computed(() => {
    const id = this.requestSubscriptionId();

    return this.subscriptions().find(
      (sub) => sub.subscriptionId === id
    );
  });

  protected viewDetails(sub: SubscriptionItem): void {
    this.selectedSubscriptionId.set(sub.subscriptionId);
    this.selectedRouteDetails.set(null);
    this.requestSubscriptionId.set(null);
    this.clearMessages();

    const matched = this.findMatchedLiveRoute(sub);
    const routeId = sub.routeId > 0 ? sub.routeId : (matched?.routeId ?? 0);
    if (routeId > 0) {
      this.ensureStopsLoaded(routeId);
      this.routeService
        .getRouteDetails(routeId)
        .pipe(catchError(() => of(null)))
        .subscribe((details) => {
          if (details && this.selectedSubscriptionId() === sub.subscriptionId) {
            this.selectedRouteDetails.set(details);
          }
        });
    }
  }

  protected closeDetails(): void {
    this.selectedSubscriptionId.set(null);
    this.selectedRouteDetails.set(null);
  }

  protected openRequest(
    sub: SubscriptionItem,
    type: RequestType
  ): void {
    this.requestSubscriptionId.set(sub.subscriptionId);
    this.requestType.set(type);
    this.requestMessage.set('');
    this.clearMessages();
  }

  protected closeRequest(): void {
    this.requestSubscriptionId.set(null);
    this.requestMessage.set('');
    this.clearMessages();
  }

  protected submitRequest(): void {
    const sub = this.requestPanelSubscription();
    const email = this.authService.userEmail()?.toLowerCase();

    if (!sub || !email) {
      this.errorMessage.set(
        this.prefs.lang() === 'ar'
          ? 'تعذر العثور على الاشتراك.'
          : 'Unable to find the subscription.'
      );
      return;
    }

    const message = this.requestMessage().trim();

    if (!message) {
      this.errorMessage.set(
        this.prefs.lang() === 'ar'
          ? 'يرجى كتابة سبب الطلب.'
          : 'Please enter a reason for your request.'
      );
      return;
    }

    const requests = this.loadRequests();

    const newRequest: TransportationRequest = {
      requestId: Date.now(),
      subscriptionId: sub.subscriptionId,
      referenceNumber: sub.referenceNumber,
      parentEmail: email,
      type: this.requestType(),
      message,
      submittedAt: new Date().toISOString(),
      status: 'Pending Administration Review',
    };

    requests.push(newRequest);

    try {
      localStorage.setItem(
        REQUESTS_KEY,
        JSON.stringify(requests)
      );

      this.successMessage.set(
        this.prefs.lang() === 'ar'
          ? 'تم تسجيل طلبك بنجاح. وهو بانتظار مراجعة الإدارة.'
          : 'Your request has been recorded and is awaiting administration review.'
      );

      this.requestMessage.set('');
      this.requestSubscriptionId.set(null);
    } catch {
      this.errorMessage.set(
        this.prefs.lang() === 'ar'
          ? 'تعذر حفظ الطلب.'
          : 'Unable to save your request.'
      );
    }
  }

  private loadRequests(): TransportationRequest[] {
    try {
      const stored = localStorage.getItem(REQUESTS_KEY);

      return stored ? JSON.parse(stored) as TransportationRequest[] : [];
    } catch {
      return [];
    }
  }

  protected statusText(status: string): string {
    if (this.prefs.lang() === 'ar') {
      switch (status) {
        case 'Approved': return 'تمت الموافقة';
        case 'Pending': return 'قيد الانتظار';
        case 'AwaitingPayment': return 'بانتظار سداد الرسوم';
        case 'Rejected': return 'مرفوض';
        case 'Cancelled': return 'ملغي';
        default: return status;
      }
    }

    switch (status) {
      case 'Approved': return 'Approved';
      case 'Pending': return 'Pending Approval';
      case 'AwaitingPayment': return 'Awaiting Payment';
      case 'Rejected': return 'Rejected';
      case 'Cancelled': return 'Cancelled';
      default: return status;
    }
  }

  public formatRoute(sub: SubscriptionItem): string {
    const matched = sub.routeId > 0 ? this.routeService.findLiveRouteById(sub.routeId) : undefined;
    const rawNum = (sub.routeNumber || matched?.routeNumber || '').trim();
    const num = rawNum === '-' || rawNum === '—' ? '' : rawNum;
    let name = (sub.routeName || matched?.name || '').trim();
    // Clean any leading dash/hyphen or bullet
    name = name.replace(/^[-–—•]\s*/, '');

    if (num && name) {
      if (name.startsWith(num)) {
        return name;
      }
      return `${num} - ${name}`;
    }
    return name || num || (this.prefs.lang() === 'ar' ? 'غير محدد' : 'Unassigned');
  }

  public assignedBusText(sub: SubscriptionItem): string {
    const isAr = this.prefs.lang() === 'ar';
    const route = this.selectedRouteDetails() ?? this.findMatchedLiveRoute(sub);

    const explicit = this.firstNonEmpty([
      this.extractBusLabel(route),
      sub.assignedBus,
      sub.busPlate,
    ]);
    if (explicit) return explicit;

    const busId = route?.busId ?? sub.busId ?? null;
    if (typeof busId === 'number' && busId > 0) {
      return isAr ? `حافلة معيّنة (رقم ${busId})` : `Assigned (Bus #${busId})`;
    }

    return isAr ? 'لم يتم التعيين بعد' : 'Not assigned yet';
  }

  public assignedDriverText(sub: SubscriptionItem): string {
    const isAr = this.prefs.lang() === 'ar';
    const route = this.selectedRouteDetails() ?? this.findMatchedLiveRoute(sub);

    const explicit = this.firstNonEmpty([
      this.extractDriverLabel(route),
      sub.assignedDriver,
      sub.driverName,
    ]);
    if (explicit) return explicit;

    const driverId = route?.driverId ?? sub.driverId ?? null;
    if (typeof driverId === 'number' && driverId > 0) {
      return isAr ? `سائق معيّن (رقم ${driverId})` : `Assigned (Driver #${driverId})`;
    }

    return isAr ? 'لم يتم التعيين بعد' : 'Not assigned yet';
  }

  private findMatchedLiveRoute(sub: SubscriptionItem): RouteItem | undefined {
    if (!this.routeService.hasBackendRoutes()) return undefined;
    if (sub.routeId > 0) {
      const byId = this.routeService.findLiveRouteById(sub.routeId);
      if (byId) return byId;
    }
    const cleanSubName = (sub.routeName || '').replace(/^[-–—•]\s*/, '').trim().toLowerCase();
    if (!cleanSubName) return undefined;
    return this.routeService
      .routes()
      .find((r) => (r.name || '').trim().toLowerCase() === cleanSubName);
  }

  private extractBusLabel(route?: RouteItem): string {
    if (!route) return '';
    return this.firstNonEmpty([
      route.busPlate,
      route.assignedBus,
      route.plateNumber,
      route.bus?.plateNumber,
      route.bus?.busPlate,
    ]);
  }

  private extractDriverLabel(route?: RouteItem): string {
    if (!route) return '';
    const nestedDriver =
      typeof route.driver === 'string'
        ? route.driver
        : route.driver?.fullName ?? route.driver?.name;
    return this.firstNonEmpty([route.driverName, route.assignedDriver, nestedDriver]);
  }

  private firstNonEmpty(values: readonly (string | null | undefined)[]): string {
    for (const val of values) {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed && trimmed !== '—' && trimmed !== '-') {
          return trimmed;
        }
      }
    }
    return '';
  }

  public morningPickupTime(sub: SubscriptionItem): string {
    if (sub.transportType === 'OneWay' && this.isExplicitAfternoonOnly(sub.direction)) {
      return '';
    }
    const raw = this.resolveStopTime(sub, 'pickup');
    return raw ? this.formatTime(raw) : '';
  }

  public afternoonDropoffTime(sub: SubscriptionItem): string {
    if (sub.transportType === 'OneWay' && this.isExplicitMorningOnly(sub.direction)) {
      return '';
    }
    const raw = this.resolveStopTime(sub, 'dropoff');
    return raw ? this.formatTime(raw) : '';
  }

  public hasAmbiguousOneWaySchedule(sub: SubscriptionItem): boolean {
    return (
      sub.transportType === 'OneWay' &&
      !this.isExplicitMorningOnly(sub.direction) &&
      !this.isExplicitAfternoonOnly(sub.direction) &&
      (this.hasTime(this.morningPickupTime(sub)) || this.hasTime(this.afternoonDropoffTime(sub)))
    );
  }

  private resolveStopTime(sub: SubscriptionItem, kind: 'pickup' | 'dropoff'): string {
    const direct = kind === 'pickup' ? sub.pickupTime : sub.dropoffTime;
    if (this.hasTime(direct)) {
      return direct.trim();
    }

    const matchedStop = this.findMatchedStop(sub);
    const stopVal = matchedStop
      ? kind === 'pickup'
        ? matchedStop.pickupTime
        : matchedStop.dropoffTime
      : '';
    return this.hasTime(stopVal) ? stopVal.trim() : '';
  }

  private findMatchedStop(sub: SubscriptionItem): RouteStop | undefined {
    const liveRoute = this.selectedRouteDetails()?.routeId === sub.routeId
      ? this.selectedRouteDetails()!
      : this.findMatchedLiveRoute(sub);
    const routeId = sub.routeId > 0 ? sub.routeId : (liveRoute?.routeId ?? 0);

    const stops: readonly RouteStop[] =
      (routeId > 0 ? this.routeStopsMap()[routeId] : undefined) ??
      liveRoute?.stops ??
      [];

    if (stops.length === 0) return undefined;

    if (sub.stopId > 0) {
      const byId = stops.find((s) => Number(s.stopId) === sub.stopId);
      if (byId) return byId;
    }

    const cleanName = (sub.stopName || '').trim().toLowerCase();
    if (!cleanName) return undefined;
    return stops.find((s) => (s.name || '').trim().toLowerCase() === cleanName);
  }

  private isExplicitMorningOnly(direction?: string | null): boolean {
    const d = (direction ?? '').trim().toLowerCase();
    return d === 'morning' || d === 'pickup' || d === 'morningpickup' || d === 'topschool' || d === 'outbound';
  }

  private isExplicitAfternoonOnly(direction?: string | null): boolean {
    const d = (direction ?? '').trim().toLowerCase();
    return d === 'afternoon' || d === 'dropoff' || d === 'afternoondropoff' || d === 'return' || d === 'inbound';
  }

  private formatTime(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';

    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
    if (!match) return trimmed;

    const hour24 = Number(match[1]);
    const minute = match[2];
    if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) return trimmed;

    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${minute} ${suffix}`;
  }

  public hasTime(time?: string | null): boolean {
    if (!time) return false;
    const trimmed = time.trim();
    return trimmed.length > 0 && trimmed !== '—' && trimmed !== '-' && trimmed !== 'null' && trimmed !== 'undefined';
  }

  protected clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
