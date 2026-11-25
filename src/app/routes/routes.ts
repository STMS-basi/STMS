import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { Header } from '../header/header';
import { PreferencesService } from '../services/preferences.service';
import {
  RouteItem,
  RouteService,
  RouteStop as ServiceRouteStop,
} from '../services/route.service';

interface RouteStop {
  readonly name: string;
  readonly pickupTime: string;
  readonly dropoffTime: string;
}

interface SchoolRoute {
  readonly id: number;
  readonly routeNumber: string;
  readonly routeName: string;
  readonly serviceArea: string;
  readonly startingPoint: string;
  readonly destination: string;
  readonly pickupTime: string;
  readonly dropoffTime: string;
  readonly stops: readonly RouteStop[];
  readonly assignedBus: string | null;
  readonly assignedDriver: string | null;
  readonly capacity: number;
  readonly enrolledStudents: number;
  readonly isActive: boolean;
}

@Component({
  selector: 'app-routes',
  imports: [RouterLink, Header],
  templateUrl: './routes.html',
  styleUrl: './routes.css',
})
export class Routes implements OnInit {
  protected readonly prefs = inject(PreferencesService);
  private readonly routeService = inject(RouteService);

  protected readonly isArabic = computed(
    () => this.prefs.lang() === 'ar'
  );

  protected readonly isMenuOpen = signal(false);
  protected readonly searchTerm = signal('');
  protected readonly selectedArea = signal('All');
  protected readonly selectedRouteId = signal<number | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly loadingDetailsId = signal<number | null>(null);

