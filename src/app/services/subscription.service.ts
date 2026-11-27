import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { RouteService } from './route.service';

export type TransportType = 'OneWay' | 'RoundTrip';
export type OneWayDirection = 'Morning' | 'Afternoon';
export type TripDirection = 'MorningPickup' | 'AfternoonDropoff' | 'Both';
export type SubscriptionStatus = 'Pending' | 'AwaitingPayment' | 'Approved' | 'Rejected';

export interface SubscriptionItem {
  readonly subscriptionId: number;
  readonly referenceNumber: string;
  readonly studentId: number;
  readonly studentName: string;
  readonly studentGrade: string;
  readonly routeId: number;
  readonly routeNumber: string;
  readonly routeName: string;
  readonly stopId: number;
  readonly stopName: string;
  readonly pickupTime: string;
  readonly dropoffTime: string;
  readonly transportType: TransportType;
  readonly fee: number;
  readonly status: SubscriptionStatus;
  readonly startDate: string;
  readonly endDate: string;
  readonly requestedAt: string;
  readonly parentEmail?: string;
  readonly busId?: number | null;
  readonly busPlate?: string | null;
  readonly assignedBus?: string | null;
  readonly driverId?: number | null;
  readonly driverName?: string | null;
  readonly assignedDriver?: string | null;
  readonly direction?: string | null;
}

export interface CreateSubscriptionPayload {
  readonly studentId: number;
  readonly studentName: string;
  readonly studentGrade: string;
  readonly routeId: number;
  readonly routeNumber: string;
  readonly routeName: string;
  readonly stopId: number;
  readonly stopName: string;
  readonly pickupTime: string;
  readonly dropoffTime: string;
  readonly transportType: TransportType;
  readonly direction?: OneWayDirection | null;
  readonly fee: number;
  readonly startDate?: string;
  readonly endDate?: string;
}

export interface BackendSubscriptionResponse {
  readonly subscriptionId: number;
  readonly referenceNumber: string;
  readonly fee?: number;
  readonly status?: SubscriptionStatus;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly tripDirection?: TripDirection | string | null;
  readonly transportType?: TransportType | string | null;
  readonly direction?: string | null;
}

export interface RegistrationInfo {
  readonly semesterName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly registrationOpenDate: string;
  readonly rawStartDate?: string;
  readonly rawEndDate?: string;
  readonly rawRegistrationOpenDate?: string;
  readonly registrationOpen: boolean;
  readonly isRegistrationOpen: boolean;
  readonly message?: string;
}

/** Raw shape returned by GET /api/subscriptions/registration-info */
interface RegistrationInfoRaw {
  readonly registrationOpen?: boolean | string | number;
  readonly isRegistrationOpen?: boolean | string | number;
  readonly RegistrationOpen?: boolean | string | number;
  readonly IsRegistrationOpen?: boolean | string | number;
  readonly isOpen?: boolean | string | number;
  readonly IsOpen?: boolean | string | number;
  readonly semesterName?: string;
  readonly SemesterName?: string;
  readonly startDate?: string;
  readonly StartDate?: string;
  readonly endDate?: string;
  readonly EndDate?: string;
  readonly registrationOpenDate?: string;
  readonly RegistrationOpenDate?: string;
  readonly message?: string;
  readonly Message?: string;
}

const STORAGE_SUBSCRIPTIONS_KEY = 'stms_subscriptions';

/** Map frontend OneWayDirection to backend tripDirection */
function toTripDirection(transportType: TransportType, direction?: OneWayDirection | null): TripDirection {
  if (transportType === 'OneWay') {
    if (direction === 'Morning') return 'MorningPickup';
    if (direction === 'Afternoon') return 'AfternoonDropoff';
  }
  return 'Both';
}

