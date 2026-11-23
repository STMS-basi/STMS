import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AdminService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should be created and load initial entities', () => {
    expect(service).toBeTruthy();
    expect(service.routes().length).toBeGreaterThan(0);
    expect(service.buses().length).toBeGreaterThan(0);
    expect(service.drivers().length).toBeGreaterThan(0);
    expect(service.students().length).toBeGreaterThan(0);
    expect(service.subscriptions().length).toBeGreaterThan(0);
  });

  it('should allow approving and rejecting subscriptions', () => {
    const sub = service.subscriptions().find((s) => s.status === 'Pending')!;
    service.approveSubscription(sub.subscriptionId).subscribe();

    const reqApprove = httpTesting.expectOne(`/api/subscriptions/admin/${sub.subscriptionId}/approve`);
    expect(reqApprove.request.method).toBe('PATCH');
    reqApprove.flush({});

    let updated = service.subscriptions().find((s) => s.subscriptionId === sub.subscriptionId);
    expect(updated?.status).toBe('AwaitingPayment');

    const anotherPending = service.subscriptions().find((s) => s.status === 'Pending')!;
    service.rejectSubscription(anotherPending.subscriptionId).subscribe();

    const reqReject = httpTesting.expectOne(`/api/subscriptions/admin/${anotherPending.subscriptionId}/reject`);
    expect(reqReject.request.method).toBe('PATCH');
    reqReject.flush({});

    updated = service.subscriptions().find((s) => s.subscriptionId === anotherPending.subscriptionId);
    expect(updated?.status).toBe('Rejected');
  });

  it('should fetch subscriptions from GET /api/subscriptions/admin', () => {
    service.fetchSubscriptions().subscribe((subs) => {
      expect(subs.length).toBe(1);
      expect(subs[0].subscriptionId).toBe(999);
      expect(subs[0].status).toBe('Pending');
    });

    const req = httpTesting.expectOne('/api/subscriptions/admin');
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        subscriptionId: 999,
        referenceNumber: 'SUB 2026 999',
        studentName: 'Test Student',
        parentName: 'Test Parent',
        routeNumber: 'R1',
        routeName: 'Route 1',
        stopName: 'Stop 1',
        transportType: 'RoundTrip',
        fee: 300,
        status: 'Pending',
        requestedAt: '2026-11-23',
      },
    ]);

    expect(service.subscriptions().length).toBe(1);
    expect(service.subscriptions()[0].subscriptionId).toBe(999);
  });

  it('should toggle route and bus active status', () => {
    const route = service.routes()[0];
    const initialRouteStatus = route.isActive;
    service.toggleRouteActive(route.routeId).subscribe();

    const patchReq = httpTesting.expectOne(`/api/routes/admin/${route.routeId}/deactivate`);
    expect(patchReq.request.method).toBe('PATCH');
    patchReq.flush({});

    const getReq = httpTesting.expectOne('/api/routes/admin');
    getReq.flush([]);

    expect(service.routes().find((r) => r.routeId === route.routeId)?.isActive).toBe(!initialRouteStatus);

    const bus = service.buses()[0];
    const initialBusStatus = bus.isActive;
    service.toggleBusActive(bus.busId);
    expect(service.buses().find((b) => b.busId === bus.busId)?.isActive).toBe(!initialBusStatus);
  });

  it('should update payment status', () => {
    const payment = service.payments()[0];
    service.updatePaymentStatus(payment.paymentId, 'Paid');

    const req = httpTesting.expectOne('/api/payments/admin');
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });

    const updated = service.payments().find((p) => p.paymentId === payment.paymentId);
    expect(updated?.status).toBe('Paid');
    expect(updated?.amountPaid).toBe(payment.amountDue);
  });

  it('should fetch students from GET /api/students and update totalStudents', () => {
    service.fetchStudents().subscribe((students) => {
      expect(students.length).toBe(13);
      expect(students[0].fullName).toBe('Student 1');
    });

    const req = httpTesting.expectOne('/api/students');
    expect(req.request.method).toBe('GET');
    const mockList = Array.from({ length: 13 }, (_, i) => ({
      studentId: i + 1,
      fullName: `Student ${i + 1}`,
      grade: 'Grade 5',
      className: '5A',
    }));
    req.flush(mockList);

    expect(service.students().length).toBe(13);
    expect(service.totalStudents()).toBe(13);
  });

  it('should fetch routes from GET /api/routes/admin', () => {
    service.fetchRoutes().subscribe((routes) => {
      expect(routes.length).toBe(2);
      expect(routes[0].routeNumber).toBe('R1');
    });

    const req = httpTesting.expectOne('/api/routes/admin');
    expect(req.request.method).toBe('GET');
    req.flush([
      { routeId: 1, routeNumber: 'R1', name: 'Route 1', capacity: 30, enrolledStudents: 10 },
      { routeId: 2, routeNumber: 'R2', name: 'Route 2', capacity: 25, enrolledStudents: 5 },
    ]);

    expect(service.routes().length).toBe(2);
  });

  it('should add route via POST /api/routes/admin', () => {
    service
      .addRoute({
        routeNumber: 'R5',
        name: 'Sweifieh Route',
        startPoint: 'Sweifieh',
        destination: 'Basi School',
        serviceArea: 'West Amman',
        capacity: 30,
        enrolledStudents: 0,
        isActive: true,
        busPlate: '50 99999',
        driverName: 'Driver Test',
      })
      .subscribe();

    const postReq = httpTesting.expectOne('/api/routes/admin');
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({
      routeNumber: 'R5',
      name: 'Sweifieh Route',
      startPoint: 'Sweifieh',
      destination: 'Basi School',
      serviceArea: 'West Amman',
      capacity: 30,
      busId: null,
      driverId: null,
    });
    postReq.flush({ routeId: 5 });

    const getReq = httpTesting.expectOne('/api/routes/admin');
    getReq.flush([]);

    expect(service.routes().some((r) => r.routeNumber === 'R5')).toBe(true);
  });

  it('should fetch payments from GET /api/payments/admin', () => {
    service.fetchPayments().subscribe((payments) => {
      expect(payments.length).toBeGreaterThan(0);
    });

    const req = httpTesting.expectOne('/api/payments/admin');
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        paymentId: 101,
        subscriptionId: 1001,
        referenceNumber: 'SUB 2026 1001',
        amountDue: 300,
        amountPaid: 300,
        paymentStatus: 'Paid',
      },
    ]);

    expect(service.payments().some((p) => p.paymentId === 101)).toBe(true);
  });

  it('should record payment via POST /api/payments/admin and approve subscription', () => {
    service.recordPayment({ subscriptionId: 1003, amount: 300, notes: 'Confirmed' }).subscribe();

    const req = httpTesting.expectOne('/api/payments/admin');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ subscriptionId: 1003, amount: 300, notes: 'Confirmed' });
    req.flush({ success: true, paymentId: 50 });

    const sub = service.subscriptions().find((s) => s.subscriptionId === 1003);
    expect(sub?.status).toBe('Approved');
  });

  it('should fetch buses from GET /api/buses/admin', () => {
    service.fetchBuses().subscribe((buses) => {
      expect(buses.length).toBe(1);
      expect(buses[0].plateNumber).toBe('50 99999');
    });

    const req = httpTesting.expectOne('/api/buses/admin');
    expect(req.request.method).toBe('GET');
    req.flush([
      { busId: 10, plateNumber: '50 99999', capacity: 25, assignedRoute: 'R1 Line', isActive: true },
    ]);

    expect(service.buses().some((b) => b.plateNumber === '50 99999')).toBe(true);
  });

  it('should add bus via POST /api/buses/admin', () => {
    service.addBus({ plateNumber: '50 88888', capacity: 30, assignedRoute: 'R2 Line', isActive: true }).subscribe();

    const postReq = httpTesting.expectOne('/api/buses/admin');
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({ plateNumber: '50 88888', capacity: 30 });
    postReq.flush({ busId: 11 });

    const getReq = httpTesting.expectOne('/api/buses/admin');
    getReq.flush([]);

    expect(service.buses().some((b) => b.plateNumber === '50 88888')).toBe(true);
  });

  it('should fetch drivers from GET /api/drivers/admin', () => {
    service.fetchDrivers().subscribe((drivers) => {
      expect(drivers.length).toBe(1);
      expect(drivers[0].fullName).toBe('Driver Nidal');
    });

    const req = httpTesting.expectOne('/api/drivers/admin');
    expect(req.request.method).toBe('GET');
    req.flush([
      { driverId: 20, fullName: 'Driver Nidal', phone: '0791112233', licenseNumber: 'LIC 555', assignedBus: '50 12345', isActive: true },
    ]);

    expect(service.drivers().some((d) => d.fullName === 'Driver Nidal')).toBe(true);
  });

  it('should add driver via POST /api/drivers/admin', () => {
    service.addDriver({ fullName: 'Driver Tareq', phone: '0799998877', licenseNumber: 'LIC 777', assignedBus: 'Reserve', isActive: true }).subscribe();

    const postReq = httpTesting.expectOne('/api/drivers/admin');
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({ fullName: 'Driver Tareq', phone: '0799998877', licenseNumber: 'LIC 777' });
    postReq.flush({ driverId: 21 });

    const getReq = httpTesting.expectOne('/api/drivers/admin');
    getReq.flush([]);

    expect(service.drivers().some((d) => d.fullName === 'Driver Tareq')).toBe(true);
  });

  it('should fetch stops from GET /api/stops/admin', () => {
    service.fetchStops().subscribe((stops) => {
      expect(stops.length).toBe(1);
      expect(stops[0].name).toBe('Test Stop');
    });

    const req = httpTesting.expectOne('/api/stops/admin');
    expect(req.request.method).toBe('GET');
    req.flush([
      { stopId: 301, routeId: 1, routeNumber: 'R1', name: 'Test Stop', stopOrder: 1, pickupTime: '7:00 AM', dropoffTime: '2:30 PM' },
    ]);

    expect(service.stops().some((s) => s.name === 'Test Stop')).toBe(true);
  });

  it('should add stop via POST /api/stops/admin', () => {
    service.addStop({ routeId: 1, routeNumber: 'R1', name: 'New Stop', stopOrder: 2, pickupTime: '7:10 AM', dropoffTime: '2:20 PM' }).subscribe();

    const postReq = httpTesting.expectOne('/api/stops/admin');
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({
      name: 'New Stop',
      routeId: 1,
      stopOrder: 2,
      pickupTime: '7:10 AM',
      dropoffTime: '2:20 PM',
    });
    postReq.flush({ stopId: 302 });

    const getReq = httpTesting.expectOne('/api/stops/admin');
    getReq.flush([]);

    expect(service.stops().some((s) => s.name === 'New Stop')).toBe(true);
  });

  it('should delete stop via DELETE /api/stops/admin/{id}', () => {
    const stop = service.stops()[0];
    service.deleteStop(stop.stopId).subscribe();

    const delReq = httpTesting.expectOne(`/api/stops/admin/${stop.stopId}`);
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({});

    const getReq = httpTesting.expectOne('/api/stops/admin');
    getReq.flush([]);

    expect(service.stops().some((s) => s.stopId === stop.stopId)).toBe(false);
  });

  it('should fetch parents from GET /api/parents/admin', () => {
    service.fetchParents().subscribe((parents) => {
      expect(parents.length).toBe(1);
      expect(parents[0].fullName).toBe('Parent Test');
    });

    const req = httpTesting.expectOne('/api/parents/admin');
    expect(req.request.method).toBe('GET');
    req.flush([
      { parentId: 401, fullName: 'Parent Test', email: 'pt@example.com', phone: '0790001111', address: 'Amman', studentsCount: 1 },
    ]);

    expect(service.parents().some((p) => p.fullName === 'Parent Test')).toBe(true);
  });
});
