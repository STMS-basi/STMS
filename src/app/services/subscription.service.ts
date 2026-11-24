import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { AuthService } from './auth.service';

export type TransportType = 'OneWay' | 'RoundTrip';
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
}

export interface RegistrationInfo {
  readonly semesterName: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly registrationOpenDate: string;
  readonly registrationOpen: boolean;
  readonly isRegistrationOpen: boolean;
  readonly message?: string;
}

/** Raw shape returned by GET /api/subscriptions/registration-info */
interface RegistrationInfoRaw {
  readonly registrationOpen?: boolean | string | number;
  readonly isRegistrationOpen?: boolean | string | number;
  readonly semesterName?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly registrationOpenDate?: string;
  readonly message?: string;
}

const STORAGE_SUBSCRIPTIONS_KEY = 'stms_subscriptions';

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly subscriptionsSignal = signal<SubscriptionItem[]>(
    this.loadStoredSubscriptions()
  );

  public readonly subscriptions = this.subscriptionsSignal.asReadonly();

  private loadStoredSubscriptions(): SubscriptionItem[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_SUBSCRIPTIONS_KEY);

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
          STORAGE_SUBSCRIPTIONS_KEY,
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
    return this.http.get<unknown[]>('/api/subscriptions').pipe(
      map((items) => {
        if (!Array.isArray(items)) return [];
        const email = this.authService.userEmail()?.toLowerCase() ?? '';
        return items.map((raw: any): SubscriptionItem => ({
          subscriptionId: Number(raw.subscriptionId ?? raw.id ?? 0),
          referenceNumber: String(raw.referenceNumber ?? ''),
          studentId: Number(raw.studentId ?? 0),
          studentName: String(raw.studentName ?? raw.student ?? ''),
          studentGrade: String(raw.studentGrade ?? raw.grade ?? ''),
          routeId: Number(raw.routeId ?? 0),
          routeNumber: String(raw.routeNumber ?? raw.route?.routeNumber ?? ''),
          routeName: String(raw.routeName ?? raw.route?.name ?? raw.route?.routeName ?? ''),
          stopId: Number(raw.stopId ?? 0),
          stopName: String(raw.stopName ?? raw.stop?.name ?? ''),
          pickupTime: String(raw.pickupTime ?? raw.pickUpTime ?? raw.stop?.pickupTime ?? ''),
          dropoffTime: String(raw.dropoffTime ?? raw.dropOffTime ?? raw.stop?.dropoffTime ?? ''),
          transportType: (raw.transportType === 'OneWay' ? 'OneWay' : 'RoundTrip') as TransportType,
          fee: Number(raw.fee ?? (raw.transportType === 'OneWay' ? 150 : 300)),
          status: (raw.status ?? 'Pending') as SubscriptionStatus,
          startDate: String(raw.startDate ?? '2026-09-01'),
          endDate: String(raw.endDate ?? '2026-12-31'),
          requestedAt: String(raw.requestedAt ?? raw.createdAt ?? new Date().toISOString()),
          parentEmail: String(raw.parentEmail || email),
        }));
      }),
      tap((mapped) => {
        if (mapped.length > 0) {
          this.subscriptionsSignal.set(mapped);
          this.persist(mapped);
        }
      }),
      catchError(() => of(this.subscriptionsSignal()))
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
          registrationOpen: true,
          isRegistrationOpen: true,
          message: 'Registration is open',
        })
      )
    );
  }

  private mapRegistrationInfo(raw: RegistrationInfoRaw): RegistrationInfo {
    const rawVal = raw.registrationOpen ?? raw.isRegistrationOpen;
    const isOpen = rawVal === true || rawVal === 'true' || rawVal === 1;

    let openDateStr = '';
    if (raw.registrationOpenDate) {
      openDateStr = this.formatDate(raw.registrationOpenDate);
    } else if (raw.startDate) {
      try {
        const d = new Date(raw.startDate);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() - 14);
          openDateStr = this.formatDate(d.toISOString());
        }
      } catch {
        openDateStr = '';
      }
    }

    return {
      semesterName: raw.semesterName ?? 'First Semester 2026/2027',
      startDate: this.formatDate(raw.startDate ?? ''),
      endDate: this.formatDate(raw.endDate ?? ''),
      registrationOpenDate: openDateStr,
      registrationOpen: isOpen,
      isRegistrationOpen: isOpen,
      message: raw.message,
    };
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
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
  ): SubscriptionItem {
    const id = Date.now();
    const referenceNumber = this.generateReferenceNumber();
    const requestedAt = new Date().toISOString();

    const newSub: SubscriptionItem = {
      subscriptionId: id,
      referenceNumber,
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
      fee: payload.fee,
      status: 'Pending',
      startDate: payload.startDate ?? '2027-01-15',
      endDate: payload.endDate ?? '2027-05-31',
      requestedAt,
      parentEmail: this.authService.userEmail()?.toLowerCase() ?? '',
    };

    const updated = [newSub, ...this.subscriptionsSignal()];
    this.subscriptionsSignal.set(updated);
    this.persist(updated);

    // Dispatch real HTTP POST to /api/subscriptions
    const requestBody = {
      studentId: payload.studentId,
      routeId: payload.routeId,
      stopId: payload.stopId,
      transportType: payload.transportType,
    };

    this.http
      .post<BackendSubscriptionResponse>('/api/subscriptions', requestBody)
      .pipe(
        tap((res) => {
          if (res && res.referenceNumber) {
            const synced = this.subscriptionsSignal().map((s) =>
              s.subscriptionId === id
                ? {
                    ...s,
                    subscriptionId: res.subscriptionId ?? s.subscriptionId,
                    referenceNumber: res.referenceNumber,
                    fee: res.fee ?? s.fee,
                    startDate: res.startDate ?? s.startDate,
                    endDate: res.endDate ?? s.endDate,
                  }
                : s
            );
            this.subscriptionsSignal.set(synced);
            this.persist(synced);
          }
        }),
        catchError(() => of(null))
      )
      .subscribe();

    return newSub;
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
