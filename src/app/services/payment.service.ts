import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { AuthService } from './auth.service';

export interface BackendPaymentItem {
  readonly paymentId: number;
  readonly subscriptionId?: number;
  readonly studentName?: string;
  readonly studentGrade?: string;
  readonly parentName?: string;
  readonly parentEmail?: string;
  readonly routeId?: number;
  readonly routeNumber?: string;
  readonly routeName?: string;
  readonly stopName?: string;
  readonly transportType?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly subscriptionStatus?: string;
  readonly amountDue?: number;
  readonly amount?: number;
  readonly amountPaid?: number;
  readonly remainingAmount?: number;
  readonly outstandingBalance?: number;
  readonly paymentStatus?: string;
  readonly paymentDate?: string;
  readonly createdAt?: string;
  readonly recordedBy?: string;
  readonly referenceNumber?: string;
  readonly notes?: string;
}

export interface RecordPaymentRequest {
  readonly subscriptionId: number;
  readonly amount: number;
  readonly notes?: string;
}

const STORAGE_KEY_PAYMENTS = 'stms_my_payments';

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly paymentsSignal = signal<BackendPaymentItem[]>(this.loadStored());
  public readonly payments = this.paymentsSignal.asReadonly();
  private activeStorageKey = this.getStorageKey();

  constructor() {
    effect(() => {
      const nextKey = this.getStorageKey();
      if (nextKey !== this.activeStorageKey) {
        this.activeStorageKey = nextKey;
        untracked(() => {
          this.paymentsSignal.set(this.loadStored());
        });
      }
    });
  }

  private getStorageKey(): string {
    const email = this.authService.userEmail()?.trim().toLowerCase();
    return email ? `${STORAGE_KEY_PAYMENTS}_${email}` : `${STORAGE_KEY_PAYMENTS}_guest`;
  }

  public fetchMyPayments(): Observable<BackendPaymentItem[]> {
    const currentLocal = this.loadStored();
    this.paymentsSignal.set(currentLocal);

    return this.http.get<unknown[]>('/api/payments/my').pipe(
      map((items) =>
        Array.isArray(items) ? items.map((item) => this.normalizePaymentItem(item)) : []
      ),
      tap((items) => {
        this.paymentsSignal.set(items);
        this.persist(items);
      }),
      catchError(() => of(currentLocal))
    );
  }

  public fetchAdminPayments(): Observable<BackendPaymentItem[]> {
    return this.http.get<BackendPaymentItem[]>('/api/payments/admin').pipe(
      tap((items) => {
        if (Array.isArray(items)) {
          this.paymentsSignal.set(items);
        }
      }),
      catchError(() => of(this.paymentsSignal()))
    );
  }

  public recordPayment(payload: RecordPaymentRequest): Observable<unknown> {
    return this.http.post('/api/payments/admin', payload);
  }

  private normalizePaymentItem(rawInput: unknown): BackendPaymentItem {
    const raw = (rawInput && typeof rawInput === 'object' ? rawInput : {}) as Record<string, unknown>;
    const sub = this.asRecord(raw['subscription'] ?? raw['Subscription']);
    const student = this.asRecord(raw['student'] ?? raw['Student'] ?? sub?.['student'] ?? sub?.['Student']);
    const route = this.asRecord(raw['route'] ?? raw['Route'] ?? sub?.['route'] ?? sub?.['Route']);
    const stop = this.asRecord(raw['stop'] ?? raw['Stop'] ?? sub?.['stop'] ?? sub?.['Stop']);
    const currentEmail = this.authService.userEmail()?.trim().toLowerCase();

    const paymentId = Number(raw['paymentId'] ?? raw['PaymentId'] ?? raw['id'] ?? raw['Id'] ?? 0) || 0;
    const subscriptionId = this.pickNumber(raw, ['subscriptionId', 'SubscriptionId']) ??
      this.pickNumber(sub, ['subscriptionId', 'SubscriptionId', 'id', 'Id']);

    const amountDue = this.pickNumber(raw, ['amountDue', 'AmountDue', 'totalFee', 'TotalFee']) ??
      this.pickNumber(sub, ['fee', 'Fee']);
    const amount = this.pickNumber(raw, ['amount', 'Amount']);
    const amountPaid = this.pickNumber(raw, ['amountPaid', 'AmountPaid']);
    const remainingAmount = this.pickNumber(raw, ['remainingAmount', 'RemainingAmount']);
    const outstandingBalance = this.pickNumber(raw, ['outstandingBalance', 'OutstandingBalance']);

    return {
      paymentId,
      subscriptionId,
      referenceNumber:
        this.pickString(raw, ['referenceNumber', 'ReferenceNumber', 'subscriptionReference']) ||
        this.pickString(sub, ['referenceNumber', 'ReferenceNumber']),
      studentName:
        this.pickString(raw, ['studentName', 'StudentName']) ||
        this.pickString(student, ['fullName', 'FullName', 'name', 'Name']),
      studentGrade:
        this.pickString(raw, ['studentGrade', 'StudentGrade', 'grade', 'Grade']) ||
        this.pickString(student, ['grade', 'Grade']),
      parentName: this.pickString(raw, ['parentName', 'ParentName']),
      parentEmail:
        (this.pickString(raw, ['parentEmail', 'ParentEmail']) || currentEmail || '').toLowerCase(),
      routeId:
        this.pickNumber(raw, ['routeId', 'RouteId']) ??
        this.pickNumber(sub, ['routeId', 'RouteId']) ??
        this.pickNumber(route, ['routeId', 'RouteId', 'id', 'Id']),
      routeNumber:
        this.pickString(raw, ['routeNumber', 'RouteNumber']) ||
        this.pickString(sub, ['routeNumber', 'RouteNumber']) ||
        this.pickString(route, ['routeNumber', 'RouteNumber']),
      routeName:
        this.pickString(raw, ['routeName', 'RouteName']) ||
        this.pickString(sub, ['routeName', 'RouteName']) ||
        this.pickString(route, ['name', 'Name', 'routeName', 'RouteName']),
      stopName:
        this.pickString(raw, ['stopName', 'StopName']) ||
        this.pickString(sub, ['stopName', 'StopName']) ||
        this.pickString(stop, ['name', 'Name', 'stopName', 'StopName']),
      transportType:
        this.pickString(raw, ['transportType', 'TransportType']) ||
        this.pickString(sub, ['transportType', 'TransportType']),
      startDate:
        this.pickString(raw, ['startDate', 'StartDate']) ||
        this.pickString(sub, ['startDate', 'StartDate']),
      endDate:
        this.pickString(raw, ['endDate', 'EndDate']) ||
        this.pickString(sub, ['endDate', 'EndDate']),
      subscriptionStatus:
        this.pickString(raw, ['subscriptionStatus', 'SubscriptionStatus']) ||
        this.pickString(sub, ['status', 'Status']),
      amountDue,
      amount,
      amountPaid,
      remainingAmount,
      outstandingBalance,
      paymentStatus: this.pickString(raw, ['paymentStatus', 'PaymentStatus', 'status', 'Status']) || undefined,
      paymentDate: this.pickString(raw, ['paymentDate', 'PaymentDate']) || undefined,
      createdAt: this.pickString(raw, ['createdAt', 'CreatedAt']) || undefined,
      recordedBy: this.pickString(raw, ['recordedBy', 'RecordedBy']) || undefined,
      notes: this.pickString(raw, ['notes', 'Notes']) || undefined,
    };
  }

  private asRecord(val: unknown): Record<string, unknown> | undefined {
    return val !== null && typeof val === 'object' && !Array.isArray(val)
      ? (val as Record<string, unknown>)
      : undefined;
  }

  private pickString(obj: Record<string, unknown> | undefined, keys: readonly string[]): string {
    if (!obj) return '';
    for (const key of keys) {
      const val = obj[key];
      if (typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
    return '';
  }

  private pickNumber(obj: Record<string, unknown> | undefined, keys: readonly string[]): number | undefined {
    if (!obj) return undefined;
    for (const key of keys) {
      const val = obj[key];
      if (typeof val === 'number' && !Number.isNaN(val)) {
        return val;
      }
      if (typeof val === 'string' && val.trim() !== '') {
        const parsed = Number(val);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return undefined;
  }

  private loadStored(): BackendPaymentItem[] {
    try {
      const data = localStorage.getItem(this.getStorageKey());
      return data ? (JSON.parse(data) as BackendPaymentItem[]) : [];
    } catch {
      return [];
    }
  }

  private persist(items: BackendPaymentItem[]): void {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(items));
    } catch {
      // Storage unavailable or quota exceeded
    }
  }
}
