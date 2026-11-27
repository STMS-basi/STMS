import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';

export type AdminResource =
  | 'students'
  | 'parents'
  | 'routes'
  | 'stops'
  | 'buses'
  | 'drivers'
  | 'subscriptions'
  | 'payments';

export interface AdminStudentItem {
  readonly studentId: number;
  readonly parentId?: number;
  readonly routeId?: number;
  readonly stopId?: number;
  readonly fullName: string;
  readonly parentName: string;
  readonly parentEmail: string;
  readonly grade: string;
  readonly className: string;
  readonly routeNumber: string;
  readonly routeName: string;
  readonly stopName: string;
  readonly transportType: 'OneWay' | 'RoundTrip';
  readonly status: 'Active' | 'Pending' | 'Inactive';
}

export interface AdminParentItem {
  readonly parentId: number;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly studentsCount: number;
  readonly hasExplicitCount?: boolean;
}

export interface AdminRouteItem {
  readonly routeId: number;
  readonly routeNumber: string;
  readonly name: string;
  readonly startPoint: string;
  readonly destination: string;
  readonly serviceArea: string;
  readonly capacity: number;
  readonly enrolledStudents: number;
  readonly hasEnrolledCount?: boolean;
  readonly isActive: boolean;
  readonly busId?: number;
  readonly busPlate: string;
  readonly driverId?: number;
  readonly driverName: string;
}

export interface AdminStopItem {
  readonly stopId: number;
  readonly routeId: number;
  readonly routeNumber: string;
  readonly name: string;
  readonly stopOrder: number;
  readonly pickupTime: string;
  readonly dropoffTime: string;
}

export interface AdminBusItem {
  readonly busId: number;
  readonly plateNumber: string;
  readonly capacity: number;
  readonly routeId?: number;
  readonly driverId?: number;
  readonly assignedRoute: string;
  readonly isActive: boolean;
}

export interface AdminDriverItem {
  readonly driverId: number;
  readonly fullName: string;
  readonly phone: string;
  readonly licenseNumber: string;
  readonly busId?: number;
  readonly routeId?: number;
  readonly assignedBus: string;
  readonly isActive: boolean;
}

export interface AdminSubscriptionItem {
  readonly subscriptionId: number;
  readonly studentId?: number;
  readonly parentId?: number;
  readonly routeId?: number;
  readonly stopId?: number;
  readonly referenceNumber: string;
  readonly studentName: string;
  readonly parentName: string;
  readonly routeNumber: string;
  readonly routeName: string;
  readonly stopName: string;
  readonly transportType: 'OneWay' | 'RoundTrip';
  readonly fee: number;
  readonly status: 'Pending' | 'AwaitingPayment' | 'Approved' | 'Rejected';
  readonly requestedAt: string;
}

export interface AdminPaymentItem {
  readonly paymentId: number;
  readonly subscriptionId?: number;
  readonly studentId?: number;
  readonly parentId?: number;
  readonly subscriptionStatus?: string;
  readonly referenceNumber: string;
  readonly studentName: string;
  readonly parentName: string;
  readonly amountDue: number;
  readonly amountPaid: number;
  readonly status: 'Unpaid' | 'Partial' | 'Paid';
  readonly paymentDate: string;
  readonly recordedBy: string;
}

