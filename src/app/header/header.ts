import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { PreferencesService } from '../services/preferences.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, NgOptimizedImage],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  public readonly variant = input<'full' | 'minimal'>('full');

  protected readonly prefs = inject(PreferencesService);
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly t = this.prefs.t;
  protected readonly isMenuOpen = signal(false);

  public readonly isAuthenticated = computed(() => this.authService.isAuthenticated());
  public readonly userRole = computed(() => this.authService.userRole());
  public readonly userFullName = computed(() => this.authService.userFullName());
  public readonly isAdmin = computed(() => this.userRole() === 'Admin');

  protected toggleMenu(): void {
    this.isMenuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  protected logout(): void {
    this.authService.logout();
    this.closeMenu();
    void this.router.navigate(['/login']);
  }
}
