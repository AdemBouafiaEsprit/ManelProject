import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { WebSocketService } from '../core/websocket/websocket.service';
import { AlertService } from '../core/api/alert.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="shell">
      <!-- Sidebar -->
      <aside class="sidebar" [class.collapsed]="collapsed()">
        <div class="sidebar-header">
          <div class="logo-mark">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#003B72"/>
              <path d="M6 22V14l10-8 10 8v8H20v-6h-4v6H6z" fill="#00A651"/>
              <rect x="12" y="16" width="8" height="2" rx="1" fill="white" opacity="0.6"/>
            </svg>
          </div>
          <span class="logo-text" *ngIf="!collapsed()">STAM Reefer</span>
          <button class="collapse-btn" (click)="toggleSidebar()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <nav class="nav-links">
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
            <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
            </svg>
            <span class="nav-label" *ngIf="!collapsed()">Dashboard</span>
          </a>
          <a routerLink="/containers" routerLinkActive="active" class="nav-item">
            <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm-3 8h12v2H4v-2z"/>
            </svg>
            <span class="nav-label" *ngIf="!collapsed()">Containers</span>
          </a>
          <a routerLink="/alerts" routerLinkActive="active" class="nav-item">
            <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
            </svg>
            <span class="nav-label" *ngIf="!collapsed()">
              Alerts
              <span class="badge-dot" *ngIf="criticalCount() > 0">{{ criticalCount() }}</span>
            </span>
          </a>
          <a routerLink="/analytics" routerLinkActive="active" class="nav-item">
            <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
            </svg>
            <span class="nav-label" *ngIf="!collapsed()">Analytics</span>
          </a>
          <a routerLink="/admin" routerLinkActive="active" class="nav-item" *ngIf="isAdmin()">
            <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
            </svg>
            <span class="nav-label" *ngIf="!collapsed()">Admin</span>
          </a>
        </nav>

        <div class="sidebar-footer">
          <div class="live-indicator" *ngIf="!collapsed()">
            <span class="live-dot" [class.active]="wsConnected()"></span>
            <span>{{ wsConnected() ? 'LIVE' : 'OFFLINE' }}</span>
          </div>
          <button class="logout-btn" (click)="logout()">
            <svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd"/>
            </svg>
            <span class="nav-label" *ngIf="!collapsed()">Logout</span>
          </button>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .shell { display: flex; height: 100vh; overflow: hidden; background: #F8FAFC; }

    .sidebar {
      width: 220px; min-width: 220px; background: #003B72;
      display: flex; flex-direction: column;
      transition: width 0.25s ease, min-width 0.25s ease;
      z-index: 100;
    }
    .sidebar.collapsed { width: 64px; min-width: 64px; }

    .sidebar-header {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 14px; border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .logo-text { color: white; font-weight: 700; font-size: 15px; white-space: nowrap; }
    .collapse-btn {
      margin-left: auto; background: none; border: none; color: rgba(255,255,255,0.5);
      cursor: pointer; padding: 4px; border-radius: 4px;
      &:hover { color: white; background: rgba(255,255,255,0.1); }
    }
    .sidebar.collapsed .collapse-btn svg { transform: rotate(180deg); }

    .nav-links { flex: 1; padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
    .nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 10px; border-radius: 8px; text-decoration: none;
      color: rgba(255,255,255,0.65); transition: all 0.15s;
      white-space: nowrap; overflow: hidden;
      &:hover { background: rgba(255,255,255,0.1); color: white; }
      &.active { background: rgba(0,166,81,0.25); color: #00A651; }
    }
    .nav-icon { width: 20px; height: 20px; flex-shrink: 0; }
    .nav-label { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; }
    .badge-dot {
      background: #EF4444; color: white; font-size: 10px; font-weight: 700;
      padding: 1px 5px; border-radius: 99px; line-height: 1.4;
    }

    .sidebar-footer { padding: 12px 8px; border-top: 1px solid rgba(255,255,255,0.1); }
    .live-indicator {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4);
      padding: 6px 10px; letter-spacing: 0.05em;
    }
    .live-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #6B7280;
      &.active { background: #00A651; box-shadow: 0 0 6px #00A651; animation: pulse 1.5s infinite; }
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    .logout-btn {
      display: flex; align-items: center; gap: 10px; width: 100%;
      padding: 10px 10px; background: none; border: none; border-radius: 8px;
      color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.15s;
      &:hover { background: rgba(239,68,68,0.15); color: #EF4444; }
    }

    .main-content { flex: 1; overflow-y: auto; overflow-x: hidden; }
  `],
})
export class ShellComponent implements OnInit, OnDestroy {
  collapsed = signal(false);
  wsConnected = signal(false);
  criticalCount = signal(0);

  private subs: Subscription[] = [];

  constructor(
    private auth: AuthService,
    private ws: WebSocketService,
    private alertService: AlertService,
    private router: Router
  ) {}

  ngOnInit() {
    this.ws.connect();
    this.wsConnected.set(true);

    this.loadCriticalCount();

    this.subs.push(
      this.ws.messages$.subscribe((msg) => {
        if (msg.type === 'new_alert' && msg.data?.severity === 'CRITICAL') {
          this.criticalCount.update((c) => c + 1);
        }
      })
    );
  }

  private loadCriticalCount() {
    this.alertService
      .getAll({ severity: 'CRITICAL', is_active: true })
      .subscribe((alerts) => this.criticalCount.set(alerts.length));
  }

  toggleSidebar() {
    this.collapsed.update((v) => !v);
  }

  logout() {
    this.auth.logout();
  }

  isAdmin(): boolean {
    return this.auth.hasRole('admin', 'supervisor');
  }

  ngOnDestroy() {
    this.ws.disconnect();
    this.subs.forEach((s) => s.unsubscribe());
  }
}