const LEGACY_STORAGE_KEYS = [
  'stms_admin_routes',
  'stms_admin_stops',
  'stms_admin_buses',
  'stms_admin_drivers',
  'stms_admin_subscriptions',
  'stms_admin_payments',
  'stms_admin_students',
  'stms_admin_parents',
];

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly http = inject(HttpClient);

  private readonly rawRoutesSignal = signal<AdminRouteItem[]>([]);
  private readonly rawStopsSignal = signal<AdminStopItem[]>([]);
  private readonly rawBusesSignal = signal<AdminBusItem[]>([]);
  private readonly rawDriversSignal = signal<AdminDriverItem[]>([]);
  private readonly rawSubscriptionsSignal = signal<AdminSubscriptionItem[]>([]);
  private readonly hasLoadedSubscriptionsSignal = signal(false);
  private readonly rawPaymentsSignal = signal<AdminPaymentItem[]>([]);
  private readonly rawStudentsSignal = signal<AdminStudentItem[]>([]);
  private readonly rawParentsSignal = signal<AdminParentItem[]>([]);
  private readonly errorsSignal = signal<Partial<Record<AdminResource, string>>>({});

  public readonly errors = this.errorsSignal.asReadonly();

  constructor() {
    this.clearLegacyStorage();
  }

  public readonly routes = computed<AdminRouteItem[]>(() => {
    const buses = this.rawBusesSignal();
    const drivers = this.rawDriversSignal();
    const subs = this.subscriptions();
    const rawStudents = this.rawStudentsSignal();
    const subsLoaded = this.hasLoadedSubscriptionsSignal();

    return this.rawRoutesSignal().map((r) => {
      let busPlate = r.busPlate !== '—' ? r.busPlate : '';
      let matchedBus = r.busId ? buses.find((b) => b.busId === r.busId) : undefined;
      if (!matchedBus) {
        matchedBus = buses.find((b) => b.routeId === r.routeId);
      }
      if (!busPlate && matchedBus) {
        busPlate = matchedBus.plateNumber;
      }

      let driverName = r.driverName !== '—' ? r.driverName : '';
      let matchedDriver = r.driverId ? drivers.find((d) => d.driverId === r.driverId) : undefined;
      if (!matchedDriver) {
        const targetBusId = r.busId ?? matchedBus?.busId;
        matchedDriver = drivers.find(
          (d) => d.routeId === r.routeId || (targetBusId ? d.busId === targetBusId : false)
        );
      }
      if (!driverName && matchedDriver) {
        driverName = matchedDriver.fullName;
      }

      const derivedCount = subsLoaded
        ? this.countApprovedStudentsForRoute(r, subs, rawStudents)
        : 0;
      const hasEnrolledCount = Boolean(r.hasEnrolledCount || subsLoaded);
      const enrolledStudents = r.hasEnrolledCount
        ? (subsLoaded ? Math.max(r.enrolledStudents, derivedCount) : r.enrolledStudents)
        : derivedCount;

      return {
        ...r,
        enrolledStudents,
        hasEnrolledCount,
        busPlate: busPlate || '—',
        driverName: driverName || '—',
      };
    });
  });

  public readonly stops = computed<AdminStopItem[]>(() => {
    const routes = this.rawRoutesSignal();
    return this.rawStopsSignal().map((s) => {
      if (s.routeNumber && s.routeNumber !== '—') {
        return s;
      }
      const matched = routes.find((r) => r.routeId === s.routeId);
      return {
        ...s,
        routeNumber: matched?.routeNumber || '—',
      };
    });
  });

  public readonly buses = computed<AdminBusItem[]>(() => {
    const routes = this.rawRoutesSignal();
    return this.rawBusesSignal().map((b) => {
      if (b.assignedRoute && b.assignedRoute !== '—') {
        return b;
      }
      const matchedRoute =
        (b.routeId ? routes.find((r) => r.routeId === b.routeId) : undefined) ??
        routes.find(
          (r) =>
            r.busId === b.busId ||
            (b.plateNumber !== '—' && r.busPlate !== '—' && r.busPlate.toLowerCase() === b.plateNumber.toLowerCase())
        );

      return {
        ...b,
        assignedRoute: matchedRoute ? this.formatRouteLabel(matchedRoute.routeNumber, matchedRoute.name) : '—',
      };
    });
  });

  public readonly drivers = computed<AdminDriverItem[]>(() => {
    const buses = this.buses();
    const routes = this.routes();

    return this.rawDriversSignal().map((d) => {
      if (d.assignedBus && d.assignedBus !== '—') {
        return d;
      }

      const matchedBus =
        (d.busId ? buses.find((b) => b.busId === d.busId) : undefined) ??
        buses.find((b) => b.driverId === d.driverId);

      const matchedRoute =
        (d.routeId ? routes.find((r) => r.routeId === d.routeId) : undefined) ??
        routes.find(
          (r) =>
            r.driverId === d.driverId ||
            (d.fullName !== '—' && r.driverName !== '—' && r.driverName.toLowerCase() === d.fullName.toLowerCase())
        );

      let assignedBus = '';
      if (matchedBus && matchedBus.plateNumber !== '—') {
        const routeSuffix = matchedBus.assignedRoute !== '—' ? ` (${matchedBus.assignedRoute})` : '';
        assignedBus = `${matchedBus.plateNumber}${routeSuffix}`;
      } else if (matchedRoute && matchedRoute.busPlate !== '—') {
        const routeNum = matchedRoute.routeNumber !== '—' ? ` (${matchedRoute.routeNumber})` : '';
        assignedBus = `${matchedRoute.busPlate}${routeNum}`;
      }

      return {
        ...d,
        assignedBus: assignedBus || '—',
      };
    });
  });

  public readonly parents = computed<AdminParentItem[]>(() => {
    const rawStudents = this.rawStudentsSignal();
    return this.rawParentsSignal().map((p) => {
      if (p.hasExplicitCount) {
        return p;
      }
      const matchedCount = rawStudents.filter(
        (s) =>
          (p.parentId > 0 && s.parentId === p.parentId) ||
          (p.email && s.parentEmail && s.parentEmail.toLowerCase() === p.email.toLowerCase()) ||
          (p.fullName !== '—' && s.parentName !== '—' && s.parentName.toLowerCase() === p.fullName.toLowerCase())
      ).length;
      return {
        ...p,
        studentsCount: matchedCount,
      };
    });
  });

  public readonly students = computed<AdminStudentItem[]>(() => {
    const parents = this.rawParentsSignal();
    const subs = this.subscriptions();
    const routes = this.rawRoutesSignal();
    const stops = this.rawStopsSignal();

    return this.rawStudentsSignal().map((st) => {
      let parentName = st.parentName;
      let parentEmail = st.parentEmail;

      if (parentName === '—') {
        const matchedParent = parents.find(
          (p) =>
            (st.parentId && p.parentId === st.parentId) ||
            (parentEmail && p.email && p.email.toLowerCase() === parentEmail.toLowerCase())
        );
        if (matchedParent) {
          parentName = matchedParent.fullName;
          parentEmail = parentEmail || matchedParent.email;
        }
      }

      const studentSubs = subs.filter((s) => {
        if (st.studentId > 0 && s.studentId && s.studentId > 0) {
          return s.studentId === st.studentId;
        }
        return (
          s.studentName !== '—' &&
          s.studentName.trim().toLowerCase() === st.fullName.trim().toLowerCase()
        );
      });

      const hasRouteInfo = (s: AdminSubscriptionItem): boolean =>
        s.routeNumber !== '—' ||
        (s.routeName !== '—' && s.routeName.trim().length > 0) ||
        Boolean(s.routeId && s.routeId > 0);

      // Prefer Approved subscription for current active route assignment, then pending/awaiting payment
      const matchedSub =
        studentSubs.find((s) => s.status === 'Approved' && hasRouteInfo(s)) ??
        studentSubs.find((s) => s.status === 'Approved') ??
        studentSubs.find((s) => s.status === 'Pending' || s.status === 'AwaitingPayment') ??
        studentSubs[0];

      if (matchedSub) {
        const resolvedSub = this.resolveRouteAndStop(
          {
            routeId: (matchedSub.routeId && matchedSub.routeId > 0 ? matchedSub.routeId : undefined) ?? st.routeId,
            stopId: (matchedSub.stopId && matchedSub.stopId > 0 ? matchedSub.stopId : undefined) ?? st.stopId,
            routeNumber: matchedSub.routeNumber !== '—' ? matchedSub.routeNumber : st.routeNumber,
            routeName: matchedSub.routeName !== '—' ? matchedSub.routeName : st.routeName,
            stopName: matchedSub.stopName !== '—' ? matchedSub.stopName : st.stopName,
          },
          routes,
          stops,
          ''
        );

        return {
          ...st,
          parentName,
          parentEmail,
          routeId: resolvedSub.routeId,
          stopId: resolvedSub.stopId,
          routeNumber: resolvedSub.routeNumber,
          routeName: resolvedSub.routeName,
          stopName: resolvedSub.stopName,
          transportType: matchedSub.transportType,
          status:
            matchedSub.status === 'Approved'
              ? 'Active'
              : matchedSub.status === 'Pending' || matchedSub.status === 'AwaitingPayment'
                ? 'Pending'
                : 'Inactive',
        };
      }

      const resolved = this.resolveRouteAndStop(
        {
          routeId: st.routeId,
          stopId: st.stopId,
          routeNumber: st.routeNumber,
          routeName: st.routeName,
          stopName: st.stopName,
        },
        routes,
        stops,
        ''
      );

      return {
        ...st,
        parentName,
        parentEmail,
        routeId: resolved.routeId,
        stopId: resolved.stopId,
        routeNumber: resolved.routeNumber,
        routeName: resolved.routeName,
        stopName: resolved.stopName,
      };
    });
  });

  public readonly subscriptions = computed<AdminSubscriptionItem[]>(() => {
    const rawStudents = this.rawStudentsSignal();
    const parents = this.rawParentsSignal();
    const routes = this.rawRoutesSignal();
    const stops = this.rawStopsSignal();

    return this.rawSubscriptionsSignal().map((sub) => {
      let parentName = sub.parentName;

      if (parentName === '—') {
        const matchedStudent = rawStudents.find((st) => {
          if (sub.studentId && sub.studentId > 0 && st.studentId > 0) {
            return st.studentId === sub.studentId;
          }
          return sub.studentName !== '—' && st.fullName.toLowerCase() === sub.studentName.toLowerCase();
        });
        if (matchedStudent && matchedStudent.parentName !== '—') {
          parentName = matchedStudent.parentName;
        } else {
          const targetParentId = sub.parentId ?? matchedStudent?.parentId;
          const matchedParent =
            (targetParentId ? parents.find((p) => p.parentId === targetParentId) : undefined) ??
            (matchedStudent?.parentEmail
              ? parents.find((p) => p.email && p.email.toLowerCase() === matchedStudent.parentEmail.toLowerCase())
              : undefined);
          if (matchedParent && matchedParent.fullName !== '—') {
            parentName = matchedParent.fullName;
          }
        }
      }

      const resolved = this.resolveRouteAndStop(
        {
          routeId: sub.routeId,
          stopId: sub.stopId,
          routeNumber: sub.routeNumber,
          routeName: sub.routeName,
          stopName: sub.stopName,
        },
        routes,
        stops,
        '—'
      );

      return {
        ...sub,
        routeId: resolved.routeId,
        stopId: resolved.stopId,
        parentName: parentName || '—',
        routeNumber: resolved.routeNumber,
        routeName: resolved.routeName,
        stopName: resolved.stopName,
      };
    });
  });

  public readonly payments = computed<AdminPaymentItem[]>(() => {
    const subs = this.subscriptions();
    const students = this.students();
    const parents = this.rawParentsSignal();

    const enrichedPayments = this.rawPaymentsSignal().map((pm) => {
      const matchedSub = subs.find(
        (s) =>
          (pm.subscriptionId && s.subscriptionId === pm.subscriptionId) ||
          (pm.referenceNumber && s.referenceNumber === pm.referenceNumber)
      );

      let studentName = pm.studentName;
      if (studentName === '—' && matchedSub) {
        studentName = matchedSub.studentName;
      }

      let parentName = pm.parentName;
      if (parentName === '—' && matchedSub && matchedSub.parentName !== '—') {
        parentName = matchedSub.parentName;
      }
      if (parentName === '—') {
        const matchedStudent = students.find(
          (st) =>
            (pm.studentId && st.studentId === pm.studentId) ||
            (studentName !== '—' && st.fullName.toLowerCase() === studentName.toLowerCase())
        );
        if (matchedStudent && matchedStudent.parentName !== '—') {
          parentName = matchedStudent.parentName;
        } else if (pm.parentId) {
          const matchedParent = parents.find((p) => p.parentId === pm.parentId);
          if (matchedParent && matchedParent.fullName !== '—') {
            parentName = matchedParent.fullName;
          }
        }
      }

      return {
        ...pm,
        studentName: studentName || '—',
        parentName: parentName || '—',
        subscriptionStatus: pm.subscriptionStatus ?? matchedSub?.status,
      };
    });

    const awaitingEntries: AdminPaymentItem[] = subs
      .filter(
        (sub) =>
          sub.status === 'AwaitingPayment' &&
          !enrichedPayments.some(
            (p) => p.subscriptionId === sub.subscriptionId || p.referenceNumber === sub.referenceNumber
          )
      )
      .map((sub) => ({
        paymentId: sub.subscriptionId + 100000,
        subscriptionId: sub.subscriptionId,
        studentId: sub.studentId,
        parentId: sub.parentId,
        subscriptionStatus: sub.status,
        referenceNumber: sub.referenceNumber,
        studentName: sub.studentName,
        parentName: sub.parentName,
        amountDue: sub.fee,
        amountPaid: 0,
        status: 'Unpaid' as const,
        paymentDate: sub.requestedAt,
        recordedBy: '—',
      }));

    return [...enrichedPayments, ...awaitingEntries];
  });

  public readonly totalStudents = computed(() => this.students().length);
  public readonly activeSubscriptions = computed(() => this.subscriptions().filter((s) => s.status === 'Approved').length);
  public readonly availableBuses = computed(() => this.buses().filter((b) => b.isActive).length);
  public readonly pendingRequests = computed(() => this.subscriptions().filter((s) => s.status === 'Pending').length);

  public readonly totalCapacity = computed(() =>
    this.buses()
      .filter((b) => b.isActive)
      .reduce((sum, b) => sum + b.capacity, 0)
  );
  public readonly occupiedCapacity = computed(() =>
    this.routes()
      .filter((r) => r.isActive)
      .reduce((sum, r) => sum + r.enrolledStudents, 0)
  );

  public readonly hasOccupiedCapacityData = computed(() => {
    const activeRoutes = this.routes().filter((r) => r.isActive);
    if (activeRoutes.length === 0) {
      return true;
    }
    return activeRoutes.every((r) => r.hasEnrolledCount !== false);
  });

  private countApprovedStudentsForRoute(
    route: AdminRouteItem,
    subs: readonly AdminSubscriptionItem[],
    rawStudents: readonly AdminStudentItem[]
  ): number {
    const uniqueStudents = new Set<string>();

    for (const sub of subs) {
      if (sub.status !== 'Approved') {
        continue;
      }

      const matchesRoute =
        sub.routeId !== undefined && sub.routeId > 0 && route.routeId > 0
          ? sub.routeId === route.routeId
          : (sub.routeNumber !== '—' &&
              route.routeNumber !== '—' &&
              sub.routeNumber.toLowerCase() === route.routeNumber.toLowerCase()) ||
            (sub.routeName !== '—' &&
              route.name !== '—' &&
              sub.routeName.toLowerCase() === route.name.toLowerCase());

      if (!matchesRoute) {
        continue;
      }

      let key = '';
      if (sub.studentId !== undefined && sub.studentId > 0) {
        key = `id:${sub.studentId}`;
      } else if (sub.studentName && sub.studentName !== '—') {
        const normalizedName = sub.studentName.trim().toLowerCase();
        const matchedStudent = rawStudents.find(
          (st) => st.studentId > 0 && st.fullName.trim().toLowerCase() === normalizedName
        );
        key = matchedStudent ? `id:${matchedStudent.studentId}` : `name:${normalizedName}`;
      } else {
        key = `sub:${sub.subscriptionId}`;
      }

      uniqueStudents.add(key);
    }

    return uniqueStudents.size;
  }

  private clearLegacyStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (const key of LEGACY_STORAGE_KEYS) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore storage errors in restricted environments
    }
  }

  private setResourceError(resource: AdminResource, err: unknown): void {
    const httpErr = err as HttpErrorResponse | undefined;
    const status = httpErr?.status ? `HTTP ${httpErr.status}` : 'Network Error';
    const backendMsg =
      httpErr?.error && typeof httpErr.error === 'object' && 'message' in httpErr.error
        ? String((httpErr.error as Record<string, unknown>)['message'])
        : '';
    const msg = backendMsg ? `${backendMsg} (${status})` : `Failed to load ${resource} (${status})`;
    this.errorsSignal.update((prev) => ({ ...prev, [resource]: msg }));
  }

  private clearResourceError(resource: AdminResource): void {
    if (this.errorsSignal()[resource]) {
      this.errorsSignal.update((prev) => {
        const next = { ...prev };
        delete next[resource];
        return next;
      });
    }
  }

  private resolveRouteAndStop(
    item: {
      routeId?: number;
      stopId?: number;
      routeNumber: string;
      routeName: string;
      stopName: string;
    },
    routes: readonly AdminRouteItem[],
    stops: readonly AdminStopItem[],
    emptyRouteName: string
  ): {
    routeId?: number;
    stopId?: number;
    routeNumber: string;
    routeName: string;
    stopName: string;
  } {
    let stopName = item.stopName;
    const stopIdVal = item.stopId && item.stopId > 0 ? item.stopId : undefined;
    const matchedStop =
      (stopIdVal ? stops.find((sp) => sp.stopId === stopIdVal) : undefined) ??
      (stopName !== '—' ? stops.find((sp) => sp.name.trim().toLowerCase() === stopName.trim().toLowerCase()) : undefined);
    if (stopName === '—' && matchedStop) {
      stopName = matchedStop.name;
    }

    const explicitRouteId = item.routeId && item.routeId > 0 ? item.routeId : undefined;
    const effectiveRouteId = explicitRouteId ?? matchedStop?.routeId;
    let routeNumber = item.routeNumber;
    let routeName = item.routeName;
    if (routeNumber === '—' || !routeName || routeName === '—') {
      const matchedRoute =
        (effectiveRouteId ? routes.find((r) => r.routeId === effectiveRouteId) : undefined) ??
        (routeNumber !== '—'
          ? routes.find((r) => r.routeNumber.toLowerCase() === routeNumber.toLowerCase())
          : undefined) ??
        (routeName && routeName !== '—'
          ? routes.find((r) => r.name.toLowerCase() === routeName.toLowerCase())
          : undefined) ??
        (matchedStop?.routeNumber && matchedStop.routeNumber !== '—'
          ? routes.find((r) => r.routeNumber.toLowerCase() === matchedStop.routeNumber.toLowerCase())
          : undefined);

      if (matchedRoute) {
        routeNumber = routeNumber === '—' ? matchedRoute.routeNumber : routeNumber;
        if (!routeName || routeName === '—') {
          routeName = matchedRoute.name !== '—' ? matchedRoute.name : emptyRouteName;
        }
      } else if (routeNumber === '—' && matchedStop?.routeNumber && matchedStop.routeNumber !== '—') {
        routeNumber = matchedStop.routeNumber;
      }
    }

    return {
      routeId: effectiveRouteId,
      stopId: stopIdVal ?? matchedStop?.stopId,
      routeNumber: routeNumber || '—',
      routeName: routeName || emptyRouteName,
      stopName: stopName || '—',
    };
  }

  private formatRouteLabel(routeNumber: string, routeName: string): string {
    const num = routeNumber !== '—' ? routeNumber.trim() : '';
    const name = routeName !== '—' ? routeName.trim() : '';
    if (num && name) return `${num} ${name}`;
    return num || name || '—';
  }

  private asRecord(val: unknown): Record<string, unknown> | null {
    return val && typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, unknown>) : null;
  }

  private pickString(
    obj: Record<string, unknown>,
    keys: readonly string[],
    ignoreValues: readonly string[] = []
  ): string {
    for (const key of keys) {
      const val = obj[key];
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed && !ignoreValues.some((ign) => ign.toLowerCase() === trimmed.toLowerCase())) {
          return trimmed;
        }
      }
    }
    return '';
  }

  private pickNumber(obj: Record<string, unknown>, keys: readonly string[]): number | undefined {
    for (const key of keys) {
      const val = obj[key];
      if (val !== undefined && val !== null && val !== '') {
        const num = Number(val);
        if (!Number.isNaN(num)) {
          return num;
        }
      }
    }
    return undefined;
  }

  private extractParentName(item: Record<string, unknown>, nestedStudent?: Record<string, unknown> | null): string {
    const ignore = ['parent', '—', '-', 'unknown', 'n/a', '[object object]'];
    const nameKeys = [
      'parentName', 'ParentName',
      'guardianName', 'GuardianName',
      'parentFullName', 'ParentFullName',
      'guardianFullName', 'GuardianFullName',
      'userName', 'UserName',
      'parentEmail', 'ParentEmail',
    ];

    let found = this.pickString(item, nameKeys, ignore);
    if (found) return found;

    for (const objKey of ['parent', 'Parent', 'guardian', 'Guardian', 'user', 'User']) {
      const nested = this.asRecord(item[objKey]);
      if (nested) {
        const full = this.pickString(nested, ['fullName', 'FullName', 'name', 'Name', 'userName', 'email'], ignore);
        if (full) return full;
        const first = this.pickString(nested, ['firstName', 'FirstName']);
        const last = this.pickString(nested, ['lastName', 'LastName']);
        if (first || last) return `${first} ${last}`.trim();
      }
    }

    if (nestedStudent) {
      found = this.pickString(nestedStudent, nameKeys, ignore);
      if (found) return found;
      const studentParent = this.asRecord(nestedStudent['parent'] ?? nestedStudent['Parent']);
      if (studentParent) {
        found = this.pickString(studentParent, ['fullName', 'FullName', 'name', 'Name', 'email'], ignore);
        if (found) return found;
      }
    }

    return '';
  }

  public addRoute(newRoute: Omit<AdminRouteItem, 'routeId'>): Observable<unknown> {
    const matchedBus = newRoute.busPlate
      ? this.rawBusesSignal().find((b) => b.plateNumber.toLowerCase() === newRoute.busPlate.trim().toLowerCase())
      : undefined;
    const matchedDriver = newRoute.driverName
      ? this.rawDriversSignal().find((d) => d.fullName.toLowerCase() === newRoute.driverName.trim().toLowerCase())
      : undefined;

    const payload = {
      routeNumber: newRoute.routeNumber,
      name: newRoute.name,
      startPoint: newRoute.startPoint,
      destination: newRoute.destination,
      serviceArea: newRoute.serviceArea,
      capacity: newRoute.capacity,
      busId: newRoute.busId ?? matchedBus?.busId ?? null,
      driverId: newRoute.driverId ?? matchedDriver?.driverId ?? null,
    };

    return this.http.post<Record<string, unknown>>('/api/routes/admin', payload).pipe(
      tap((res) => {
        const backendId = res && (res['routeId'] || res['id']) ? Number(res['routeId'] ?? res['id']) : Date.now();
        const localItem: AdminRouteItem = {
          ...newRoute,
          routeId: backendId,
          busId: payload.busId ?? undefined,
          driverId: payload.driverId ?? undefined,
        };
        this.rawRoutesSignal.update((prev) => [...prev, localItem]);
        this.fetchRoutes().subscribe();
      })
    );
  }

  public toggleRouteActive(routeId: number): Observable<unknown> {
    const route = this.rawRoutesSignal().find((r) => r.routeId === routeId);
    if (!route) return of(null);

    const newStatus = !route.isActive;
    const endpoint = newStatus
      ? `/api/routes/admin/${routeId}/activate`
      : `/api/routes/admin/${routeId}/deactivate`;

    return this.http.patch(endpoint, {}).pipe(
      tap(() => {
        this.rawRoutesSignal.update((prev) =>
          prev.map((r) => (r.routeId === routeId ? { ...r, isActive: newStatus } : r))
        );
        this.fetchRoutes().subscribe();
      })
    );
  }

  public addStop(newStop: Omit<AdminStopItem, 'stopId'>): Observable<unknown> {
    const payload = {
      name: newStop.name.trim(),
      routeId: newStop.routeId,
      stopOrder: newStop.stopOrder,
      pickupTime: newStop.pickupTime.trim() || null,
      dropoffTime: newStop.dropoffTime.trim() || null,
    };

    return this.http.post<Record<string, unknown>>('/api/stops/admin', payload).pipe(
      tap((res) => {
        const backendId = res && (res['stopId'] || res['id']) ? Number(res['stopId'] ?? res['id']) : Date.now();
        const item: AdminStopItem = { ...newStop, stopId: backendId };
        this.rawStopsSignal.update((prev) => [...prev, item]);
        this.fetchStops().subscribe();
      })
    );
  }

  public deleteStop(stopId: number): Observable<unknown> {
    return this.http.delete(`/api/stops/admin/${stopId}`).pipe(
      tap(() => {
        this.rawStopsSignal.update((prev) => prev.filter((s) => s.stopId !== stopId));
        this.fetchStops().subscribe();
      })
    );
  }

  public addBus(newBus: Omit<AdminBusItem, 'busId'>): Observable<unknown> {
    const payload = {
      plateNumber: newBus.plateNumber.trim(),
      capacity: newBus.capacity,
    };

    return this.http.post<Record<string, unknown>>('/api/buses/admin', payload).pipe(
      tap((res) => {
        const backendId = res && (res['busId'] || res['id']) ? Number(res['busId'] ?? res['id']) : Date.now();
        const item: AdminBusItem = { ...newBus, busId: backendId };
        this.rawBusesSignal.update((prev) => [...prev, item]);
        this.fetchBuses().subscribe();
      })
    );
  }

  public toggleBusActive(busId: number): Observable<unknown> {
    const bus = this.rawBusesSignal().find((b) => b.busId === busId);
    if (!bus) return of(null);

    const newStatus = !bus.isActive;
    const endpoint = newStatus
      ? `/api/buses/admin/${busId}/activate`
      : `/api/buses/admin/${busId}/deactivate`;

    return this.http.patch(endpoint, {}).pipe(
      tap(() => {
        this.rawBusesSignal.update((prev) =>
          prev.map((b) => (b.busId === busId ? { ...b, isActive: newStatus } : b))
        );
        this.fetchBuses().subscribe();
      })
    );
  }

  public addDriver(newDriver: Omit<AdminDriverItem, 'driverId'>): Observable<unknown> {
    const payload = {
      fullName: newDriver.fullName.trim(),
      phone: newDriver.phone.trim(),
      licenseNumber: newDriver.licenseNumber.trim(),
    };

    return this.http.post<Record<string, unknown>>('/api/drivers/admin', payload).pipe(
      tap((res) => {
        const backendId = res && (res['driverId'] || res['id']) ? Number(res['driverId'] ?? res['id']) : Date.now();
        const item: AdminDriverItem = { ...newDriver, driverId: backendId };
        this.rawDriversSignal.update((prev) => [...prev, item]);
        this.fetchDrivers().subscribe();
      })
    );
  }

  public toggleDriverActive(driverId: number): Observable<unknown> {
    const driver = this.rawDriversSignal().find((d) => d.driverId === driverId);
    if (!driver) return of(null);

    const newStatus = !driver.isActive;
    const endpoint = newStatus
      ? `/api/drivers/admin/${driverId}/activate`
      : `/api/drivers/admin/${driverId}/deactivate`;

    return this.http.patch(endpoint, {}).pipe(
      tap(() => {
        this.rawDriversSignal.update((prev) =>
          prev.map((d) => (d.driverId === driverId ? { ...d, isActive: newStatus } : d))
        );
        this.fetchDrivers().subscribe();
      })
    );
  }

  public fetchBuses(): Observable<AdminBusItem[]> {
    return this.http.get<unknown[]>('/api/buses/admin').pipe(
      tap((items) => {
        this.clearResourceError('buses');
        const mapped = Array.isArray(items) ? items.map((i) => this.mapBus(i as Record<string, unknown>)) : [];
        this.rawBusesSignal.set(mapped);
      }),
      map(() => this.buses()),
      catchError((err) => {
        console.error('Failed to fetch buses from /api/buses/admin', err);
        this.setResourceError('buses', err);
        this.rawBusesSignal.set([]);
        return of([]);
      })
    );
  }

  private mapBus(item: Record<string, unknown>): AdminBusItem {
    const busId = this.pickNumber(item, ['busId', 'BusId', 'id', 'Id']) ?? 0;
    const plateNumber = this.pickString(item, ['plateNumber', 'PlateNumber', 'busPlate', 'BusPlate']) || '—';
    const capacity = this.pickNumber(item, ['capacity', 'Capacity']) ?? 0;
    const isActive = item['isActive'] !== false && item['status'] !== 'Inactive';

    const routeObj = this.asRecord(item['route'] ?? item['Route'] ?? item['currentRoute']);
    const routeId =
      this.pickNumber(item, ['routeId', 'RouteId', 'assignedRouteId', 'AssignedRouteId']) ??
      (routeObj ? this.pickNumber(routeObj, ['routeId', 'RouteId', 'id', 'Id']) : undefined);
    const driverObj = this.asRecord(item['driver'] ?? item['Driver']);
    const driverId =
      this.pickNumber(item, ['driverId', 'DriverId']) ??
      (driverObj ? this.pickNumber(driverObj, ['driverId', 'DriverId', 'id', 'Id']) : undefined);

    let assignedRoute = this.pickString(item, [
      'assignedRoute', 'AssignedRoute',
      'routeName', 'RouteName',
      'routeNumber', 'RouteNumber',
    ]);
    if (!assignedRoute && routeObj) {
      const rNum = this.pickString(routeObj, ['routeNumber', 'RouteNumber']);
      const rName = this.pickString(routeObj, ['name', 'Name', 'routeName', 'RouteName']);
      assignedRoute = this.formatRouteLabel(rNum || '—', rName || '—');
    }

    return {
      busId,
      plateNumber,
      capacity,
      routeId,
      driverId,
      assignedRoute: assignedRoute && assignedRoute !== '—' ? assignedRoute : '—',
      isActive,
    };
  }

  public fetchDrivers(): Observable<AdminDriverItem[]> {
    return this.http.get<unknown[]>('/api/drivers/admin').pipe(
      tap((items) => {
        this.clearResourceError('drivers');
        const mapped = Array.isArray(items) ? items.map((i) => this.mapDriver(i as Record<string, unknown>)) : [];
        this.rawDriversSignal.set(mapped);
      }),
      map(() => this.drivers()),
      catchError((err) => {
        console.error('Failed to fetch drivers from /api/drivers/admin', err);
        this.setResourceError('drivers', err);
        this.rawDriversSignal.set([]);
        return of([]);
      })
    );
  }

  private mapDriver(item: Record<string, unknown>): AdminDriverItem {
    const driverId = this.pickNumber(item, ['driverId', 'DriverId', 'id', 'Id']) ?? 0;
    const fullName = this.pickString(item, ['fullName', 'FullName', 'name', 'Name']) || '—';
    const phone = this.pickString(item, ['phone', 'Phone', 'phoneNumber', 'PhoneNumber']) || '—';
    const licenseNumber = this.pickString(item, ['licenseNumber', 'LicenseNumber', 'license', 'License']) || '—';
    const isActive = item['isActive'] !== false && item['status'] !== 'Inactive';

    const busObj = this.asRecord(item['bus'] ?? item['Bus'] ?? item['assignedBusObj']);
    const routeObj = this.asRecord(item['route'] ?? item['Route']);
    const busId =
      this.pickNumber(item, ['busId', 'BusId', 'assignedBusId', 'AssignedBusId']) ??
      (busObj ? this.pickNumber(busObj, ['busId', 'BusId', 'id', 'Id']) : undefined);
    const routeId =
      this.pickNumber(item, ['routeId', 'RouteId', 'assignedRouteId', 'AssignedRouteId']) ??
      (routeObj ? this.pickNumber(routeObj, ['routeId', 'RouteId', 'id', 'Id']) : undefined);

    let assignedBus = this.pickString(item, [
      'assignedBus', 'AssignedBus',
      'busPlate', 'BusPlate',
      'plateNumber', 'PlateNumber',
    ]);
    if (!assignedBus && busObj) {
      assignedBus = this.pickString(busObj, ['plateNumber', 'PlateNumber', 'busPlate', 'BusPlate']);
    }

    return {
      driverId,
      fullName,
      phone,
      licenseNumber,
      busId,
      routeId,
      assignedBus: assignedBus || '—',
      isActive,
    };
  }

  public fetchStops(): Observable<AdminStopItem[]> {
    return this.http.get<unknown[]>('/api/stops/admin').pipe(
      tap((items) => {
        this.clearResourceError('stops');
        const mapped = Array.isArray(items) ? items.map((i) => this.mapStop(i as Record<string, unknown>)) : [];
        this.rawStopsSignal.set(mapped);
      }),
      map(() => this.stops()),
      catchError((err) => {
        console.error('Failed to fetch stops from /api/stops/admin', err);
        this.setResourceError('stops', err);
        this.rawStopsSignal.set([]);
        return of([]);
      })
    );
  }

  private mapStop(item: Record<string, unknown>, route?: AdminRouteItem): AdminStopItem {
    const stopId = this.pickNumber(item, ['stopId', 'StopId', 'id', 'Id']) ?? 0;
    const routeObj = this.asRecord(item['route'] ?? item['Route']);
    const routeId =
      this.pickNumber(item, ['routeId', 'RouteId']) ??
      (routeObj ? this.pickNumber(routeObj, ['routeId', 'RouteId', 'id', 'Id']) : undefined) ??
      route?.routeId ??
      0;
    const routeNumber =
      this.pickString(item, ['routeNumber', 'RouteNumber']) ||
      (routeObj ? this.pickString(routeObj, ['routeNumber', 'RouteNumber']) : '') ||
      route?.routeNumber ||
      '—';
    const name = this.pickString(item, ['name', 'Name', 'stopName', 'StopName']) || '—';
    const stopOrder = this.pickNumber(item, ['stopOrder', 'StopOrder', 'order', 'Order']) ?? 1;
    const pickupTime = this.pickString(item, ['pickupTime', 'PickupTime', 'pickUpTime']) || '—';
    const dropoffTime = this.pickString(item, ['dropoffTime', 'DropoffTime', 'dropOffTime']) || '—';
    return { stopId, routeId, routeNumber, name, stopOrder, pickupTime, dropoffTime };
  }

  public fetchParents(): Observable<AdminParentItem[]> {
    return this.http.get<unknown[]>('/api/parents/admin').pipe(
      tap((items) => {
        this.clearResourceError('parents');
        const mapped = Array.isArray(items) ? items.map((i) => this.mapParent(i as Record<string, unknown>)) : [];
        this.rawParentsSignal.set(mapped);
      }),
      map(() => this.parents()),
      catchError((err) => {
        console.error('Failed to fetch parents from /api/parents/admin', err);
        this.setResourceError('parents', err);
        this.rawParentsSignal.set([]);
        return of([]);
      })
    );
  }

  private mapParent(item: Record<string, unknown>): AdminParentItem {
    const parentId = this.pickNumber(item, ['parentId', 'ParentId', 'id', 'Id']) ?? 0;
    const userObj = this.asRecord(item['user'] ?? item['User']);

    let fullName = this.pickString(item, [
      'fullName', 'FullName',
      'name', 'Name',
      'parentName', 'ParentName',
      'guardianName', 'GuardianName',
      'userName', 'UserName',
    ]);
    if (!fullName && userObj) {
      fullName = this.pickString(userObj, ['fullName', 'FullName', 'name', 'Name', 'userName']);
    }
    if (!fullName) {
      const first = this.pickString(item, ['firstName', 'FirstName']);
      const last = this.pickString(item, ['lastName', 'LastName']);
      if (first || last) fullName = `${first} ${last}`.trim();
    }

    const email =
      this.pickString(item, ['email', 'Email', 'parentEmail', 'ParentEmail']) ||
      (userObj ? this.pickString(userObj, ['email', 'Email']) : '');
    const phone =
      this.pickString(item, ['phone', 'Phone', 'phoneNumber', 'PhoneNumber']) ||
      (userObj ? this.pickString(userObj, ['phone', 'Phone', 'phoneNumber']) : '') ||
      '—';
    const address = this.pickString(item, ['address', 'Address']) || '—';

    let studentsCount = this.pickNumber(item, [
      'studentCount', 'StudentCount',
      'studentsCount', 'StudentsCount',
      'childrenCount', 'ChildrenCount',
    ]);

    if (studentsCount === undefined) {
      const studentsArr = item['students'] ?? item['Students'] ?? item['children'] ?? item['Children'];
      if (Array.isArray(studentsArr)) {
        studentsCount = studentsArr.length;
      }
    }

    return {
      parentId,
      fullName: fullName || '—',
      email,
      phone,
      address,
      studentsCount: studentsCount ?? 0,
      hasExplicitCount: studentsCount !== undefined,
    };
  }

  public fetchSubscriptions(): Observable<AdminSubscriptionItem[]> {
    return this.http.get<unknown[]>('/api/subscriptions/admin').pipe(
      tap((items) => {
        this.clearResourceError('subscriptions');
        const isValidArray = Array.isArray(items);
        this.hasLoadedSubscriptionsSignal.set(isValidArray);
        const mapped = isValidArray
          ? items.map((i) => this.mapSubscription(i as Record<string, unknown>))
          : [];
        this.rawSubscriptionsSignal.set(mapped);
      }),
      map(() => this.subscriptions()),
      catchError((err) => {
        console.error('Failed to fetch subscriptions from /api/subscriptions/admin', err);
        this.setResourceError('subscriptions', err);
        this.hasLoadedSubscriptionsSignal.set(false);
        this.rawSubscriptionsSignal.set([]);
        return of([]);
      })
    );
  }

  public fetchStudents(): Observable<AdminStudentItem[]> {
    return this.http.get<unknown[]>('/api/students/admin').pipe(
      tap((items) => {
        this.clearResourceError('students');
        const mapped = Array.isArray(items) ? items.map((i) => this.mapStudent(i as Record<string, unknown>)) : [];
        this.rawStudentsSignal.set(mapped);
      }),
      map(() => this.students()),
      catchError((err) => {
        console.error('Failed to fetch students from /api/students/admin', err);
        this.setResourceError('students', err);
        this.rawStudentsSignal.set([]);
        return of([]);
      })
    );
  }

  public fetchRoutes(): Observable<AdminRouteItem[]> {
    return this.http.get<unknown[]>('/api/routes/admin').pipe(
      tap((items) => {
        this.clearResourceError('routes');
        const mapped = Array.isArray(items) ? items.map((i) => this.mapRoute(i as Record<string, unknown>)) : [];
        this.rawRoutesSignal.set(mapped);
      }),
      map(() => this.routes()),
      catchError((err) => {
        console.error('Failed to fetch routes from /api/routes/admin', err);
        this.setResourceError('routes', err);
        this.rawRoutesSignal.set([]);
        return of([]);
      })
    );
  }

  private mapStudent(item: Record<string, unknown>): AdminStudentItem {
    const studentId = this.pickNumber(item, ['studentId', 'StudentId', 'id', 'Id']) ?? 0;
    const fullName = this.pickString(item, ['fullName', 'FullName', 'name', 'Name', 'studentName']) || '—';
    const grade = this.pickString(item, ['grade', 'Grade']) || '—';
    const className = this.pickString(item, ['className', 'ClassName', 'section', 'Section', 'class']) || '—';

    const parentObj = this.asRecord(item['parent'] ?? item['Parent'] ?? item['guardian'] ?? item['Guardian']);
    const parentId =
      this.pickNumber(item, ['parentId', 'ParentId']) ??
      (parentObj ? this.pickNumber(parentObj, ['parentId', 'ParentId', 'id', 'Id']) : undefined);
    const parentName = this.extractParentName(item) || '—';
    const parentEmail =
      this.pickString(item, ['parentEmail', 'ParentEmail', 'email', 'Email']) ||
      (parentObj ? this.pickString(parentObj, ['email', 'Email']) : '');

    const routeObj = this.asRecord(item['route'] ?? item['Route']);
    const stopObj = this.asRecord(item['stop'] ?? item['Stop']);
    const routeId =
      this.pickNumber(item, ['routeId', 'RouteId']) ??
      (routeObj ? this.pickNumber(routeObj, ['routeId', 'RouteId', 'id', 'Id']) : undefined);
    const stopId =
      this.pickNumber(item, ['stopId', 'StopId']) ??
      (stopObj ? this.pickNumber(stopObj, ['stopId', 'StopId', 'id', 'Id']) : undefined);
    const routeNumber =
      this.pickString(item, ['routeNumber', 'RouteNumber', 'routeCode', 'RouteCode']) ||
      (routeObj ? this.pickString(routeObj, ['routeNumber', 'RouteNumber']) : '') ||
      '—';
    const routeName =
      this.pickString(item, ['routeName', 'RouteName']) ||
      (routeObj ? this.pickString(routeObj, ['name', 'Name', 'routeName']) : '');
    const stopName =
      this.pickString(item, ['stopName', 'StopName']) ||
      (stopObj ? this.pickString(stopObj, ['name', 'Name', 'stopName']) : '') ||
      '—';
    const rawType = this.pickString(item, ['transportType', 'TransportType']);
    const transportType: 'OneWay' | 'RoundTrip' = rawType === 'OneWay' ? 'OneWay' : 'RoundTrip';

    const rawStatus = this.pickString(item, ['status', 'Status']);
    let status: 'Active' | 'Pending' | 'Inactive' = 'Inactive';
    if (rawStatus === 'Active' || rawStatus === 'Approved') {
      status = 'Active';
    } else if (rawStatus === 'Pending' || rawStatus === 'AwaitingPayment') {
      status = 'Pending';
    } else if (routeNumber !== '—' || routeName) {
      status = 'Active';
    }

    return {
      studentId,
      parentId,
      routeId,
      stopId,
      fullName,
      parentName,
      parentEmail,
      grade,
      className,
      routeNumber,
      routeName,
      stopName,
      transportType,
      status,
    };
  }

  private mapRoute(item: Record<string, unknown>): AdminRouteItem {
    const routeId = this.pickNumber(item, ['routeId', 'RouteId', 'id', 'Id']) ?? 0;
    const routeNumber = this.pickString(item, ['routeNumber', 'RouteNumber']) || (routeId ? `R${routeId}` : '—');
    const name = this.pickString(item, ['name', 'Name', 'routeName', 'RouteName']) || '—';
    const startPoint = this.pickString(item, ['startPoint', 'StartPoint']) || '—';
    const destination = this.pickString(item, ['destination', 'Destination']) || '—';
    const serviceArea = this.pickString(item, ['serviceArea', 'ServiceArea']) || '—';
    const capacity = this.pickNumber(item, ['capacity', 'Capacity']) ?? 0;
    const explicitEnrolled = this.pickNumber(item, [
      'enrolledStudents',
      'EnrolledStudents',
      'studentCount',
      'studentsCount',
      'activeStudentsCount',
      'occupiedSeats',
    ]);
    const hasEnrolledCount = explicitEnrolled !== undefined;
    const enrolledStudents = explicitEnrolled ?? 0;

    let isActive = true;
    if (typeof item['isActive'] === 'boolean') {
      isActive = item['isActive'];
    } else if (typeof item['status'] === 'string') {
      isActive = (item['status'] as string).toLowerCase() === 'active';
    } else if (item['isActive'] !== undefined) {
      isActive = Boolean(item['isActive']);
    }

    const busObj = this.asRecord(item['bus'] ?? item['Bus']);
    const busId =
      this.pickNumber(item, ['busId', 'BusId']) ??
      (busObj ? this.pickNumber(busObj, ['busId', 'BusId', 'id', 'Id']) : undefined);
    const busPlate =
      this.pickString(item, ['busPlate', 'BusPlate', 'plateNumber', 'PlateNumber', 'assignedBusPlate']) ||
      (busObj ? this.pickString(busObj, ['plateNumber', 'PlateNumber', 'busPlate']) : '') ||
      '—';

    const driverObj = this.asRecord(item['driver'] ?? item['Driver']);
    const driverId =
      this.pickNumber(item, ['driverId', 'DriverId']) ??
      (driverObj ? this.pickNumber(driverObj, ['driverId', 'DriverId', 'id', 'Id']) : undefined);
    let driverName = this.pickString(item, ['driverName', 'DriverName', 'assignedDriverName']);
    if (!driverName && typeof item['driver'] === 'string') {
      driverName = (item['driver'] as string).trim();
    }
    if (!driverName && driverObj) {
      driverName = this.pickString(driverObj, ['fullName', 'FullName', 'name', 'Name']);
    }

    return {
      routeId,
      routeNumber,
      name,
      startPoint,
      destination,
      serviceArea,
      capacity,
      enrolledStudents,
      hasEnrolledCount,
      isActive,
      busId,
      busPlate,
      driverId,
      driverName: driverName || '—',
    };
  }

  private mapSubscription(item: Record<string, unknown>): AdminSubscriptionItem {
    const subId = this.pickNumber(item, ['subscriptionId', 'SubscriptionId', 'id', 'Id']) ?? 0;
    const studentObj = this.asRecord(item['student'] ?? item['Student']);
    const parentObj = this.asRecord(item['parent'] ?? item['Parent'] ?? item['guardian'] ?? item['Guardian']);
    const routeObj = this.asRecord(item['route'] ?? item['Route']);
    const stopObj = this.asRecord(item['stop'] ?? item['Stop']);

    const stuId =
      this.pickNumber(item, ['studentId', 'StudentId']) ??
      (studentObj ? this.pickNumber(studentObj, ['studentId', 'StudentId', 'id', 'Id']) : undefined);
    const parentId =
      this.pickNumber(item, ['parentId', 'ParentId']) ??
      (parentObj ? this.pickNumber(parentObj, ['parentId', 'ParentId', 'id', 'Id']) : undefined) ??
      (studentObj ? this.pickNumber(studentObj, ['parentId', 'ParentId']) : undefined);
    const routeId =
      this.pickNumber(item, ['routeId', 'RouteId']) ??
      (routeObj ? this.pickNumber(routeObj, ['routeId', 'RouteId', 'id', 'Id']) : undefined);
    const stopId =
      this.pickNumber(item, ['stopId', 'StopId']) ??
      (stopObj ? this.pickNumber(stopObj, ['stopId', 'StopId', 'id', 'Id']) : undefined);

    const refNum =
      this.pickString(item, ['referenceNumber', 'ReferenceNumber']) ||
      (subId ? `SUB 2026 ${subId}` : '—');
    let studentName = this.pickString(item, ['studentName', 'StudentName']);
    if (!studentName && typeof item['student'] === 'string') {
      studentName = (item['student'] as string).trim();
    }
    if (!studentName && studentObj) {
      studentName = this.pickString(studentObj, ['fullName', 'FullName', 'name', 'Name']);
    }

    const parentName = this.extractParentName(item, studentObj) || '—';

    const dashIgnore = ['—', '-', 'n/a', 'none'];
    const routeStr = typeof item['route'] === 'string' ? (item['route'] as string).trim() : '';
    const routeNumber =
      this.pickString(item, ['routeNumber', 'RouteNumber', 'routeCode', 'RouteCode'], dashIgnore) ||
      (routeObj ? this.pickString(routeObj, ['routeNumber', 'RouteNumber', 'routeCode'], dashIgnore) : '') ||
      '—';
    const routeName =
      this.pickString(item, ['routeName', 'RouteName', 'routeTitle', 'RouteTitle'], dashIgnore) ||
      (routeObj ? this.pickString(routeObj, ['name', 'Name', 'routeName'], dashIgnore) : '') ||
      (routeStr && !dashIgnore.includes(routeStr.toLowerCase()) ? routeStr : '') ||
      '—';
    const stopName =
      this.pickString(item, ['stopName', 'StopName'], dashIgnore) ||
      (stopObj ? this.pickString(stopObj, ['name', 'Name', 'stopName'], dashIgnore) : '') ||
      '—';

    const rawType = this.pickString(item, ['transportType', 'TransportType']);
    const type: 'OneWay' | 'RoundTrip' = rawType === 'OneWay' ? 'OneWay' : 'RoundTrip';
    const fee = this.pickNumber(item, ['fee', 'Fee']) ?? (type === 'OneWay' ? 150 : 300);

    const rawStatus = this.pickString(item, ['status', 'Status']) as
      | 'Pending'
      | 'AwaitingPayment'
      | 'Approved'
      | 'Rejected';
    const status = rawStatus || 'Pending';
    const requestedAt =
      this.pickString(item, ['requestedAt', 'RequestedAt', 'createdAt', 'CreatedAt']) || '—';

    return {
      subscriptionId: subId,
      studentId: stuId,
      parentId,
      routeId,
      stopId,
      referenceNumber: refNum,
      studentName: studentName || '—',
      parentName,
      routeNumber,
      routeName,
      stopName,
      transportType: type,
      fee,
      status,
      requestedAt,
    };
  }

  public fetchPayments(): Observable<AdminPaymentItem[]> {
    return this.http.get<unknown[]>('/api/payments/admin').pipe(
      tap((items) => {
        this.clearResourceError('payments');
        const mapped = Array.isArray(items) ? items.map((i) => this.mapPayment(i as Record<string, unknown>)) : [];
        this.rawPaymentsSignal.set(mapped);
      }),
      map(() => this.payments()),
      catchError((err) => {
        console.error('Failed to fetch payments from /api/payments/admin', err);
        this.setResourceError('payments', err);
        this.rawPaymentsSignal.set([]);
        return of([]);
      })
    );
  }

  private mapPayment(item: Record<string, unknown>): AdminPaymentItem {
    const paymentId = this.pickNumber(item, ['paymentId', 'PaymentId', 'id', 'Id']) ?? 0;
    const subObj = this.asRecord(item['subscription'] ?? item['Subscription']);
    const studentObj =
      this.asRecord(item['student'] ?? item['Student']) ??
      (subObj ? this.asRecord(subObj['student'] ?? subObj['Student']) : null);
    const parentObj = this.asRecord(item['parent'] ?? item['Parent'] ?? item['guardian'] ?? item['Guardian']);

    const subscriptionId =
      this.pickNumber(item, ['subscriptionId', 'SubscriptionId']) ??
      (subObj ? this.pickNumber(subObj, ['subscriptionId', 'SubscriptionId', 'id']) : undefined);
    const studentId =
      this.pickNumber(item, ['studentId', 'StudentId']) ??
      (studentObj ? this.pickNumber(studentObj, ['studentId', 'StudentId', 'id']) : undefined);
    const parentId =
      this.pickNumber(item, ['parentId', 'ParentId']) ??
      (parentObj ? this.pickNumber(parentObj, ['parentId', 'ParentId', 'id']) : undefined);

    const refNum =
      this.pickString(item, ['referenceNumber', 'ReferenceNumber']) ||
      (subObj ? this.pickString(subObj, ['referenceNumber', 'ReferenceNumber']) : '') ||
      (subscriptionId ? `SUB 2026 ${subscriptionId}` : `PAY-${paymentId}`);

    let studentName = this.pickString(item, ['studentName', 'StudentName']);
    if (!studentName && typeof item['student'] === 'string') {
      studentName = (item['student'] as string).trim();
    }
    if (!studentName && studentObj) {
      studentName = this.pickString(studentObj, ['fullName', 'FullName', 'name', 'Name']);
    }
    if (!studentName && subObj) {
      studentName = this.pickString(subObj, ['studentName', 'StudentName']);
    }

    const parentName = this.extractParentName(item, studentObj) || (subObj ? this.extractParentName(subObj) : '') || '—';
    const subscriptionStatus =
      this.pickString(item, ['subscriptionStatus', 'SubscriptionStatus']) ||
      (subObj ? this.pickString(subObj, ['status', 'Status']) : '') ||
      undefined;

    const amountDue = this.pickNumber(item, ['amountDue', 'AmountDue', 'amount', 'Amount']) ?? 0;
    const rawStatus = this.pickString(item, ['paymentStatus', 'PaymentStatus', 'status', 'Status']) || 'Unpaid';
    const explicitPaid = this.pickNumber(item, ['amountPaid', 'AmountPaid']);
    const amountPaid = explicitPaid !== undefined ? explicitPaid : rawStatus === 'Paid' ? amountDue : 0;

    let status: 'Unpaid' | 'Partial' | 'Paid' = 'Unpaid';
    if ((rawStatus === 'Paid' && (amountDue <= 0 || amountPaid >= amountDue)) || (amountDue > 0 && amountPaid >= amountDue)) {
      status = 'Paid';
    } else if (rawStatus === 'Partial' || (amountPaid > 0 && (amountDue <= 0 || amountPaid < amountDue))) {
      status = 'Partial';
    }

    const paymentDate =
      this.pickString(item, ['paymentDate', 'PaymentDate', 'paidAt', 'PaidAt', 'createdAt', 'CreatedAt']) || '—';
    const recordedBy =
      this.pickString(item, ['recordedBy', 'RecordedBy', 'confirmedBy']) || (status === 'Paid' ? 'Admin Office' : '—');

    return {
      paymentId,
      subscriptionId,
      studentId,
      parentId,
      subscriptionStatus,
      referenceNumber: refNum,
      studentName: studentName || '—',
      parentName,
      amountDue,
      amountPaid,
      status,
      paymentDate,
      recordedBy,
    };
  }

  public recordPayment(req: { subscriptionId: number; amount: number; notes?: string }): Observable<unknown> {
    const targetSub = this.subscriptions().find((s) => s.subscriptionId === req.subscriptionId);
    if (targetSub && targetSub.status !== 'AwaitingPayment') {
      return throwError(() => new Error('Only subscriptions awaiting payment can be confirmed as paid.'));
    }

    const expectedFee = targetSub
      ? (targetSub.fee > 0 ? targetSub.fee : targetSub.transportType === 'OneWay' ? 150 : 300)
      : undefined;

    if (typeof req.amount !== 'number' || Number.isNaN(req.amount) || req.amount <= 0) {
      return throwError(() => new Error('Full subscription payment amount is required.'));
    }

    if (expectedFee !== undefined && req.amount !== expectedFee) {
      return throwError(() => new Error(`Partial payments are not allowed. Full fee (${expectedFee} JOD) is required.`));
    }

    return this.http.post('/api/payments/admin', req).pipe(
      tap((response) => {
        const res = this.asRecord(response);
        const resSubStatus = res ? this.pickString(res, ['subscriptionStatus', 'SubscriptionStatus']) : '';
        const resPayStatus = res ? this.pickString(res, ['paymentStatus', 'PaymentStatus', 'status', 'Status']) : '';
        const resRemaining = res ? this.pickNumber(res, ['remainingAmount', 'RemainingAmount', 'outstandingBalance']) : undefined;

        const isFullConfirmed =
          resSubStatus === 'Approved' ||
          (!resSubStatus &&
            resPayStatus !== 'Partial' &&
            resPayStatus !== 'Unpaid' &&
            (resRemaining === undefined || resRemaining <= 0));

        if (!isFullConfirmed) {
          return;
        }

        this.updateSubscriptionStatus(req.subscriptionId, 'Approved');
        this.rawPaymentsSignal.update((prev) =>
          prev.map((p) =>
            p.subscriptionId === req.subscriptionId ||
            (targetSub && p.referenceNumber === targetSub.referenceNumber)
              ? {
                  ...p,
                  status: 'Paid' as const,
                  amountPaid: req.amount,
                  paymentDate: new Date().toISOString().split('T')[0],
                  recordedBy: 'Admin Office',
                }
              : p
          )
        );
      })
    );
  }

  public approveSubscription(subscriptionId: number): Observable<unknown> {
    return this.http.patch(`/api/subscriptions/admin/${subscriptionId}/approve`, {}).pipe(
      tap(() => {
        this.updateSubscriptionStatus(subscriptionId, 'AwaitingPayment');
      })
    );
  }

  public rejectSubscription(subscriptionId: number): Observable<unknown> {
    const sub = this.rawSubscriptionsSignal().find((s) => s.subscriptionId === subscriptionId);
    if (sub && sub.status !== 'Pending') {
      return throwError(() => new Error('Only pending subscriptions can be rejected.'));
    }

    return this.http.patch(`/api/subscriptions/admin/${subscriptionId}/reject`, {}).pipe(
      tap(() => {
        this.updateSubscriptionStatus(subscriptionId, 'Rejected');
      })
    );
  }

  public updateSubscriptionStatus(
    subscriptionId: number,
    status: 'Pending' | 'AwaitingPayment' | 'Approved' | 'Rejected'
  ): void {
    this.rawSubscriptionsSignal.update((prev) =>
      prev.map((s) => (s.subscriptionId === subscriptionId ? { ...s, status } : s))
    );
  }

  public updatePaymentStatus(
    paymentId: number,
    status: 'Unpaid' | 'Partial' | 'Paid',
    amountPaid?: number
  ): Observable<unknown> {
    if (status !== 'Paid') {
      return throwError(() => new Error('Backend only supports full payment confirmation.'));
    }

    const payment = this.payments().find((p) => p.paymentId === paymentId);
    if (!payment) {
      return throwError(() => new Error('Payment record not found.'));
    }

    const sub = this.subscriptions().find(
      (s) =>
        (payment.subscriptionId && s.subscriptionId === payment.subscriptionId) ||
        s.referenceNumber === payment.referenceNumber
    );
    if (!sub) {
      return throwError(() => new Error('Linked subscription not found for payment.'));
    }

    const amount = amountPaid ?? (payment.amountDue || sub.fee);
    return this.recordPayment({
      subscriptionId: sub.subscriptionId,
      amount,
      notes: 'Confirmed by School Administration',
    });
  }
}
