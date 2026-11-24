
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { AuthService } from '../services/auth.service';
import { PreferencesService } from '../services/preferences.service';
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
  imports: [Header, RouterLink, DatePipe],
  templateUrl: './my-transportation.html',
  styleUrl: './my-transportation.css',
})
export class MyTransportation implements OnInit {
  protected readonly prefs = inject(PreferencesService);
  protected readonly t = this.prefs.t;

  private readonly authService = inject(AuthService);
  private readonly subscriptionService = inject(SubscriptionService);

  public ngOnInit(): void {
    this.subscriptionService.fetchSubscriptions().subscribe();
  }

  protected readonly selectedSubscriptionId = signal<number | null>(null);
  protected readonly requestSubscriptionId = signal<number | null>(null);
  protected readonly requestType = signal<RequestType>('Cancellation');
  protected readonly requestMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly errorMessage = signal('');

  public readonly subscriptions = computed(() => {
    const email = this.authService.userEmail()?.toLowerCase();
    const list = this.subscriptionService.subscriptions();

    if (!email) {
      return list;
    }

    return list.filter(
      (sub) => !sub.parentEmail || sub.parentEmail.toLowerCase() === email
    );
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
    this.requestSubscriptionId.set(null);
    this.clearMessages();
  }

  protected closeDetails(): void {
    this.selectedSubscriptionId.set(null);
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
    const num = (sub.routeNumber || '').trim();
    let name = (sub.routeName || '').trim();
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
