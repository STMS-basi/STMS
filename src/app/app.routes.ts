
import { Routes } from '@angular/router';

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
    loadComponent: () =>
      import(
        './transportation-subscription/transportation-subscription'
      ).then((m) => m.TransportationSubscription),
  },
  {
    path: 'subscription-confirmation/:reference',
    loadComponent: () =>
      import('./subscription-confirmation/subscription-confirmation').then(
        (m) => m.SubscriptionConfirmation
      ),
  },
  {
    path: 'subscription-confirmation',
    loadComponent: () =>
      import('./subscription-confirmation/subscription-confirmation').then(
        (m) => m.SubscriptionConfirmation
      ),
  },
];
