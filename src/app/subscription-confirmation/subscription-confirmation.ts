import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { PreferencesService } from '../services/preferences.service';
import { SubscriptionItem, SubscriptionService } from '../services/subscription.service';

@Component({
  selector: 'app-subscription-confirmation',
  imports: [RouterLink, Header],
  templateUrl: './subscription-confirmation.html',
  styleUrl: './subscription-confirmation.css',
})
export class SubscriptionConfirmation implements OnInit {
  protected readonly prefs = inject(PreferencesService);
  protected readonly t = this.prefs.t;

  private readonly route = inject(ActivatedRoute);
  private readonly subscriptionService = inject(SubscriptionService);

  protected readonly refParam = signal<string>('');

  public readonly subscription = computed<SubscriptionItem | undefined>(() => {
    const ref = this.refParam();
    if (ref) {
      const found = this.subscriptionService.getByReference(ref);
      if (found) return found;
    }
    // Fallback to the latest active subscription if param not matched
    const all = this.subscriptionService.subscriptions();
    return all.length > 0 ? all[0] : undefined;
  });

  public ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const ref = params.get('reference');
      if (ref) {
        this.refParam.set(ref);
      }
    });
  }

  protected printReceipt(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }
}

