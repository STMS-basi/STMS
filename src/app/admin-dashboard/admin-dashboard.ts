
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Header } from '../header/header';
import { PreferencesService } from '../services/preferences.service';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [Header, RouterLink,DecimalPipe],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard {
  readonly prefs = inject(PreferencesService);

  stats = [
    {
      title: 'Total Students',
      value: 128,
      icon: '👨‍🎓',
      color: 'blue',
    },
    {
      title: 'Active Subscriptions',
      value: 96,
      icon: '📋',
      color: 'green',
    },
    {
      title: 'Available Buses',
      value: 8,
      icon: '🚌',
      color: 'orange',
    },
    {
      title: 'Pending Requests',
      value: 12,
      icon: '⏳',
      color: 'purple',
    },
  ];

  recentRequests = [
    {
      id: 'REQ-1025',
      student: 'Yusuf Al-Basi',
      parent: 'Ahmad Al-Basi',
      route: 'R101 - North Amman',
      date: '2026-11-18',
      status: 'Pending',
    },
    {
      id: 'REQ-1024',
      student: 'Lana Al-Basi',
      parent: 'Ahmad Al-Basi',
      route: 'R103 - West Amman',
      date: '2026-11-17',
      status: 'Approved',
    },
    {
      id: 'REQ-1023',
      student: 'Omar Khalil',
      parent: 'Sara Khalil',
      route: 'R105 - South Amman',
      date: '2026-11-17',
      status: 'Pending',
    },
    {
      id: 'REQ-1022',
      student: 'Maya Ahmad',
      parent: 'Khaled Ahmad',
      route: 'R102 - East Amman',
      date: '2026-11-16',
      status: 'Rejected',
    },
  ];

  capacity = {
    total: 240,
    occupied: 186,
    available: 54,
  };

  subscriptionStatuses = [
    { name: 'Active', count: 96 },
    { name: 'Pending', count: 12 },
    { name: 'Expired', count: 8 },
    { name: 'Cancelled', count: 4 },
  ];

  managementLinks = [
    {
      title: 'Student Management',
      description: 'View and manage student records',
      icon: '👨‍🎓',
      route: '/students',
      available: true,
    },
    {
      title: 'Route Management',
      description: 'View available transportation routes',
      icon: '🗺️',
      route: '/routes',
      available: true,
    },
    {
      title: 'Stop Management',
      description: 'Manage pickup and drop-off stops',
      icon: '📍',
      route: '',
      available: false,
    },
    {
      title: 'Bus Management',
      description: 'Manage buses and seating capacity',
      icon: '🚌',
      route: '',
      available: false,
    },
    {
      title: 'Driver Management',
      description: 'Manage driver information',
      icon: '👨‍✈️',
      route: '',
      available: false,
    },
    {
      title: 'Subscription Management',
      description: 'Review transportation subscriptions',
      icon: '📋',
      route: '/subscription',
      available: true,
    },
  ];

  translations: Record<string, string> = {
    'Admin Dashboard': 'لوحة تحكم المسؤول',
    'Welcome back, Administrator': 'مرحباً بعودتك، أيها المسؤول',
    'Here is an overview of your school transportation system.':
      'إليك نظرة عامة على نظام النقل المدرسي.',

    'Total Students': 'إجمالي الطلاب',
    'Active Subscriptions': 'الاشتراكات النشطة',
    'Available Buses': 'الحافلات المتاحة',
    'Pending Requests': 'الطلبات المعلقة',

    'Management': 'الإدارة',
    'Quick access to transportation system management.':
      'وصول سريع إلى أقسام إدارة نظام النقل.',

    'Student Management': 'إدارة الطلاب',
    'View and manage student records': 'عرض سجلات الطلاب وإدارتها',

    'Route Management': 'إدارة المسارات',
    'View available transportation routes': 'عرض مسارات النقل المتاحة',

    'Stop Management': 'إدارة المواقف',
    'Manage pickup and drop-off stops': 'إدارة مواقف الصعود والنزول',

    'Bus Management': 'إدارة الحافلات',
    'Manage buses and seating capacity': 'إدارة الحافلات وسعتها',

    'Driver Management': 'إدارة السائقين',
    'Manage driver information': 'إدارة معلومات السائقين',

    'Subscription Management': 'إدارة الاشتراكات',
    'Review transportation subscriptions': 'مراجعة اشتراكات النقل',

    'Coming Soon': 'قريباً',

    'Recent Subscription Requests': 'أحدث طلبات الاشتراك',
    'View all recent requests submitted by parents.':
      'عرض أحدث طلبات الاشتراك المقدمة من أولياء الأمور.',

    'Request ID': 'رقم الطلب',
    'Student': 'الطالب',
    'Parent / Guardian': 'ولي الأمر',
    'Route': 'المسار',
    'Date': 'التاريخ',
    'Status': 'الحالة',

    'Pending': 'قيد الانتظار',
    'Approved': 'تمت الموافقة',
    'Rejected': 'مرفوض',

    'Transportation Overview': 'نظرة عامة على النقل',
    'Bus Capacity': 'سعة الحافلات',
    'Occupied Seats': 'المقاعد المشغولة',
    'Available Seats': 'المقاعد المتاحة',
    'Subscription Status': 'حالة الاشتراكات',

    'Active': 'نشط',
    'Expired': 'منتهي',
    'Cancelled': 'ملغي',

    'of total capacity': 'من السعة الإجمالية',
    'subscriptions': 'اشتراكات',
    'View Page': 'عرض الصفحة',

    'and': 'و',
    'Total Capacity': 'السعة الإجمالية',

    'R101 - North Amman': 'R101 - شمال عمّان',
    'R102 - East Amman': 'R102 - شرق عمّان',
    'R103 - West Amman': 'R103 - غرب عمّان',
    'R105 - South Amman': 'R105 - جنوب عمّان',

    '© 2026 Basi School Transportation. All rights reserved.':
      '© 2026 مكتب الباصي للنقل المدرسي. جميع الحقوق محفوظة.',
  };

  translate(value: string): string {
    if (this.prefs.lang() === 'ar') {
      return this.translations[value] || value;
    }

    return value;
  }

  get capacityPercentage(): number {
    return (this.capacity.occupied / this.capacity.total) * 100;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Approved':
        return 'approved';

      case 'Pending':
        return 'pending';

      case 'Rejected':
        return 'rejected';

      default:
        return '';
    }
  }

  getStatusLabel(status: string): string {
    return this.translate(status);
  }
}
