import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';

export interface BackendPaymentItem {
  readonly paymentId: number;
  readonly subscriptionId?: number;
  readonly studentName?: string;
  readonly parentName?: string;
  readonly parentEmail?: string;
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

  private readonly paymentsSignal = signal<BackendPaymentItem[]>(this.loadStored());
  public readonly payments = this.paymentsSignal.asReadonly();

  public fetchMyPayments(): Observable<BackendPaymentItem[]> {
    return this.http.get<BackendPaymentItem[]>('/api/payments/my').pipe(
      tap((items) => {
        if (Array.isArray(items)) {
          this.paymentsSignal.set(items);
          this.persist(items);
        }
      }),
      catchError(() => of(this.paymentsSignal()))
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

  private loadStored(): BackendPaymentItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_PAYMENTS);
      return data ? (JSON.parse(data) as BackendPaymentItem[]) : [];
    } catch {
      return [];
    }
  }

  private persist(items: BackendPaymentItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(items));
    } catch {
      // Storage unavailable or quota exceeded
    }
  }
}
