import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { AuthService } from '../services/auth.service';
import { BackendPaymentItem, PaymentService } from '../services/payment.service';
import { PreferencesService } from '../services/preferences.service';
import { RouteService } from '../services/route.service';
import { SubscriptionItem, SubscriptionService } from '../services/subscription.service';

export interface PaymentRecord {
  subscription: SubscriptionItem;
  subscriptionFee: number;
  isPayable: boolean;
  amountDue: number;
  amountPaid: number;
  outstandingBalance: number;
  paymentStatus: string;
  paymentDate?: string;
  paymentId?: number;
  recordedBy?: string;
  notes?: string;
}

@Component({
  selector: 'app-payment-status',
  imports: [Header, RouterLink],
  templateUrl: './payment-status.html',
  styleUrl: './payment-status.css',
})
export class PaymentStatus implements OnInit {
  protected readonly prefs = inject(PreferencesService);
  protected readonly t = this.prefs.t;

  private readonly authService = inject(AuthService);
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly paymentService = inject(PaymentService);
  private readonly routeService = inject(RouteService);

  public ngOnInit(): void {
    this.routeService.fetchRoutes().subscribe();
    this.subscriptionService.fetchSubscriptions().subscribe();
    this.paymentService.fetchMyPayments().subscribe();
  }

  protected readonly selectedPayment = signal<PaymentRecord | null>(null);

  protected readonly isLoggedIn = computed(
    () => this.authService.isAuthenticated()
  );