  private readonly arabicText: Record<string, string> = {
    // Hero
    'School Routes and Stops': 'مسارات الحافلات المدرسية ومحطاتها',
    'Find school transportation routes, their stops, and pickup times.':
      'تعرّف على مسارات النقل المدرسي ومحطاتها ومواعيد الاصطحاب.',
    'View Services': 'عرض الخدمات',

    // Routes section
    'Available Routes': 'المسارات المتاحة',
    'Search by route name or number and select your service area.':
      'ابحث باسم المسار أو رقمه وحدد منطقة الخدمة.',
    'Search Routes': 'البحث عن المسارات',
    'Enter route name or number': 'أدخل اسم المسار أو رقمه',
    'Service Area': 'منطقة الخدمة',
    'All Areas': 'جميع المناطق',
    'Clear Filters': 'مسح عوامل التصفية',
    'Showing': 'عرض',
    'of': 'من أصل',
    'routes': 'مسارات',

    // Status
    'Available': 'متاح',
    'Inactive': 'غير نشط',
    'Full': 'مكتمل',
    'Active': 'نشط',

    // Route names
    'North Amman Route': 'مسار شمال عمّان',
    'West Amman Route': 'مسار غرب عمّان',
    'Downtown Route': 'مسار وسط البلد',
    'East Amman Route': 'مسار شرق عمّان',
    'South Amman Route': 'مسار جنوب عمّان',
    'University Street Route': 'مسار شارع الجامعة',

    // Areas
    'North Amman': 'شمال عمّان',
    'West Amman': 'غرب عمّان',
    'Downtown': 'وسط البلد',
    'East Amman': 'شرق عمّان',
    'South Amman': 'جنوب عمّان',

    // Locations
    'Abu Nseir': 'أبو نصير',
    'Abu Nseir Circle': 'دوار أبو نصير',
    'Shafa Badran': 'شفا بدران',
    'University Street': 'شارع الجامعة',
    'Basi School': 'مدرسة باصي',
    'Khalda': 'خلدا',
    'Khalda Circle': 'دوار خلدا',
    'Tla Al-Ali': 'تلاع العلي',
    'Dabouq': 'دابوق',
    'Ras Al-Ain': 'رأس العين',
    'Downtown Amman': 'وسط عمّان',
    'Jabal Amman': 'جبل عمّان',
    'Marka': 'ماركا',
    'Prince Hamzah Hospital Area': 'منطقة مستشفى الأمير حمزة',
    'Tabarbour': 'طبربور',
    'Naour': 'ناعور',
    'Marj Al-Hamam': 'مرج الحمام',
    'Airport Road': 'طريق المطار',
    'Jubaiha': 'الجبيهة',
    'Jordan University Gate': 'بوابة الجامعة الأردنية',

    // Route card
    'Starting Point': 'نقطة الانطلاق',
    'Destination': 'الوجهة',
    'Morning Pickup': 'الاصطحاب الصباحي',
    'Afternoon Drop-off': 'التوصيل بعد الظهر',
    'Stops': 'المحطات',
    'Hide Details': 'إخفاء التفاصيل',
    'View Route Details': 'عرض تفاصيل المسار',

    // Expanded details
    'Complete Route Details': 'تفاصيل المسار الكاملة',
    'Route Number:': 'رقم المسار:',
    'Route Name:': 'اسم المسار:',
    'Service Area:': 'منطقة الخدمة:',
    'Starting Point:': 'نقطة الانطلاق:',
    'Destination:': 'الوجهة:',
    'Route Status:': 'حالة المسار:',

    // Schedule
    'Stops and Pickup / Drop-off Schedules':
      'المحطات وجداول الاصطحاب والتوصيل',
    'Stop': 'المحطة',
    'Loading routes...': 'جاري تحميل المسارات...',
    'Loading route details...': 'جاري تحميل تفاصيل المسار...',
    'Unable to load routes at the moment. Please try again.':
      'تعذر تحميل المسارات حالياً. يرجى المحاولة مرة أخرى.',
    'Retry': 'إعادة المحاولة',
    'Click View Route Details to load stop schedules.':
      'اضغط على عرض تفاصيل المسار لعرض المحطات والمواعيد.',
    'No stop schedules available for this route yet.':
      'لا توجد جداول محطات متاحة لهذا المسار حالياً.',
    'No active routes are currently available.':
      'لا توجد مسارات نشطة متاحة حالياً.',

    // Bus and driver
    'Assigned Bus and Driver': 'الحافلة والسائق المعيّنان',
    'Assigned Bus': 'الحافلة المعيّنة',
    'Assigned Driver': 'السائق المعيّن',
    'Not assigned yet': 'لم يتم التعيين بعد',

    // Capacity
    'Route Capacity': 'سعة المسار',
    'Total Capacity': 'السعة الإجمالية',
    'students': 'طلاب',
    'Registered Students': 'الطلاب المسجلون',
    'Remaining Seats': 'المقاعد المتبقية',

    // Subscription
    'Request Transportation': 'طلب خدمة النقل',
    'Route Currently Inactive': 'المسار غير نشط حالياً',
    'No Seats Available': 'لا توجد مقاعد متاحة',
    'Request Subscription': 'طلب اشتراك',

    // Empty state
    'No Routes Found': 'لم يتم العثور على مسارات',
    'Try a different route name or service area.':
      'جرّب اسم مسار أو منطقة خدمة مختلفة.',
    'Show All Routes': 'عرض جميع المسارات',

    // CTA
    'Need School Transportation?': 'هل تحتاج إلى النقل المدرسي؟',
    'Explore our transportation services and request a subscription.':
      'استكشف خدمات النقل لدينا وقدّم طلب اشتراك.',

    // Footer
    'Basi School Transportation': 'باصي للنقل المدرسي',
    'Safe and reliable school transportation.':
      'خدمات نقل مدرسي آمنة وموثوقة.',
    '© 2026 Basi School Transportation. All rights reserved.':
      '© 2026 باصي للنقل المدرسي. جميع الحقوق محفوظة.',
  };

  protected translate(value: string): string {
    return this.isArabic()
      ? (this.arabicText[value] ?? value)
      : value;
  }

  protected readonly routes = signal<readonly SchoolRoute[]>([]);

  public ngOnInit(): void {
    this.loadRoutes();
  }

  protected loadRoutes(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.routeService
      .getRoutes()
      .pipe(
        catchError(() => {
          this.errorMessage.set('Unable to load routes at the moment. Please try again.');
          return of<RouteItem[] | null>(null);
        })
      )
      .subscribe((items) => {
        if (items !== null) {
          const mapped = items
            .map((item) => this.mapRoute(item))
            .filter((route) => this.isVisibleToParent(route));
          this.routes.set(mapped);
        } else {
          this.routes.set([]);
        }
        this.isLoading.set(false);
      });
  }

