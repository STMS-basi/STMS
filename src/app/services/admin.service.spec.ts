import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('stms_admin_students', JSON.stringify([{ studentId: 999, fullName: 'Stale Demo' }]));
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

  it('should start empty and clear legacy admin localStorage without loading demo mock data', () => {
    expect(service).toBeTruthy();
    expect(service.routes()).toEqual([]);
    expect(service.stops()).toEqual([]);
    expect(service.buses()).toEqual([]);
    expect(service.drivers()).toEqual([]);
    expect(service.students()).toEqual([]);
    expect(service.parents()).toEqual([]);
    expect(service.subscriptions()).toEqual([]);
    expect(service.payments()).toEqual([]);
    expect(localStorage.getItem('stms_admin_students')).toBeNull();
  });

  it('should not show demo data when GET /api/students/admin fails with 403 and should record error', () => {
    service.fetchStudents().subscribe();
    const req = httpTesting.expectOne('/api/students/admin');
    req.flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

    expect(service.students()).toEqual([]);
    expect(service.errors().students).toContain('403');
  });

  it('should fetch students from GET /api/students/admin and update totalStudents', () => {
    service.fetchStudents().subscribe((students) => {
      expect(students.length).toBe(13);
      expect(students[0].fullName).toBe('Student 1');
    });

    const req = httpTesting.expectOne('/api/students/admin');
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

  it('should fetch parents from GET /api/parents/admin reading backend studentCount accurately including zero', () => {
    service.fetchParents().subscribe();
    const req = httpTesting.expectOne('/api/parents/admin');
    expect(req.request.method).toBe('GET');
    req.flush([
      { parentId: 10, fullName: 'Tariq Khalil', email: 'tariq@example.com', phone: '0790001111', address: 'Amman', studentCount: 3 },
      { parentId: 11, fullName: 'Nadia Sami', email: 'nadia@example.com', phone: '0790002222', studentCount: 0 },
    ]);

    expect(service.parents().length).toBe(2);
    expect(service.parents()[0].studentsCount).toBe(3);
    expect(service.parents()[1].studentsCount).toBe(0);
    expect(service.parents()[1].address).toBe('—');
  });

  it('should resolve real parentName in subscriptions and payments regardless of API arrival order', () => {
    // 1) Payments arrives first
    service.fetchPayments().subscribe();
    httpTesting.expectOne('/api/payments/admin').flush([
      { paymentId: 77, subscriptionId: 500, referenceNumber: 'SUB-500', studentName: 'Zaid Omar', parentName: 'Parent', amountDue: 300, amountPaid: 0, paymentStatus: 'Unpaid' },
    ]);

    // 2) Subscriptions arrives next with placeholder parentName
    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 500, studentId: 88, referenceNumber: 'SUB-500', studentName: 'Zaid Omar', parentName: 'Parent', routeNumber: 'R2', routeName: 'Jubeiha', stopName: 'Gate 1', status: 'AwaitingPayment', fee: 300 },
    ]);

    // 3) Students arrives last with real parentName
    service.fetchStudents().subscribe();
    httpTesting.expectOne('/api/students/admin').flush([
      { studentId: 88, fullName: 'Zaid Omar', parentName: 'Omar Hassan', grade: 'Grade 4', className: '4B' },
    ]);

    expect(service.subscriptions()[0].parentName).toBe('Omar Hassan');
    expect(service.payments()[0].parentName).toBe('Omar Hassan');
  });

  it('should approve and reject subscriptions only after backend confirmation', () => {
    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 101, referenceNumber: 'SUB-101', studentName: 'S1', parentName: 'P1', status: 'Pending', fee: 300 },
      { subscriptionId: 102, referenceNumber: 'SUB-102', studentName: 'S2', parentName: 'P2', status: 'Pending', fee: 150 },
    ]);

    service.approveSubscription(101).subscribe();
    // Before backend responds, status MUST still be Pending
    expect(service.subscriptions().find((s) => s.subscriptionId === 101)?.status).toBe('Pending');

    const reqApprove = httpTesting.expectOne('/api/subscriptions/admin/101/approve');
    expect(reqApprove.request.method).toBe('PATCH');
    reqApprove.flush({});
    expect(service.subscriptions().find((s) => s.subscriptionId === 101)?.status).toBe('AwaitingPayment');

    service.rejectSubscription(102).subscribe();
    expect(service.subscriptions().find((s) => s.subscriptionId === 102)?.status).toBe('Pending');

    const reqReject = httpTesting.expectOne('/api/subscriptions/admin/102/reject');
    expect(reqReject.request.method).toBe('PATCH');
    reqReject.flush({});
    expect(service.subscriptions().find((s) => s.subscriptionId === 102)?.status).toBe('Rejected');
  });

  it('should NOT update subscription status when backend approve fails', () => {
    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 101, referenceNumber: 'SUB-101', studentName: 'S1', parentName: 'P1', status: 'Pending', fee: 300 },
    ]);

    let receivedError = false;
    service.approveSubscription(101).subscribe({
      error: () => {
        receivedError = true;
      },
    });

    const reqApprove = httpTesting.expectOne('/api/subscriptions/admin/101/approve');
    reqApprove.flush({ message: 'Server error' }, { status: 500, statusText: 'Error' });

    expect(receivedError).toBe(true);
    expect(service.subscriptions()[0].status).toBe('Pending');
  });

  it('should link real busPlate, driverName, assignedRoute, and assignedBus without fake defaults', () => {
    service.fetchRoutes().subscribe();
    httpTesting.expectOne('/api/routes/admin').flush([
      { routeId: 10, routeNumber: 'R10', name: 'Airport Line', busId: 20, driverId: 30, capacity: 30, enrolledStudents: 5 },
      { routeId: 11, routeNumber: 'R11', name: 'Unassigned Line', capacity: 25, enrolledStudents: 0 },
    ]);

    service.fetchBuses().subscribe();
    httpTesting.expectOne('/api/buses/admin').flush([
      { busId: 20, plateNumber: '55-98765', capacity: 30, isActive: true },
      { busId: 21, plateNumber: '55-00000', capacity: 20, isActive: true },
    ]);

    service.fetchDrivers().subscribe();
    httpTesting.expectOne('/api/drivers/admin').flush([
      { driverId: 30, fullName: 'Khaled Nasser', phone: '0791112233', licenseNumber: 'LIC-88', isActive: true },
      { driverId: 31, fullName: 'Reserve Driver', isActive: true },
    ]);

    const r10 = service.routes().find((r) => r.routeId === 10)!;
    const r11 = service.routes().find((r) => r.routeId === 11)!;
    expect(r10.busPlate).toBe('55-98765');
    expect(r10.driverName).toBe('Khaled Nasser');
    expect(r11.busPlate).toBe('—');
    expect(r11.driverName).toBe('—');

    const b20 = service.buses().find((b) => b.busId === 20)!;
    const b21 = service.buses().find((b) => b.busId === 21)!;
    expect(b20.assignedRoute).toBe('R10 Airport Line');
    expect(b21.assignedRoute).toBe('—');

    const d30 = service.drivers().find((d) => d.driverId === 30)!;
    const d31 = service.drivers().find((d) => d.driverId === 31)!;
    expect(d30.assignedBus).toContain('55-98765');
    expect(d31.assignedBus).toBe('—');
  });

  it('should toggle route and bus active status only after PATCH succeeds', () => {
    service.fetchRoutes().subscribe();
    httpTesting.expectOne('/api/routes/admin').flush([
      { routeId: 1, routeNumber: 'R1', name: 'Route 1', capacity: 30, enrolledStudents: 10, isActive: true },
    ]);

    service.toggleRouteActive(1).subscribe();
    expect(service.routes()[0].isActive).toBe(true);

    const patchRoute = httpTesting.expectOne('/api/routes/admin/1/deactivate');
    expect(patchRoute.request.method).toBe('PATCH');
    patchRoute.flush({});
    httpTesting.expectOne('/api/routes/admin').flush([
      { routeId: 1, routeNumber: 'R1', name: 'Route 1', capacity: 30, enrolledStudents: 10, isActive: false },
    ]);
    expect(service.routes()[0].isActive).toBe(false);

    service.fetchBuses().subscribe();
    httpTesting.expectOne('/api/buses/admin').flush([
      { busId: 2, plateNumber: '50-22222', capacity: 30, isActive: true },
    ]);

    service.toggleBusActive(2).subscribe();
    expect(service.buses()[0].isActive).toBe(true);

    const patchBus = httpTesting.expectOne('/api/buses/admin/2/deactivate');
    expect(patchBus.request.method).toBe('PATCH');
    patchBus.flush({});
    httpTesting.expectOne('/api/buses/admin').flush([
      { busId: 2, plateNumber: '50-22222', capacity: 30, isActive: false },
    ]);
    expect(service.buses()[0].isActive).toBe(false);
  });

  it('should add route, bus, driver, and stop via POST endpoints after success', () => {
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
        busPlate: '',
        driverName: '',
      })
      .subscribe();

    const postRoute = httpTesting.expectOne('/api/routes/admin');
    expect(postRoute.request.body).toEqual({
      routeNumber: 'R5',
      name: 'Sweifieh Route',
      startPoint: 'Sweifieh',
      destination: 'Basi School',
      serviceArea: 'West Amman',
      capacity: 30,
      busId: null,
      driverId: null,
    });
    postRoute.flush({ routeId: 5 });
    httpTesting.expectOne('/api/routes/admin').flush([
      { routeId: 5, routeNumber: 'R5', name: 'Sweifieh Route', capacity: 30, enrolledStudents: 0 },
    ]);
    expect(service.routes().some((r) => r.routeNumber === 'R5')).toBe(true);

    service.addBus({ plateNumber: '50-88888', capacity: 30, assignedRoute: '—', isActive: true }).subscribe();
    const postBus = httpTesting.expectOne('/api/buses/admin');
    expect(postBus.request.body).toEqual({ plateNumber: '50-88888', capacity: 30 });
    postBus.flush({ busId: 11 });
    httpTesting.expectOne('/api/buses/admin').flush([{ busId: 11, plateNumber: '50-88888', capacity: 30 }]);
    expect(service.buses().some((b) => b.plateNumber === '50-88888')).toBe(true);

    service.addDriver({ fullName: 'Driver Tareq', phone: '0799998877', licenseNumber: 'LIC-777', assignedBus: '—', isActive: true }).subscribe();
    const postDriver = httpTesting.expectOne('/api/drivers/admin');
    expect(postDriver.request.body).toEqual({ fullName: 'Driver Tareq', phone: '0799998877', licenseNumber: 'LIC-777' });
    postDriver.flush({ driverId: 21 });
    httpTesting.expectOne('/api/drivers/admin').flush([{ driverId: 21, fullName: 'Driver Tareq', phone: '0799998877', licenseNumber: 'LIC-777' }]);
    expect(service.drivers().some((d) => d.fullName === 'Driver Tareq')).toBe(true);

    service.addStop({ routeId: 5, routeNumber: 'R5', name: 'New Stop', stopOrder: 2, pickupTime: '07:10', dropoffTime: '14:20' }).subscribe();
    const postStop = httpTesting.expectOne('/api/stops/admin');
    expect(postStop.request.body).toEqual({
      name: 'New Stop',
      routeId: 5,
      stopOrder: 2,
      pickupTime: '07:10',
      dropoffTime: '14:20',
    });
    postStop.flush({ stopId: 302 });
    httpTesting.expectOne('/api/stops/admin').flush([{ stopId: 302, routeId: 5, name: 'New Stop', stopOrder: 2 }]);
    expect(service.stops().some((s) => s.name === 'New Stop')).toBe(true);
    // Verify null pickup/dropoff times do NOT fallback to fake 7:00 AM / 2:30 PM
    expect(service.stops()[0].pickupTime).toBe('—');
  });

  it('should delete stop via DELETE /api/stops/admin/{id} after success', () => {
    service.fetchStops().subscribe();
    httpTesting.expectOne('/api/stops/admin').flush([
      { stopId: 301, routeId: 1, name: 'Stop 1', stopOrder: 1 },
    ]);

    service.deleteStop(301).subscribe();
    const delReq = httpTesting.expectOne('/api/stops/admin/301');
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({});
    httpTesting.expectOne('/api/stops/admin').flush([]);

    expect(service.stops().some((s) => s.stopId === 301)).toBe(false);
  });

  it('should record payment via POST /api/payments/admin and approve subscription only after response', () => {
    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 1003, referenceNumber: 'SUB 2026 19384', studentName: 'Kareem', parentName: 'Faris', status: 'AwaitingPayment', fee: 300 },
    ]);

    service.recordPayment({ subscriptionId: 1003, amount: 300, notes: 'Confirmed' }).subscribe();
    expect(service.subscriptions()[0].status).toBe('AwaitingPayment');

    const req = httpTesting.expectOne('/api/payments/admin');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ subscriptionId: 1003, amount: 300, notes: 'Confirmed' });
    req.flush({ success: true, paymentId: 50 });

    expect(service.subscriptions()[0].status).toBe('Approved');
  });

  it('should reject partial payment amount and keep subscription AwaitingPayment', () => {
    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 2001, referenceNumber: 'SUB-2001', studentName: 'Ahmad', parentName: 'Ali', status: 'AwaitingPayment', transportType: 'RoundTrip', fee: 300 },
    ]);

    let receivedError: unknown;
    service.recordPayment({ subscriptionId: 2001, amount: 200, notes: 'Partial attempt' }).subscribe({
      error: (err) => {
        receivedError = err;
      },
    });

    httpTesting.expectNone('/api/payments/admin');
    expect(receivedError).toBeTruthy();
    expect(service.subscriptions()[0].status).toBe('AwaitingPayment');
  });

  it('should not approve subscription if backend response still shows Partial or remainingAmount > 0', () => {
    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 2002, referenceNumber: 'SUB-2002', studentName: 'Layan', parentName: 'Ali', status: 'AwaitingPayment', transportType: 'OneWay', fee: 150 },
    ]);

    service.recordPayment({ subscriptionId: 2002, amount: 150 }).subscribe();
    httpTesting.expectOne('/api/payments/admin').flush({
      paymentId: 88,
      subscriptionId: 2002,
      paymentStatus: 'Partial',
      subscriptionStatus: 'AwaitingPayment',
      remainingAmount: 30,
    });

    expect(service.subscriptions()[0].status).toBe('AwaitingPayment');
  });

  it('should map student route and status accurately without fake defaults', () => {
    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 10, studentId: 101, referenceNumber: 'SUB-101', studentName: 'Yousef Al Basi', routeNumber: 'R1', routeName: 'Abdoun', stopName: 'Circle', transportType: 'RoundTrip', status: 'Approved', fee: 300 },
    ]);

    service.fetchStudents().subscribe((students) => {
      const unsubscribedStudent = students.find((s) => s.fullName === 'Unsubscribed Student')!;
      expect(unsubscribedStudent.routeNumber).toBe('—');
      expect(unsubscribedStudent.stopName).toBe('—');
      expect(unsubscribedStudent.status).toBe('Inactive');

      const enrolledStudent = students.find((s) => s.fullName === 'Yousef Al Basi')!;
      expect(enrolledStudent.routeNumber).toBe('R1');
      expect(enrolledStudent.status).toBe('Active');
    });

    const req = httpTesting.expectOne('/api/students/admin');
    req.flush([
      { studentId: 101, fullName: 'Yousef Al Basi', grade: 'Grade 5', className: '5A' },
      { studentId: 999, fullName: 'Unsubscribed Student', grade: 'Grade 1', className: '1A' },
    ]);
  });

  it('should populate student route from Approved subscription routeId and stopId even when /api/students/admin omits route fields', () => {
    service.fetchStudents().subscribe();
    httpTesting.expectOne('/api/students/admin').flush([
      { studentId: 71, fullName: 'Capacity Test Student Two', grade: '5', className: 'A', parentId: 21, parentName: 'Test Parent' },
      { studentId: 72, fullName: 'Stop Fallback Student', grade: '4', className: 'B', parentId: 21, parentName: 'Test Parent' },
    ]);

    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      {
        subscriptionId: 101,
        studentId: 71,
        routeId: 45,
        stopId: 62,
        stopName: 'R26 Test Stop',
        transportType: 'OneWay',
        status: 'Approved',
      },
      {
        subscriptionId: 102,
        studentId: 72,
        stopId: 62,
        stopName: 'R26 Test Stop',
        transportType: 'RoundTrip',
        status: 'Approved',
      },
    ]);

    service.fetchStops().subscribe();
    httpTesting.expectOne('/api/stops/admin').flush([
      { stopId: 62, routeId: 45, name: 'R26 Test Stop', stopOrder: 1 },
    ]);

    service.fetchRoutes().subscribe();
    httpTesting.expectOne('/api/routes/admin').flush([
      { routeId: 45, routeNumber: 'TEST-ACTIVE-01', name: 'Active Driver and Bus Test', capacity: 25, enrolledStudents: 2, isActive: true },
    ]);

    const s71 = service.students().find((s) => s.studentId === 71)!;
    expect(s71.routeNumber).toBe('TEST-ACTIVE-01');
    expect(s71.routeName).toBe('Active Driver and Bus Test');
    expect(s71.stopName).toBe('R26 Test Stop');
    expect(s71.status).toBe('Active');

    const s72 = service.students().find((s) => s.studentId === 72)!;
    expect(s72.routeNumber).toBe('TEST-ACTIVE-01');
    expect(s72.routeName).toBe('Active Driver and Bus Test');
    expect(s72.status).toBe('Active');
  });

  it('should compute unique Approved enrolledStudents per route when /api/routes/admin omits counts and mark unavailable if subscriptions fail', () => {
    service.fetchRoutes().subscribe();
    httpTesting.expectOne('/api/routes/admin').flush([
      { routeId: 45, routeNumber: 'TEST-ACTIVE-01', name: 'Active Driver and Bus Test', capacity: 20, isActive: true },
    ]);

    // Before subscriptions load, route has no known enrolled count (do not report false 0)
    expect(service.routes()[0].hasEnrolledCount).toBe(false);
    expect(service.hasOccupiedCapacityData()).toBe(false);

    // If subscriptions endpoint fails, keep hasEnrolledCount as false
    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush({ message: 'Server error' }, { status: 500, statusText: 'Error' });
    expect(service.routes()[0].hasEnrolledCount).toBe(false);
    expect(service.hasOccupiedCapacityData()).toBe(false);

    // Once subscriptions load cleanly, count unique students with Approved subscriptions for each route
    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      { subscriptionId: 101, studentId: 71, studentName: 'Capacity Test Student Two', routeId: 45, status: 'Approved' },
      { subscriptionId: 102, studentId: 71, studentName: 'Capacity Test Student Two', routeId: 45, status: 'Approved' },
      { subscriptionId: 103, studentId: 72, studentName: 'Pending Student', routeId: 45, status: 'Pending' },
      { subscriptionId: 104, studentId: 73, studentName: 'Rejected Student', routeId: 45, status: 'Rejected' },
      { subscriptionId: 105, studentId: 74, studentName: 'Awaiting Student', routeId: 45, status: 'AwaitingPayment' },
    ]);

    expect(service.routes()[0].hasEnrolledCount).toBe(true);
    expect(service.routes()[0].enrolledStudents).toBe(1);
    expect(service.hasOccupiedCapacityData()).toBe(true);
    expect(service.occupiedCapacity()).toBe(1);
  });

  it('should resolve student route even when subscription has routeId 0 or dash placeholders and string route field', () => {
    service.fetchRoutes().subscribe();
    httpTesting.expectOne('/api/routes/admin').flush([
      { routeId: 1, routeNumber: 'R1', name: 'Abdoun Line', capacity: 30, isActive: true },
    ]);

    service.fetchStops().subscribe();
    httpTesting.expectOne('/api/stops/admin').flush([
      { stopId: 11, routeId: 1, name: 'Abdoun Circle', stopOrder: 1 },
    ]);

    service.fetchSubscriptions().subscribe();
    httpTesting.expectOne('/api/subscriptions/admin').flush([
      {
        subscriptionId: 301,
        studentId: 1,
        studentName: 'Yazan Ahmad',
        routeId: 0,
        routeNumber: '-',
        routeName: '—',
        stopName: 'Abdoun Circle',
        status: 'Approved',
      },
      {
        subscriptionId: 302,
        studentId: 2,
        studentName: 'Rama Ahmad',
        route: 'Abdoun Line',
        status: 'Approved',
      },
    ]);

    service.fetchStudents().subscribe();
    httpTesting.expectOne('/api/students/admin').flush([
      { studentId: 1, fullName: 'Yazan Ahmad', grade: 'Grade 5', className: 'A' },
      { studentId: 2, fullName: 'Rama Ahmad', grade: 'Grade 3', className: 'B' },
    ]);

    const yazan = service.students().find((s) => s.studentId === 1)!;
    expect(yazan.routeNumber).toBe('R1');
    expect(yazan.routeName).toBe('Abdoun Line');

    const rama = service.students().find((s) => s.studentId === 2)!;
    expect(rama.routeNumber).toBe('R1');
    expect(rama.routeName).toBe('Abdoun Line');
  });
});
