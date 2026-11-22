import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Home } from './home';
import { AuthService } from '../services/auth.service';

describe('Home', () => {
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Home],
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

  it('should create the Home component', () => {
    const fixture = TestBed.createComponent(Home);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should render the brand logo and main heading', async () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-logo')).toBeTruthy();
    expect(compiled.querySelector('h1')?.textContent).toContain('Safe, Punctual & Reliable School Transportation');
  });

  it('should display service cards and general information', async () => {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const serviceCards = compiled.querySelectorAll('.service-card');
    const infoCards = compiled.querySelectorAll('.info-card');

    expect(serviceCards.length).toBe(3);
    expect(infoCards.length).toBe(3);
  });

  it('should adjust hero action buttons when user is authenticated', async () => {
    authService.setSession({
      token: 'mock.token',
      role: 'Parent',
      fullName: 'Test Parent',
      email: 'parent@stms.edu',
    });

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain('Register Now');
    expect(compiled.textContent).toContain('Request Subscription');
  });
});
