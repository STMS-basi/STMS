import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.Home),
  },
  {
    path: 'transport',
    loadComponent: () => import('./transport/transport').then((m) => m.Transport),
  },
  {
    path: 'routes',
    loadComponent: () => import('./routes/routes').then((m) => m.Routes),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./parent-registration/parent-registration').then(
        (m) => m.ParentRegistration
      ),
  },
  {
    path: 'parent-registration',
    redirectTo: 'register',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
  {
    path: 'students',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./students/student-registration/student-registration').then(
        (m) => m.StudentRegistration
      ),
  },
  {
    path: 'student-registration',
    redirectTo: 'students',
    pathMatch: 'full',
  },
  {
    path: 'subscription',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./transportation-subscription/transportation-subscription').then(
        (m) => m.TransportationSubscription
      ),
  },
  {
    path: 'subscription-confirmation/:reference',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./subscription-confirmation/subscription-confirmation').then(
        (m) => m.SubscriptionConfirmation
      ),
  },
  {
    path: 'subscription-confirmation',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./subscription-confirmation/subscription-confirmation').then(
        (m) => m.SubscriptionConfirmation
      ),
  },
  {
    path: 'my-transportation',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./my-transportation/my-transportation').then((m) => m.MyTransportation),
  },
  {
    path: 'payment-status',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./payment-status/payment-status').then((m) => m.PaymentStatus),
  },

  // Admin Dashboard protected by adminGuard
  {
    path: 'admin-dashboard',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./admin-dashboard/admin-dashboard').then(
        (m) => m.AdminDashboard
      ),
  },
];
