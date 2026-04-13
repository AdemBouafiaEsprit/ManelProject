import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'containers',
        loadComponent: () =>
          import('./pages/containers/containers.component').then((m) => m.ContainersComponent),
      },
      {
        path: 'containers/:id',
        loadComponent: () =>
          import('./pages/container-detail/container-detail.component').then(
            (m) => m.ContainerDetailComponent
          ),
      },
      {
        path: 'alerts',
        loadComponent: () =>
          import('./pages/alerts/alerts.component').then((m) => m.AlertsComponent),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./pages/analytics/analytics.component').then((m) => m.AnalyticsComponent),
      },
      {
        path: 'admin',
        loadComponent: () =>
          import('./pages/admin/admin.component').then((m) => m.AdminComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
