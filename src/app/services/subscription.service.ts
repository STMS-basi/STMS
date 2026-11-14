
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

export type TransportType = 'OneWay' | 'RoundTrip';
export type SubscriptionStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

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

const STORAGE_SUBSCRIPTIONS_KEY = 'stms_subscriptions';

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
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

  public createSubscription(
    payload: CreateSubscriptionPayload
  ): SubscriptionItem {
    const id = Date.now();
    const referenceNumber = this.generateReferenceNumber();
    const requestedAt = new Date().toISOString();

    const today = new Date();
    const termEnd = new Date(
      today.getFullYear(),
      today.getMonth() + 4,
      1
    );

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
      startDate:
        payload.startDate ?? today.toISOString().split('T')[0],
      endDate:
        payload.endDate ?? termEnd.toISOString().split('T')[0],
      requestedAt,
      parentEmail: this.authService.userEmail()?.toLowerCase() ?? '',
    };

    const updated = [
      newSub,
      ...this.subscriptionsSignal(),
    ];

    this.subscriptionsSignal.set(updated);
    this.persist(updated);

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
