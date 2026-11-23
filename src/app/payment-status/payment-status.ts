import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { AuthService } from '../services/auth.service';
import { BackendPaymentItem, PaymentService } from '../services/payment.service';
import { PreferencesService } from '../services/preferences.service';
import { SubscriptionItem, SubscriptionService } from '../services/subscription.service';

export interface PaymentRecord {
  subscription: SubscriptionItem;
  amountDue: number;
  amountPaid: number;
  outstandingBalance: number;
  paymentStatus: string;
  paymentDate?: string;
  paymentId?: number;
}

@Component({
  selector: 'app-payment-status',
  imports: [Header, RouterLink, DatePipe],
  templateUrl: './payment-status.html',
  styleUrl: './payment-status.css',
})
export class PaymentStatus implements OnInit {
  protected readonly prefs = inject(PreferencesService);
  protected readonly t = this.prefs.t;

  private readonly authService = inject(AuthService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly paymentService = inject(PaymentService);

  public ngOnInit(): void {
    this.subscriptionService.fetchSubscriptions().subscribe();
    this.paymentService.fetchMyPayments().subscribe();
  }

  protected readonly selectedPayment = signal<PaymentRecord | null>(null);

  protected readonly isLoggedIn = computed(
    () => this.authService.isAuthenticated()
  );

  public readonly payments = computed<PaymentRecord[]>(() => {
    const email = this.authService.userEmail()?.toLowerCase();
    const subs = this.subscriptionService.subscriptions();
    const backendPayments = this.paymentService.payments();

    const parentSubs = email
      ? subs.filter((s) => !s.parentEmail || s.parentEmail.toLowerCase() === email)
      : subs;

    const records: PaymentRecord[] = [];
    const matchedPaymentIds = new Set<number>();

    for (const sub of parentSubs) {
      const match = backendPayments.find(
        (p) =>
          (p.subscriptionId && p.subscriptionId === sub.subscriptionId) ||
          (p.referenceNumber && p.referenceNumber === sub.referenceNumber)
      );

      if (match) {
        matchedPaymentIds.add(match.paymentId);
        const amountDue = typeof match.amountDue === 'number' ? match.amountDue : sub.fee;
        const amountPaid =
          typeof match.amountPaid === 'number'
            ? match.amountPaid
            : typeof match.amount === 'number'
              ? match.amount
              : sub.status === 'Approved'
                ? amountDue
                : 0;
        const balance =
          typeof match.remainingAmount === 'number'
            ? match.remainingAmount
            : typeof match.outstandingBalance === 'number'
              ? match.outstandingBalance
              : Math.max(0, amountDue - amountPaid);

        records.push({
          subscription: sub,
          amountDue,
          amountPaid,
          outstandingBalance: balance,
          paymentStatus: match.paymentStatus ?? (amountPaid >= amountDue ? 'Paid' : 'Unpaid'),
          paymentDate: match.paymentDate ?? match.createdAt,
          paymentId: match.paymentId,
        });
      } else {
        const isApproved = sub.status === 'Approved';
        const isAwaiting = sub.status === 'AwaitingPayment';
        const amountDue = sub.fee;
        const amountPaid = isApproved ? sub.fee : 0;
        const balance = isApproved ? 0 : amountDue;

        records.push({
          subscription: sub,
          amountDue,
          amountPaid,
          outstandingBalance: balance,
          paymentStatus: isApproved ? 'Paid' : isAwaiting ? 'Unpaid' : 'Pending Approval',
          paymentDate: undefined,
          paymentId: undefined,
        });
      }
    }

    for (const bp of backendPayments) {
      if (!matchedPaymentIds.has(bp.paymentId)) {
        const amountDue = bp.amountDue ?? bp.amount ?? 150;
        const amountPaid = bp.amountPaid ?? bp.amount ?? amountDue;
        const balance =
          bp.remainingAmount ?? bp.outstandingBalance ?? Math.max(0, amountDue - amountPaid);

        const syntheticSub: SubscriptionItem = {
          subscriptionId: bp.subscriptionId ?? bp.paymentId,
          referenceNumber: bp.referenceNumber ?? 'SUB 2026 ' + bp.paymentId,
          parentEmail: bp.parentEmail ?? (email ?? ''),
          studentId: 0,
          studentName: bp.studentName ?? 'Student',
          studentGrade: '',
          routeId: 0,
          routeNumber: 'R',
          routeName: 'School Bus Route',
          stopId: 0,
          stopName: 'Registered Stop',
          pickupTime: '07:30 AM',
          dropoffTime: '02:30 PM',
          transportType: 'RoundTrip',
          fee: amountDue,
          status: amountPaid >= amountDue ? 'Approved' : 'AwaitingPayment',
          requestedAt: bp.paymentDate ?? bp.createdAt ?? new Date().toISOString(),
          startDate: '2027-01-15',
          endDate: '2027-05-31',
        };

        records.push({
          subscription: syntheticSub,
          amountDue,
          amountPaid,
          outstandingBalance: balance,
          paymentStatus: bp.paymentStatus ?? (amountPaid >= amountDue ? 'Paid' : 'Unpaid'),
          paymentDate: bp.paymentDate ?? bp.createdAt,
          paymentId: bp.paymentId,
        });
      }
    }

    return records;
  });

  public readonly totalDue = computed(() =>
    this.payments().reduce((total, payment) => total + payment.amountDue, 0)
  );

  public readonly totalPaid = computed(() =>
    this.payments().reduce((total, payment) => total + payment.amountPaid, 0)
  );

  public readonly totalOutstanding = computed(() =>
    this.payments().reduce((total, payment) => total + payment.outstandingBalance, 0)
  );

  protected viewPaymentDetails(payment: PaymentRecord): void {
    this.selectedPayment.set(payment);
  }

  protected closePaymentDetails(): void {
    this.selectedPayment.set(null);
  }

  protected paymentStatusText(payment?: PaymentRecord | null): string {
    const status = payment?.paymentStatus ?? 'Unpaid';
    const isAr = this.prefs.lang() === 'ar';

    switch (status) {
      case 'Paid':
        return isAr ? 'مدفوع بالكامل' : 'Paid in Full';
      case 'Unpaid':
        return isAr ? 'بانتظار السداد' : 'Awaiting Payment';
      case 'Partial':
        return isAr ? 'مدفوع جزئياً' : 'Partially Paid';
      case 'Pending Approval':
        return isAr ? 'قيد المراجعة' : 'Pending Approval';
      default:
        return status;
    }
  }
}
