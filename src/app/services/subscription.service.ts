import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
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
  readonly isRegistrationOpen: boolean;
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
    return this.http.get<SubscriptionItem[]>('/api/subscriptions').pipe(
      tap((items) => {
        if (Array.isArray(items)) {
          const email = this.authService.userEmail()?.toLowerCase() ?? '';
          const mapped = items.map((item) => ({
            ...item,
            parentEmail: item.parentEmail || email,
          }));
          this.subscriptionsSignal.set(mapped);
          this.persist(mapped);
        }
      }),
      catchError(() => of(this.subscriptionsSignal()))
    );
  }

  public getRegistrationInfo(): Observable<RegistrationInfo> {
    return this.http.get<RegistrationInfo>('/api/subscriptions/registration-info').pipe(
      catchError(() =>
        of({
          semesterName: 'Second Semester 2026/2027',
          startDate: '2027-01-15',
          endDate: '2027-05-31',
          registrationOpenDate: '2027-01-01',
          isRegistrationOpen: true,
        })
      )
    );
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
