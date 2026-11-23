import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PaymentStatus } from './payment-status';

describe('PaymentStatus', () => {
  let component: PaymentStatus;
  let fixture: ComponentFixture<PaymentStatus>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PaymentStatus],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentStatus);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should compute totals cleanly without NaN', () => {
    expect(typeof component.totalDue()).toBe('number');
    expect(isNaN(component.totalDue())).toBe(false);
    expect(typeof component.totalPaid()).toBe('number');
    expect(isNaN(component.totalPaid())).toBe(false);
    expect(typeof component.totalOutstanding()).toBe('number');
    expect(isNaN(component.totalOutstanding())).toBe(false);
  });
});
