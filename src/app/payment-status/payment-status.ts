
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { AuthService } from '../services/auth.service';
import { PreferencesService } from '../services/preferences.service';
import { SubscriptionItem, SubscriptionService } from '../services/subscription.service';

interface PaymentRecord {
  subscription: SubscriptionItem;
  amountDue: number;
  amountPaid: number;
  outstandingBalance: number;
  paymentStatus: string;
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

  public ngOnInit(): void {
    this.subscriptionService.fetchSubscriptions().subscribe();
  }

  protected readonly selectedPayment = signal<PaymentRecord | null>(null);

  protected readonly isLoggedIn = computed(
    () => this.authService.isAuthenticated()
  );

  public readonly payments = computed<PaymentRecord[]>(() => {
    const email = this.authService.userEmail()?.toLowerCase();
    const list = this.subscriptionService.subscriptions();
    const filtered = !email
      ? list
      : list.filter(
          (sub) => !sub.parentEmail || sub.parentEmail.toLowerCase() === email
        );

    return filtered.map((sub) => ({
      subscription: sub,
      amountDue: sub.fee,
      amountPaid: 0,
      outstandingBalance: sub.fee,
      paymentStatus: 'Managed by School Administration',
    }));
  });

  public readonly totalDue = computed(() =>
    this.payments().reduce(
      (total, payment) => total + payment.amountDue,
      0
    )
  );

  public readonly totalPaid = computed(() =>
    this.payments().reduce(
      (total, payment) => total + payment.amountPaid,
      0
    )
  );

  public readonly totalOutstanding = computed(() =>
    this.payments().reduce(
      (total, payment) => total + payment.outstandingBalance,
      0
    )
  );

  protected viewPaymentDetails(payment: PaymentRecord): void {
    this.selectedPayment.set(payment);
  }

  protected closePaymentDetails(): void {
    this.selectedPayment.set(null);
  }

  protected paymentStatusText(): string {
    return this.prefs.lang() === 'ar'
      ? 'تتم إدارة الدفع من قبل إدارة المدرسة'
      : 'Managed by School Administration';
  }
}
