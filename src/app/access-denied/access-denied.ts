import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { PreferencesService } from '../services/preferences.service';

@Component({
  selector: 'app-access-denied',
  imports: [RouterLink, Header],
  template: `
    <div class="page-container">
      <app-header />

      <main class="access-denied-main">
        <section class="access-denied-card" aria-labelledby="access-denied-title">
          <span class="access-code">403</span>
          <h1 id="access-denied-title">
            {{ isArabic() ? 'غير مصرح لك بالوصول إلى هذه الصفحة' : 'Access Denied' }}
          </h1>
          <p>
            {{
              isArabic()
                ? 'حسابك مسجل حالياً كولي أمر، وهذه الصفحة مخصصة لمسؤولي النظام فقط.'
                : 'Your session is active, but this page is restricted to school transportation administrators.'
            }}
          </p>

          <div class="access-actions">
            <a routerLink="/my-transportation" class="btn btn-primary">
              {{ isArabic() ? 'الذهاب إلى نقلي' : 'Go to My Transportation' }}
            </a>
            <a routerLink="/" class="btn btn-outline">
              {{ isArabic() ? 'الصفحة الرئيسية' : 'Back to Home' }}
            </a>
          </div>
        </section>
      </main>
    </div>
  `,
  styles: `
    .access-denied-main {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 80px);
      padding: 2rem 1rem;
      background-color: var(--bg-main);
    }

    .access-denied-card {
      max-width: 520px;
      width: 100%;
      padding: 2.5rem 2rem;
      text-align: center;
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
    }

    .access-code {
      display: inline-block;
      padding: 0.35rem 0.9rem;
      margin-bottom: 1rem;
      border-radius: 999px;
      font-weight: 800;
      font-size: 0.9rem;
      color: var(--primary-text);
      background-color: var(--primary-light);
    }

    h1 {
      margin-bottom: 0.75rem;
      color: var(--text-main);
      font-size: 1.65rem;
    }

    p {
      margin-bottom: 1.75rem;
      color: var(--text-muted);
      line-height: 1.6;
    }

    .access-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.75rem;
    }
  `,
})
export class AccessDenied {
  private readonly prefs = inject(PreferencesService);
  protected readonly isArabic = computed(() => this.prefs.lang() === 'ar');
}
