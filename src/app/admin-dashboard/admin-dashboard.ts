import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Header } from '../header/header';
import { PreferencesService } from '../services/preferences.service';
import {
  AdminBusItem,
  AdminDriverItem,
  AdminPaymentItem,
  AdminRouteItem,
  AdminService,
  AdminStopItem,
  AdminSubscriptionItem,
} from '../services/admin.service';

export type AdminTab =
  | 'overview'
  | 'students'
  | 'parents'
  | 'routes'
  | 'stops'
  | 'buses'
  | 'drivers'
  | 'subscriptions'
  | 'payments';

@Component({
  selector: 'app-admin-dashboard',
  imports: [Header, DecimalPipe, ReactiveFormsModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard implements OnInit {
  protected readonly prefs = inject(PreferencesService);
  protected readonly adminService = inject(AdminService);
  private readonly fb = inject(NonNullableFormBuilder);

  public ngOnInit(): void {
    this.refreshAll();
  }

  public refreshAll(): void {
    this.adminService.fetchStudents().subscribe();
    this.adminService.fetchParents().subscribe();
    this.adminService.fetchRoutes().subscribe();
    this.adminService.fetchStops().subscribe();
    this.adminService.fetchBuses().subscribe();
    this.adminService.fetchDrivers().subscribe();
    this.adminService.fetchSubscriptions().subscribe();
    this.adminService.fetchPayments().subscribe();
  }

  public readonly activeTab = signal<AdminTab>('overview');

  public readonly studentSearch = signal('');
  public readonly parentSearch = signal('');
  public readonly subscriptionFilter = signal<'All' | 'Pending' | 'AwaitingPayment' | 'Approved' | 'Rejected'>('All');
  public readonly paymentFilter = signal<'All' | 'Paid' | 'Partial' | 'Unpaid'>('All');

  public readonly showAddRoute = signal(false);
  public readonly showAddStop = signal(false);
  public readonly showAddBus = signal(false);
  public readonly showAddDriver = signal(false);

  public readonly routeForm = this.fb.group({
    routeNumber: ['', [Validators.required]],
    name: ['', [Validators.required]],
    serviceArea: ['', [Validators.required]],
    capacity: [30, [Validators.required, Validators.min(10)]],
    startPoint: ['', [Validators.required]],
    destination: ['Basi School', [Validators.required]],
    busPlate: ['', [Validators.required]],
    driverName: ['', [Validators.required]],
  });

  public readonly stopForm = this.fb.group({
    routeId: [1, [Validators.required]],
    name: ['', [Validators.required]],
    stopOrder: [1, [Validators.required, Validators.min(1)]],
    pickupTime: ['7:00 AM', [Validators.required]],
    dropoffTime: ['2:30 PM', [Validators.required]],
  });

  public readonly busForm = this.fb.group({
    plateNumber: ['', [Validators.required]],
    capacity: [30, [Validators.required, Validators.min(10)]],
    assignedRoute: ['', [Validators.required]],
  });

  public readonly driverForm = this.fb.group({
    fullName: ['', [Validators.required]],
    phone: ['', [Validators.required]],
    licenseNumber: ['', [Validators.required]],
    assignedBus: ['', [Validators.required]],
  });

  public readonly filteredStudents = computed(() => {
    const q = this.studentSearch().trim().toLowerCase();
    const list = this.adminService.students();
    if (!q) {
      return list;
    }
    return list.filter(
      s =>
        s.fullName.toLowerCase().includes(q) ||
        s.parentName.toLowerCase().includes(q) ||
        s.grade.toLowerCase().includes(q) ||
        s.routeNumber.toLowerCase().includes(q)
    );
  });

  public readonly filteredParents = computed(() => {
    const q = this.parentSearch().trim().toLowerCase();
    const list = this.adminService.parents();
    if (!q) {
      return list;
    }
    return list.filter(
      p =>
        p.fullName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.address.toLowerCase().includes(q)
    );
  });

  public readonly filteredSubscriptions = computed(() => {
    const filter = this.subscriptionFilter();
    const list = this.adminService.subscriptions();
    if (filter === 'All') {
      return list;
    }
    return list.filter(s => s.status === filter);
  });

  public readonly filteredPayments = computed(() => {
    const filter = this.paymentFilter();
    const list = this.adminService.payments();
    if (filter === 'All') {
      return list;
    }
    return list.filter(p => p.status === filter);
  });

  public readonly capacityPercentage = computed(() => {
    const total = this.adminService.totalCapacity();
    if (total === 0) {
      return 0;
    }
    return (this.adminService.occupiedCapacity() / total) * 100;
  });

  public readonly recentRequests = computed(() => {
    return this.adminService.subscriptions().slice(0, 5);
  });

  public readonly tabs: readonly { id: AdminTab; labelEn: string; labelAr: string }[] = [
    { id: 'overview', labelEn: 'Overview', labelAr: 'نظرة عامة' },
    { id: 'students', labelEn: 'Students', labelAr: 'الطلاب' },
    { id: 'parents', labelEn: 'Parents', labelAr: 'أولياء الأمور' },
    { id: 'routes', labelEn: 'Routes', labelAr: 'المسارات' },
    { id: 'stops', labelEn: 'Stops', labelAr: 'المواقف' },
    { id: 'buses', labelEn: 'Buses', labelAr: 'الحافلات' },
    { id: 'drivers', labelEn: 'Drivers', labelAr: 'السائقين' },
    { id: 'subscriptions', labelEn: 'Subscriptions', labelAr: 'الاشتراكات' },
    { id: 'payments', labelEn: 'Payments', labelAr: 'المدفوعات' },
  ];

  public readonly managementCards: readonly {
    tab: AdminTab;
    titleEn: string;
    titleAr: string;
    descEn: string;
    descAr: string;
  }[] = [
    {
      tab: 'students',
      titleEn: 'Student Management',
      titleAr: 'إدارة الطلاب',
      descEn: 'View and manage student transportation records',
      descAr: 'عرض سجلات النقل للطلاب وإدارتها',
    },
    {
      tab: 'parents',
      titleEn: 'Parent Management',
      titleAr: 'إدارة أولياء الأمور',
      descEn: 'View registered parent and guardian records',
      descAr: 'عرض سجلات أولياء الأمور المسجلين',
    },
    {
      tab: 'routes',
      titleEn: 'Route Management',
      titleAr: 'إدارة المسارات',
      descEn: 'Add, edit, activate and deactivate routes',
      descAr: 'إضافة وتعديل وتفعيل وتعطيل المسارات',
    },
    {
      tab: 'stops',
      titleEn: 'Stop Management',
      titleAr: 'إدارة المواقف',
      descEn: 'Manage pickup and drop off stops',
      descAr: 'إدارة مواقف الصعود والنزول',
    },
    {
      tab: 'buses',
      titleEn: 'Bus Management',
      titleAr: 'إدارة الحافلات',
      descEn: 'Add and update buses and seating capacity',
      descAr: 'إضافة وتحديث الحافلات وسعة المقاعد',
    },
    {
      tab: 'drivers',
      titleEn: 'Driver Management',
      titleAr: 'إدارة السائقين',
      descEn: 'Manage driver information and assignments',
      descAr: 'إدارة بيانات السائقين وتعيين المسارات',
    },
    {
      tab: 'subscriptions',
      titleEn: 'Subscription Management',
      titleAr: 'إدارة الاشتراكات',
      descEn: 'Review, approve, reject and update subscriptions',
      descAr: 'مراجعة وقبول ورفض وتحديث الاشتراكات',
    },
    {
      tab: 'payments',
      titleEn: 'Payment Management',
      titleAr: 'إدارة المدفوعات',
      descEn: 'Record and update payment statuses',
      descAr: 'تسجيل وتحديث حالات الدفع',
    },
  ];

  private readonly translations: Record<string, string> = {
    'Admin Dashboard': 'لوحة تحكم المسؤول',
    'Welcome back, Administrator': 'مرحبا بعودتك، المشرف العام',
    'Here is an overview of your school transportation system.':
      'إليك نظرة شاملة على نظام النقل المدرسي.',
    'Total Students': 'إجمالي الطلاب',
    'Active Subscriptions': 'الاشتراكات النشطة',
    'Available Buses': 'الحافلات المتاحة',
    'Pending Requests': 'الطلبات المعلقة',
    'Management Sections': 'أقسام الإدارة',
    'Quick access to school transportation system management.':
      'وصول سريع لإدارة نظام النقل المدرسي.',
    'Manage Section': 'إدارة القسم',
    'Recent Subscription Requests': 'أحدث طلبات الاشتراك',
    'Review recent transportation requests submitted by parents.':
      'مراجعة أحدث طلبات النقل المقدمة من أولياء الأمور.',
    'Reference': 'المرجع',
    'Student': 'الطالب',
    'Parent / Guardian': 'ولي الأمر',
    'Route': 'المسار',
    'Date': 'التاريخ',
    'Status': 'الحالة',
    'Actions': 'الإجراءات',
    'Transportation Overview': 'نظرة عامة على النقل',
    'Bus Capacity': 'سعة الحافلات',
    'Occupied Seats': 'المقاعد المشغولة',
    'Available Seats': 'المقاعد المتاحة',
    'Total Capacity': 'السعة الإجمالية',
    'Subscription Status': 'حالة الاشتراكات',
    'Active': 'نشط',
    'Pending': 'قيد الانتظار',
    'AwaitingPayment': 'بانتظار سداد الرسوم',
    'Approved': 'تمت الموافقة',
    'Rejected': 'مرفوض',
    'Cancelled': 'ملغي',
    'Paid': 'مدفوع',
    'Partial': 'جزئي',
    'Unpaid': 'غير مدفوع',
    'Approve': 'موافقة',
    'Reject': 'رفض',
    'Activate': 'تفعيل',
    'Deactivate': 'تعطيل',
    'Mark as Paid': 'تحديد كمدفوع',
    'Add Route': 'إضافة مسار',
    'Add Stop': 'إضافة موقف',
    'Add Bus': 'إضافة حافلة',
    'Add Driver': 'إضافة سائق',
    'Search by name, grade or route': 'بحث بالاسم أو الصف أو المسار',
    'Search by name, email or phone': 'بحث بالاسم أو البريد أو الهاتف',
    'Filter by Status': 'تصفية حسب الحالة',
    'All': 'الكل',
    'Grade': 'الصف',
    'Class': 'الشعبة',
    'Stop': 'الموقف',
    'Transport Type': 'نوع النقل',
    'Phone': 'الهاتف',
    'Address': 'العنوان',
    'Students': 'الطلاب',
    'Route Number': 'رقم المسار',
    'Route Name': 'اسم المسار',
    'Area': 'المنطقة',
    'Capacity': 'السعة',
    'Enrolled': 'المسجلون',
    'Bus Plate': 'لوحة الحافلة',
    'Driver': 'السائق',
    'Pickup Time': 'وقت الصعود',
    'Dropoff Time': 'وقت النزول',
    'Order': 'الترتيب',
    'Delete': 'حذف',
    'Plate Number': 'رقم اللوحة',
    'Assigned Route': 'المسار المعين',
    'License Number': 'رقم الرخصة',
    'Assigned Bus': 'الحافلة المعينة',
    'Fee': 'الرسوم',
    'Amount Due': 'المبلغ المستحق',
    'Amount Paid': 'المبلغ المدفوع',
    'Payment Date': 'تاريخ الدفع',
    'Recorded By': 'سجل بواسطة',
    'Cancel': 'إلغاء',
    'Save': 'حفظ',
    'Start Point': 'نقطة الانطلاق',
    'Destination': 'الوجهة',
    'RoundTrip': 'ذهاب وإياب',
    'OneWay': 'اتجاه واحد',
    'Select Route': 'اختر المسار',
    'Awaiting Approval': 'بانتظار الموافقة المبدئية',
    'Pending Approval': 'قيد الموافقة',
    'Requires preliminary approval before payment': 'يتطلب موافقة مبدئية قبل تسجيل الدفع',
    '© 2026 Basi School Transportation. All rights reserved.':
      '© 2026 مكتب الباصي للنقل المدرسي. جميع الحقوق محفوظة.',
  };

  public translate(value: string): string {
    if (this.prefs.lang() === 'ar') {
      return this.translations[value] || value;
    }
    return value;
  }

  public setTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    if (tab === 'overview') {
      this.refreshAll();
    } else if (tab === 'students') {
      this.adminService.fetchStudents().subscribe();
    } else if (tab === 'parents') {
      this.adminService.fetchParents().subscribe();
    } else if (tab === 'routes') {
      this.adminService.fetchRoutes().subscribe();
    } else if (tab === 'stops') {
      this.adminService.fetchStops().subscribe();
    } else if (tab === 'buses') {
      this.adminService.fetchBuses().subscribe();
    } else if (tab === 'drivers') {
      this.adminService.fetchDrivers().subscribe();
    } else if (tab === 'subscriptions') {
      this.adminService.fetchSubscriptions().subscribe();
    } else if (tab === 'payments') {
      this.adminService.fetchPayments().subscribe();
      this.adminService.fetchSubscriptions().subscribe();
    }
  }

  public approveSubscription(id: number): void {
    this.adminService.approveSubscription(id).subscribe();
  }

  public rejectSubscription(id: number): void {
    this.adminService.rejectSubscription(id).subscribe();
  }

  public toggleRoute(id: number): void {
    this.adminService.toggleRouteActive(id).subscribe();
  }

  public toggleBus(id: number): void {
    this.adminService.toggleBusActive(id).subscribe();
  }

  public toggleDriver(id: number): void {
    this.adminService.toggleDriverActive(id).subscribe();
  }

  public isSubscriptionPending(pm: AdminPaymentItem): boolean {
    const sub = this.resolveSubscription(pm);
    return sub?.status === 'Pending';
  }

  public isPaymentEligible(pm: AdminPaymentItem): boolean {
    if (pm.status === 'Paid') {
      return false;
    }
    const sub = this.resolveSubscription(pm);
    if (!sub) {
      return true;
    }
    return sub.status === 'AwaitingPayment';
  }

  private resolveSubscription(pm: AdminPaymentItem): AdminSubscriptionItem | undefined {
    if (pm.subscriptionId) {
      const byId = this.adminService.subscriptions().find((s) => s.subscriptionId === pm.subscriptionId);
      if (byId) return byId;
    }
    return this.adminService.subscriptions().find((s) => s.referenceNumber === pm.referenceNumber);
  }

  public markPaymentPaid(id: number): void {
    const payment = this.adminService.payments().find((p) => p.paymentId === id);
    if (!payment) return;

    let subId = payment.subscriptionId;
    if (!subId) {
      const matched = this.adminService.subscriptions().find((s) => s.referenceNumber === payment.referenceNumber);
      if (matched) subId = matched.subscriptionId;
    }

    const fullAmount = payment.amountDue || 300;
    this.adminService.updatePaymentStatus(id, 'Paid', fullAmount);

    if (subId) {
      this.adminService
        .recordPayment({
          subscriptionId: subId,
          amount: fullAmount,
          notes: 'Full payment confirmed by admin',
        })
        .subscribe(() => {
          this.adminService.fetchPayments().subscribe();
          this.adminService.fetchSubscriptions().subscribe();
        });
    }
  }

  public confirmSubscriptionPayment(sub: AdminSubscriptionItem): void {
    this.adminService.recordPayment({
      subscriptionId: sub.subscriptionId,
      amount: sub.fee,
      notes: 'Full payment confirmed by admin',
    }).subscribe(() => {
      this.adminService.fetchPayments().subscribe();
      this.adminService.fetchSubscriptions().subscribe();
    });
  }

  public deleteStop(id: number): void {
    this.adminService.deleteStop(id).subscribe();
  }

  public submitNewRoute(): void {
    if (this.routeForm.invalid) {
      this.routeForm.markAllAsTouched();
      return;
    }
    const val = this.routeForm.getRawValue();
    this.adminService.addRoute({
      routeNumber: val.routeNumber.trim(),
      name: val.name.trim(),
      serviceArea: val.serviceArea.trim(),
      capacity: Number(val.capacity),
      startPoint: val.startPoint.trim(),
      destination: val.destination.trim(),
      busPlate: val.busPlate.trim(),
      driverName: val.driverName.trim(),
      enrolledStudents: 0,
      isActive: true,
    }).subscribe();
    this.routeForm.reset({
      routeNumber: '',
      name: '',
      serviceArea: '',
      capacity: 30,
      startPoint: '',
      destination: 'Basi School',
      busPlate: '',
      driverName: '',
    });
    this.showAddRoute.set(false);
  }

  public submitNewStop(): void {
    if (this.stopForm.invalid) {
      this.stopForm.markAllAsTouched();
      return;
    }
    const val = this.stopForm.getRawValue();
    const route = this.adminService.routes().find(r => r.routeId === Number(val.routeId));
    this.adminService.addStop({
      routeId: Number(val.routeId),
      routeNumber: route?.routeNumber || 'R1',
      name: val.name.trim(),
      stopOrder: Number(val.stopOrder),
      pickupTime: val.pickupTime.trim(),
      dropoffTime: val.dropoffTime.trim(),
    }).subscribe();
    this.stopForm.reset({
      routeId: 1,
      name: '',
      stopOrder: 1,
      pickupTime: '7:00 AM',
      dropoffTime: '2:30 PM',
    });
    this.showAddStop.set(false);
  }

  public submitNewBus(): void {
    if (this.busForm.invalid) {
      this.busForm.markAllAsTouched();
      return;
    }
    const val = this.busForm.getRawValue();
    this.adminService.addBus({
      plateNumber: val.plateNumber.trim(),
      capacity: Number(val.capacity),
      assignedRoute: val.assignedRoute.trim(),
      isActive: true,
    }).subscribe();
    this.busForm.reset({
      plateNumber: '',
      capacity: 30,
      assignedRoute: '',
    });
    this.showAddBus.set(false);
  }

  public submitNewDriver(): void {
    if (this.driverForm.invalid) {
      this.driverForm.markAllAsTouched();
      return;
    }
    const val = this.driverForm.getRawValue();
    this.adminService.addDriver({
      fullName: val.fullName.trim(),
      phone: val.phone.trim(),
      licenseNumber: val.licenseNumber.trim(),
      assignedBus: val.assignedBus.trim(),
      isActive: true,
    }).subscribe();
    this.driverForm.reset({
      fullName: '',
      phone: '',
      licenseNumber: '',
      assignedBus: '',
    });
    this.showAddDriver.set(false);
  }

  public getStatusClass(status: string): string {
    switch (status) {
      case 'Approved':
      case 'Paid':
      case 'Active':
        return 'status-approved';
      case 'Pending':
      case 'Partial':
      case 'AwaitingPayment':
        return 'status-pending';
      case 'Rejected':
      case 'Cancelled':
      case 'Inactive':
      case 'Unpaid':
        return 'status-rejected';
      default:
        return '';
    }
  }
}