/** Map backend tripDirection back to frontend OneWayDirection */
function fromTripDirection(tripDir?: TripDirection | string | null): OneWayDirection | null {
  if (!tripDir) return null;
  const normalized = String(tripDir).trim();
  if (normalized === 'MorningPickup') return 'Morning';
  if (normalized === 'AfternoonDropoff') return 'Afternoon';
  // Legacy values passthrough
  if (normalized === 'Morning') return 'Morning';
  if (normalized === 'Afternoon') return 'Afternoon';
  return null;
}

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly routeService = inject(RouteService);

  private readonly subscriptionsSignal = signal<SubscriptionItem[]>(
    this.loadStoredSubscriptions()
  );

  public readonly subscriptions = this.subscriptionsSignal.asReadonly();
  private activeStorageKey = this.getStorageKey();

  constructor() {
    effect(() => {
      const nextKey = this.getStorageKey();
      if (nextKey !== this.activeStorageKey) {
        this.activeStorageKey = nextKey;
        untracked(() => {
          this.subscriptionsSignal.set(this.loadStoredSubscriptions());
        });
      }
    });
  }

  private getStorageKey(): string {
    const email = this.authService.userEmail()?.trim().toLowerCase();
    return email ? `${STORAGE_SUBSCRIPTIONS_KEY}_${email}` : `${STORAGE_SUBSCRIPTIONS_KEY}_guest`;
  }

  private loadStoredSubscriptions(): SubscriptionItem[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(this.getStorageKey());

        if (stored) {
          return JSON.parse(stored) as SubscriptionItem[];
        }
      }
    } catch {
      // Ignore storage errors
    }

    return [];
  }

  private persist(items: SubscriptionItem[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(
          this.getStorageKey(),
          JSON.stringify(items)
        );
      }
    } catch {
      // Ignore storage errors
    }
  }

  public generateReferenceNumber(): string {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `SUB 2026 ${randomDigits}`;
  }

  public fetchSubscriptions(): Observable<SubscriptionItem[]> {
    const currentLocal = this.loadStoredSubscriptions();
    this.subscriptionsSignal.set(currentLocal);

    return this.http.get<unknown[]>('/api/subscriptions').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        const email = this.authService.userEmail()?.trim().toLowerCase() ?? '';
        return items.map((raw: any): SubscriptionItem => {
          const routeId = Number(raw.routeId ?? raw.route?.routeId ?? 0);
          const matchedRoute = routeId > 0 ? this.routeService.findLiveRouteById(routeId) : undefined;
          const stopId = Number(raw.stopId ?? raw.stop?.stopId ?? 0);
          const stopName = String(raw.stopName ?? raw.stop?.name ?? '').trim();
          const matchedStop = matchedRoute?.stops?.find(
            (st) =>
              (stopId > 0 && st.stopId === stopId) ||
              (stopName && st.name.trim().toLowerCase() === stopName.toLowerCase())
          );
          const rawNum = String(raw.routeNumber ?? raw.route?.routeNumber ?? '').trim();
          const cleanNum = rawNum && rawNum !== '-' && rawNum !== '—' ? rawNum : matchedRoute?.routeNumber ?? '';
          const rawName = String(
            raw.routeName ?? raw.route?.name ?? raw.route?.routeName ?? matchedRoute?.name ?? ''
          )
            .trim()
            .replace(/^[-–—•]\s*/, '');

          const subscriptionId = Number(raw.subscriptionId ?? raw.id ?? 0);
          const referenceNumber = String(raw.referenceNumber ?? '');
          const localMatch = currentLocal.find(
            (item) =>
              (subscriptionId > 0 && item.subscriptionId === subscriptionId) ||
              (referenceNumber &&
                item.referenceNumber.trim().toUpperCase() === referenceNumber.trim().toUpperCase())
          );

          return {
            subscriptionId,
            referenceNumber,
            studentId: Number(raw.studentId ?? 0),
            studentName: String(raw.studentName ?? raw.student ?? ''),
            studentGrade: String(raw.studentGrade ?? raw.grade ?? ''),
            routeId,
            routeNumber: cleanNum,
            routeName: rawName,
            stopId,
            stopName,
            pickupTime: String(
              raw.pickupTime ?? raw.pickUpTime ?? raw.stop?.pickupTime ?? raw.stop?.pickUpTime ?? matchedStop?.pickupTime ?? ''
            ),
            dropoffTime: String(
              raw.dropoffTime ?? raw.dropOffTime ?? raw.stop?.dropoffTime ?? raw.stop?.dropOffTime ?? matchedStop?.dropoffTime ?? ''
            ),
            direction:
              raw.transportType === 'OneWay'
                ? (fromTripDirection(raw.tripDirection) ??
                   fromTripDirection(raw.direction) ??
                   fromTripDirection(raw.oneWayDirection) ??
                   localMatch?.direction ??
                   null)
                : null,
            transportType: (raw.transportType === 'OneWay' ? 'OneWay' : 'RoundTrip') as TransportType,
            fee: Number(raw.fee ?? (raw.transportType === 'OneWay' ? 150 : 300)),
            status: (raw.status ?? 'Pending') as SubscriptionStatus,
            startDate: String(raw.startDate ?? '2026-09-01'),
            endDate: String(raw.endDate ?? '2026-12-31'),
            requestedAt: String(raw.requestedAt ?? raw.createdAt ?? new Date().toISOString()),
            parentEmail: String(raw.parentEmail || email).toLowerCase(),
            busId:
              Number(raw.busId ?? raw.route?.busId ?? matchedRoute?.busId ?? 0) || null,
            busPlate:
              String(
                raw.busPlate ??
                  raw.plateNumber ??
                  raw.assignedBus ??
                  raw.bus?.plateNumber ??
                  raw.bus?.busPlate ??
                  raw.route?.busPlate ??
                  raw.route?.bus?.plateNumber ??
                  matchedRoute?.busPlate ??
                  matchedRoute?.assignedBus ??
                  matchedRoute?.bus?.plateNumber ??
                  ''
              ).trim() || null,
            driverId:
              Number(raw.driverId ?? raw.route?.driverId ?? matchedRoute?.driverId ?? 0) || null,
            driverName:
              String(
                raw.driverName ??
                  raw.assignedDriver ??
                  (typeof raw.driver === 'string' ? raw.driver : raw.driver?.fullName ?? raw.driver?.name) ??
                  raw.route?.driverName ??
                  raw.route?.driver?.fullName ??
                  matchedRoute?.driverName ??
                  matchedRoute?.assignedDriver ??
                  (typeof matchedRoute?.driver === 'string'
                    ? matchedRoute.driver
                    : matchedRoute?.driver?.fullName ?? matchedRoute?.driver?.name) ??
                  ''
              ).trim() || null,
          };
        });
      }),
      tap((mapped) => {
        this.subscriptionsSignal.set(mapped);
        this.persist(mapped);
      }),
      catchError(() => of(currentLocal))
    );
  }

  public getRegistrationInfo(): Observable<RegistrationInfo> {
    return this.http.get<RegistrationInfoRaw>('/api/subscriptions/registration-info').pipe(
      map((raw) => this.mapRegistrationInfo(raw)),
      catchError(() =>
        of({
          semesterName: 'First Semester 2026/2027',
          startDate: this.formatDate('2026-09-01'),
          endDate: this.formatDate('2026-12-31'),
          registrationOpenDate: this.formatDate('2026-08-18'),
          rawStartDate: '2026-09-01',
          rawEndDate: '2026-12-31',
          rawRegistrationOpenDate: '2026-08-18',
          registrationOpen: true,
          isRegistrationOpen: true,
          message: 'Registration is open',
        })
      )
    );
  }

  private mapRegistrationInfo(raw: RegistrationInfoRaw): RegistrationInfo {
    const rawVal =
      raw.registrationOpen ??
      raw.isRegistrationOpen ??
      raw.RegistrationOpen ??
      raw.IsRegistrationOpen ??
      raw.isOpen ??
      raw.IsOpen;
    const isOpen = rawVal === true || rawVal === 'true' || rawVal === 1 || rawVal === '1';

    const rawStartInput = raw.startDate ?? raw.StartDate ?? '';
    const rawEndInput = raw.endDate ?? raw.EndDate ?? '';
    const rawOpenInput = raw.registrationOpenDate ?? raw.RegistrationOpenDate ?? '';

    const rawStartIso = this.toIsoDateString(rawStartInput);
    const rawEndIso = this.toIsoDateString(rawEndInput);
    let rawOpenIso = this.toIsoDateString(rawOpenInput);

    if (!rawOpenIso && rawStartIso) {
      const startParsed = this.parseCalendarDate(rawStartIso);
      if (startParsed) {
        startParsed.setDate(startParsed.getDate() - 14);
        rawOpenIso = this.toIsoDateFromDate(startParsed);
      }
    }

    return {
      semesterName: raw.semesterName ?? raw.SemesterName ?? 'First Semester 2026/2027',
      startDate: this.formatDate(rawStartIso || rawStartInput),
      endDate: this.formatDate(rawEndIso || rawEndInput),
      registrationOpenDate: this.formatDate(rawOpenIso || rawOpenInput),
      rawStartDate: rawStartIso || undefined,
      rawEndDate: rawEndIso || undefined,
      rawRegistrationOpenDate: rawOpenIso || undefined,
      registrationOpen: isOpen,
      isRegistrationOpen: isOpen,
      message: raw.message ?? raw.Message,
    };
  }

  private parseCalendarDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      return new Date(year, month - 1, day);
    }
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private toIsoDateString(dateStr: string): string {
    const parsed = this.parseCalendarDate(dateStr);
    return parsed ? this.toIsoDateFromDate(parsed) : '';
  }

  private toIsoDateFromDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = this.parseCalendarDate(dateStr);
      if (!date) return dateStr;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  public createSubscription(
    payload: CreateSubscriptionPayload
  ): Observable<SubscriptionItem> {
    const requestedAt = new Date().toISOString();
    const tripDirection = toTripDirection(payload.transportType, payload.direction);

    const requestBody: Record<string, unknown> = {
      studentId: payload.studentId,
      routeId: payload.routeId,
      stopId: payload.stopId,
      transportType: payload.transportType,
      tripDirection,
    };

    return this.http
      .post<BackendSubscriptionResponse>('/api/subscriptions', requestBody)
      .pipe(
        map((res) => {
          const newSub: SubscriptionItem = {
            subscriptionId: res.subscriptionId ?? Date.now(),
            referenceNumber: res.referenceNumber ?? this.generateReferenceNumber(),
            studentId: payload.studentId,
            studentName: payload.studentName,
            studentGrade: payload.studentGrade,
            routeId: payload.routeId,
            routeNumber: payload.routeNumber,
            routeName: payload.routeName,
            stopId: payload.stopId,
            stopName: payload.stopName,
            pickupTime: payload.pickupTime,
            dropoffTime: payload.dropoffTime,
            transportType: payload.transportType,
            direction:
              payload.transportType === 'OneWay'
                ? (fromTripDirection(res.tripDirection) ?? payload.direction ?? null)
                : null,
            fee: res.fee ?? payload.fee,
            status: (res.status ?? 'Pending') as SubscriptionStatus,
            startDate: res.startDate ?? payload.startDate ?? '2027-01-15',
            endDate: res.endDate ?? payload.endDate ?? '2027-05-31',
            requestedAt,
            parentEmail: this.authService.userEmail()?.toLowerCase() ?? '',
          };

          const updated = [newSub, ...this.subscriptionsSignal()];
          this.subscriptionsSignal.set(updated);
          this.persist(updated);
          return newSub;
        })
      );
  }

  public getByReference(
    referenceNumber: string
  ): SubscriptionItem | undefined {
    const cleaned = referenceNumber.trim().toUpperCase();

    return this.subscriptionsSignal().find(
      (sub) =>
        sub.referenceNumber.trim().toUpperCase() === cleaned
    );
  }

  public getById(id: number): SubscriptionItem | undefined {
    return this.subscriptionsSignal().find(
      (sub) => sub.subscriptionId === id
    );
  }
}
