import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('adminGuard', () => {
  let authService: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should allow access if user is authenticated with Admin role', () => {
    authService.setSession({
      token: 'mock_jwt_token',
      role: 'Admin',
      fullName: 'System Administrator',
      email: 'admin@basi.edu.jo',
    });

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
    expect(result).toBe(true);
  });

  it('should redirect to login if user has Parent role instead of Admin', () => {
    authService.setSession({
      token: 'mock_jwt_token',
      role: 'Parent',
      fullName: 'Guardian Account',
      email: 'parent@example.com',
    });

    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
    expect(result instanceof UrlTree).toBe(true);
    expect((result as UrlTree).toString()).toBe('/login');
  });

  it('should redirect to login if user is unauthenticated', () => {
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
    expect(result instanceof UrlTree).toBe(true);
    expect((result as UrlTree).toString()).toBe('/login');
  });
});
