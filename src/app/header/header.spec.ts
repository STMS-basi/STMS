import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Header } from './header';
import { AuthService } from '../services/auth.service';

describe('Header', () => {
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the Header component', () => {
    const fixture = TestBed.createComponent(Header);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should render full navigation menu by default', () => {
    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.nav-menu')).toBeTruthy();
    expect(compiled.querySelector('.menu-toggle')).toBeTruthy();
  });

  it('should render minimal header when variant is minimal', () => {
    const fixture = TestBed.createComponent(Header);
    fixture.componentRef.setInput('variant', 'minimal');
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.nav-menu')).toBeNull();
    expect(compiled.querySelector('.menu-toggle')).toBeNull();
    expect(compiled.querySelector('.brand-logo')).toBeTruthy();
    expect(compiled.querySelector('.header-controls')).toBeTruthy();
  });

  it('should toggle mobile menu', () => {
    const fixture = TestBed.createComponent(Header);
    const component = fixture.componentInstance;

    expect(component['isMenuOpen']()).toBe(false);
    component['toggleMenu']();
    expect(component['isMenuOpen']()).toBe(true);
    component['closeMenu']();
    expect(component['isMenuOpen']()).toBe(false);
  });

  it('should show user greeting and logout when authenticated', () => {
    authService.setSession({
      token: 'mock.token',
      role: 'Admin',
      fullName: 'System Administrator',
      email: 'admin@basi.edu.jo',
    });

    const fixture = TestBed.createComponent(Header);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.user-greeting')).toBeTruthy();
    expect(compiled.textContent).toContain('System Administrator');
    expect(compiled.querySelector('.nav-link-admin')).toBeTruthy();
  });
});