  protected readonly serviceAreas = computed(() =>
    [...new Set(this.routes().map((route) => route.serviceArea).filter((area) => Boolean(area) && area !== '—'))].sort()
  );

  protected readonly filteredRoutes = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const area = this.selectedArea();

    return this.routes().filter((route) => {
      const matchesSearch =
        !search ||
        route.routeName.toLowerCase().includes(search) ||
        route.routeNumber.toLowerCase().includes(search) ||
        route.serviceArea.toLowerCase().includes(search);

      const matchesArea =
        area === 'All' || route.serviceArea === area;

      return matchesSearch && matchesArea;
    });
  });

  protected remainingSeats(route: SchoolRoute): number {
    return Math.max(0, route.capacity - route.enrolledStudents);
  }

  protected canRequestTransportation(route: SchoolRoute): boolean {
    return route.isActive && this.remainingSeats(route) > 0;
  }

  protected updateSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
  }

  protected updateArea(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedArea.set(select.value);
  }

  protected resetFilters(): void {
    this.searchTerm.set('');
    this.selectedArea.set('All');
  }

  protected toggleDetails(routeId: number): void {
    const opening = this.selectedRouteId() !== routeId;
    this.selectedRouteId.update((currentId) =>
      currentId === routeId ? null : routeId
    );

    if (opening) {
      this.loadingDetailsId.set(routeId);
      forkJoin({
        details: this.routeService.getRouteDetails(routeId).pipe(catchError(() => of(null))),
        stops: this.routeService.getStopsByRoute(routeId).pipe(catchError(() => of(null))),
      }).subscribe(({ details, stops }) => {
        this.routes.update((list) =>
          list.map((route) =>
            route.id === routeId ? this.mergeRouteDetails(route, details, stops) : route
          )
        );
        this.loadingDetailsId.set(null);
      });
    }
  }

  private isVisibleToParent(route: SchoolRoute): boolean {
    if (!route.isActive) return false;
    const num = route.routeNumber.toUpperCase();
    const name = route.routeName.toUpperCase();
    return !num.startsWith('TEST') && !name.startsWith('TEST');
  }

  private mergeRouteDetails(
    existing: SchoolRoute,
    details: RouteItem | null,
    stopsResponse: readonly ServiceRouteStop[] | null
  ): SchoolRoute {
    const mappedDetails = details ? this.mapRoute(details) : existing;
    const rawStops =
      stopsResponse && stopsResponse.length > 0
        ? stopsResponse
        : details?.stops && details.stops.length > 0
          ? details.stops
          : null;

    const mappedStops = rawStops
      ? [...rawStops]
          .sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0))
          .map((s) => this.mapStop(s))
      : existing.stops;

    const times = this.resolveTimes(mappedStops, mappedDetails.pickupTime, mappedDetails.dropoffTime);

    return {
      ...existing,
      ...mappedDetails,
      stops: mappedStops,
      pickupTime: times.pickupTime,
      dropoffTime: times.dropoffTime,
      assignedBus: mappedDetails.assignedBus ?? existing.assignedBus,
      assignedDriver: mappedDetails.assignedDriver ?? existing.assignedDriver,
    };
  }

  private mapRoute(raw: RouteItem): SchoolRoute {
    const item = raw as unknown as Record<string, unknown>;
    const id = Number(item['routeId'] ?? item['RouteId'] ?? item['id'] ?? item['Id'] ?? 0);
    const routeNumber = this.pickStr(item, ['routeNumber', 'RouteNumber']) || (id ? `R${id}` : '—');
    const routeName = this.pickStr(item, ['name', 'Name', 'routeName', 'RouteName']) || routeNumber;
    const serviceArea = this.pickStr(item, ['serviceArea', 'ServiceArea']) || '—';
    const startingPoint = this.pickStr(item, ['startPoint', 'StartPoint', 'startingPoint']) || '—';
    const destination = this.pickStr(item, ['destination', 'Destination']) || '—';

    let isActive = true;
    if (typeof item['isActive'] === 'boolean') {
      isActive = item['isActive'];
    } else if (typeof item['status'] === 'string') {
      isActive = (item['status'] as string).toLowerCase() === 'active';
    } else if (item['isActive'] !== undefined) {
      isActive = Boolean(item['isActive']);
    }

    const capacity = Number(item['capacity'] ?? item['Capacity'] ?? 0) || 0;
    const enrolledStudents =
      Number(
        item['enrolledStudents'] ??
          item['EnrolledStudents'] ??
          item['studentCount'] ??
          item['studentsCount'] ??
          0
      ) || 0;

    const busObj = this.asRecord(item['bus'] ?? item['Bus']);
    const assignedBusRaw =
      this.pickStr(item, ['assignedBus', 'AssignedBus', 'busPlate', 'BusPlate', 'plateNumber', 'PlateNumber']) ||
      (busObj ? this.pickStr(busObj, ['plateNumber', 'PlateNumber', 'busPlate']) : '');
    const assignedBus = assignedBusRaw && assignedBusRaw !== '—' ? assignedBusRaw : null;

    const driverObj = this.asRecord(item['driver'] ?? item['Driver']);
    let assignedDriverRaw = this.pickStr(item, ['assignedDriver', 'AssignedDriver', 'driverName', 'DriverName']);
    if (!assignedDriverRaw && typeof item['driver'] === 'string') {
      assignedDriverRaw = (item['driver'] as string).trim();
    }
    if (!assignedDriverRaw && driverObj) {
      assignedDriverRaw = this.pickStr(driverObj, ['fullName', 'FullName', 'name', 'Name']);
    }
    const assignedDriver = assignedDriverRaw && assignedDriverRaw !== '—' ? assignedDriverRaw : null;

    const rawStops = Array.isArray(raw.stops)
      ? [...raw.stops].sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0))
      : [];
    const stops = rawStops.map((s) => this.mapStop(s));

    const routePickup = this.pickStr(item, ['pickupTime', 'PickupTime', 'morningPickupTime']);
    const routeDropoff = this.pickStr(item, ['dropoffTime', 'DropoffTime', 'afternoonDropoffTime']);
    const { pickupTime, dropoffTime } = this.resolveTimes(stops, routePickup, routeDropoff);

    return {
      id,
      routeNumber,
      routeName,
      serviceArea,
      startingPoint,
      destination,
      pickupTime,
      dropoffTime,
      stops,
      assignedBus,
      assignedDriver,
      capacity,
      enrolledStudents,
      isActive,
    };
  }

  private mapStop(stop: ServiceRouteStop): RouteStop {
    const raw = stop as unknown as Record<string, unknown>;
    const name = this.pickStr(raw, ['name', 'Name', 'stopName', 'StopName']) || '—';
    const pickup = this.formatTime(this.pickStr(raw, ['pickupTime', 'PickupTime']));
    const dropoff = this.formatTime(this.pickStr(raw, ['dropoffTime', 'DropoffTime']));
    return {
      name,
      pickupTime: pickup,
      dropoffTime: dropoff,
    };
  }

  private resolveTimes(
    stops: readonly RouteStop[],
    explicitPickup?: string,
    explicitDropoff?: string
  ): { pickupTime: string; dropoffTime: string } {
    const validPickups = stops.map((s) => s.pickupTime).filter((t) => Boolean(t) && t !== '—');
    const validDropoffs = stops.map((s) => s.dropoffTime).filter((t) => Boolean(t) && t !== '—');

    const pickupTime =
      (explicitPickup && explicitPickup !== '—' ? this.formatTime(explicitPickup) : '') ||
      (validPickups.length > 0 ? validPickups[0] : '—');
    const dropoffTime =
      (explicitDropoff && explicitDropoff !== '—' ? this.formatTime(explicitDropoff) : '') ||
      (validDropoffs.length > 0 ? validDropoffs[0] : '—');

    return { pickupTime, dropoffTime };
  }

  private formatTime(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '—';

    const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
    if (!match) return trimmed;

    const hour24 = Number(match[1]);
    const minute = match[2];
    if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) return trimmed;

    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${minute} ${suffix}`;
  }

  private pickStr(obj: Record<string, unknown>, keys: readonly string[]): string {
    for (const key of keys) {
      const val = obj[key];
      if (typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
    return '';
  }

  private asRecord(val: unknown): Record<string, unknown> | null {
    return val !== null && typeof val === 'object' && !Array.isArray(val)
      ? (val as Record<string, unknown>)
      : null;
  }

  protected toggleMenu(): void {
    this.isMenuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }
}