  public readonly payments = computed<PaymentRecord[]>(() => {
    const email = this.authService.userEmail()?.trim().toLowerCase();
    if (!this.authService.isAuthenticated() || !email) {
      return [];
    }

    const subs = this.subscriptionService.subscriptions();
    const backendPayments = this.paymentService.payments();

    const parentSubs = subs.filter(
      (s) => s.parentEmail?.trim().toLowerCase() === email
    );
    const parentPayments = backendPayments.filter(
      (bp) => !bp.parentEmail || bp.parentEmail.trim().toLowerCase() === email
    );

    const records: PaymentRecord[] = [];
    const matchedPaymentIds = new Set<number>();

    for (const sub of parentSubs) {
      const match = parentPayments.find(
        (p) =>
          (p.subscriptionId && p.subscriptionId === sub.subscriptionId) ||
          (p.referenceNumber && p.referenceNumber === sub.referenceNumber)
      );

      const resolvedRoute = this.resolveRouteInfo(
        sub.routeId || match?.routeId || 0,
        sub.routeNumber || match?.routeNumber || '',
        sub.routeName || match?.routeName || ''
      );
      const enrichedSub: SubscriptionItem = {
        ...sub,
        routeNumber: resolvedRoute.routeNumber,
        routeName: resolvedRoute.routeName,
        stopName: sub.stopName || match?.stopName || '',
      };

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
          subscription: enrichedSub,
          subscriptionFee: sub.fee || amountDue,
          isPayable: true,
          amountDue,
          amountPaid,
          outstandingBalance: balance,
          paymentStatus: this.normalizePaymentStatus(
            match.paymentStatus,
            amountPaid,
            amountDue
          ),
          paymentDate: match.paymentDate ?? match.createdAt,
          paymentId: match.paymentId,
          recordedBy: match.recordedBy,
          notes: match.notes,
        });
      } else {
        const isApproved = sub.status === 'Approved';
        const isAwaiting = sub.status === 'AwaitingPayment';
        const isRejected = sub.status === 'Rejected';
        const isPayable = isApproved || isAwaiting;
        const amountDue = isPayable ? sub.fee : 0;
        const amountPaid = isApproved ? sub.fee : 0;
        const balance = isAwaiting ? sub.fee : 0;

        records.push({
          subscription: enrichedSub,
          subscriptionFee: sub.fee,
          isPayable,
          amountDue,
          amountPaid,
          outstandingBalance: balance,
          paymentStatus: isApproved
            ? 'Paid'
            : isAwaiting
              ? 'Unpaid'
              : isRejected
                ? 'Rejected'
                : 'Pending Approval',
          paymentDate: undefined,
          paymentId: undefined,
        });
      }
    }

    for (const bp of parentPayments) {
      if (!matchedPaymentIds.has(bp.paymentId)) {
        const amountDue = bp.amountDue ?? bp.amount ?? 150;
        const amountPaid = bp.amountPaid ?? bp.amount ?? amountDue;
        const balance =
          bp.remainingAmount ?? bp.outstandingBalance ?? Math.max(0, amountDue - amountPaid);

        const resolvedRoute = this.resolveRouteInfo(
          bp.routeId ?? 0,
          bp.routeNumber ?? '',
          bp.routeName ?? ''
        );

        const syntheticSub: SubscriptionItem = {
          subscriptionId: bp.subscriptionId ?? bp.paymentId,
          referenceNumber: bp.referenceNumber || `PAY-${bp.paymentId}`,
          parentEmail: bp.parentEmail || email,
          studentId: 0,
          studentName: bp.studentName || (this.prefs.lang() === 'ar' ? 'طالب' : 'Student'),
          studentGrade: bp.studentGrade ?? '',
          routeId: bp.routeId ?? 0,
          routeNumber: resolvedRoute.routeNumber,
          routeName: resolvedRoute.routeName,
          stopId: 0,
          stopName: bp.stopName ?? '',
          pickupTime: '',
          dropoffTime: '',
          transportType: bp.transportType === 'OneWay' ? 'OneWay' : 'RoundTrip',
          fee: amountDue,
          status: amountPaid >= amountDue ? 'Approved' : 'AwaitingPayment',
          requestedAt: bp.paymentDate ?? bp.createdAt ?? '',
          startDate: bp.startDate ?? '',
          endDate: bp.endDate ?? '',
        };

        records.push({
          subscription: syntheticSub,
          subscriptionFee: amountDue,
          isPayable: true,
          amountDue,
          amountPaid,
          outstandingBalance: balance,
          paymentStatus: this.normalizePaymentStatus(bp.paymentStatus, amountPaid, amountDue),
          paymentDate: bp.paymentDate ?? bp.createdAt,
          paymentId: bp.paymentId,
          recordedBy: bp.recordedBy,
          notes: bp.notes,
        });
      }
    }

    return records;
  });

  public readonly totalDue = computed(() =>
    this.payments().reduce(
      (total, payment) => total + (payment.isPayable ? payment.amountDue : 0),
      0
    )
  );

  public readonly totalPaid = computed(() =>
    this.payments().reduce((total, payment) => total + payment.amountPaid, 0)
  );

  public readonly totalOutstanding = computed(() =>
    this.payments().reduce(
      (total, payment) => total + (payment.isPayable ? payment.outstandingBalance : 0),
      0
    )
  );

  public formatRouteLabel(sub: SubscriptionItem): string {
    const { routeNumber, routeName } = this.resolveRouteInfo(
      sub.routeId,
      sub.routeNumber,
      sub.routeName
    );
    if (routeNumber && routeName) {
      return routeName.startsWith(routeNumber)
        ? routeName
        : `${routeNumber} - ${routeName}`;
    }
    return routeNumber || routeName || (this.prefs.lang() === 'ar' ? 'غير محدد' : 'Not Assigned');
  }

  protected hasPeriodDates(sub: SubscriptionItem): boolean {
    return Boolean(sub.startDate?.trim() && sub.endDate?.trim());
  }

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
        return isAr ? 'بانتظار موافقة الإدارة' : 'Pending Approval';
      case 'Rejected':
        return isAr ? 'مرفوض' : 'Rejected';
      default:
        return status;
    }
  }

  private normalizePaymentStatus(
    rawStatus: string | undefined,
    amountPaid: number,
    amountDue: number
  ): string {
    const status = (rawStatus ?? '').trim();
    if (!status) {
      return amountPaid >= amountDue ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Unpaid';
    }
    const lower = status.toLowerCase();
    if (lower === 'paid' || lower === 'paid in full' || lower === 'completed') {
      return 'Paid';
    }
    if (lower === 'partial' || lower === 'partially paid' || lower === 'partiallypaid') {
      return 'Partial';
    }
    if (lower === 'unpaid' || lower === 'awaitingpayment' || lower === 'awaiting payment') {
      return 'Unpaid';
    }
    return status;
  }

  private resolveRouteInfo(
    routeId: number,
    rawNumber: string,
    rawName: string
  ): { routeNumber: string; routeName: string } {
    const cleanNum = this.cleanRouteValue(rawNumber);
    const cleanName = this.cleanRouteValue(rawName);
    const hasLive = this.routeService.hasBackendRoutes();

    const matchedById =
      hasLive && routeId > 0 ? this.routeService.findLiveRouteById(routeId) : undefined;
    const matchedByName =
      hasLive && !matchedById && cleanName
        ? this.routeService
            .routes()
            .find((r) => r.name.trim().toLowerCase() === cleanName.toLowerCase())
        : undefined;
    const matched = matchedById ?? matchedByName;

    return {
      routeNumber: cleanNum || this.cleanRouteValue(matched?.routeNumber ?? ''),
      routeName: cleanName || this.cleanRouteValue(matched?.name ?? ''),
    };
  }

  private cleanRouteValue(value: string): string {
    const cleaned = (value || '').trim().replace(/^[-–—•]+\s*/, '').trim();
    if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned === 'R') {
      return '';
    }
    return cleaned;
  }
}
