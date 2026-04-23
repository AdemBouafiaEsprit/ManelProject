import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalyticsService } from '../../core/api/analytics.service';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../shared/models/models';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="page">
  <div class="page-header mb-6">
    <h1 class="page-title">System Administration</h1>
    <p class="page-subtitle">User management, platform configuration and simulation controls</p>
  </div>

  <div class="grid-2 mb-6">
    <!-- Simulation Controls -->
    <div class="card">
      <div class="card-header"><span class="card-title">🎮 Demonstration Controls</span></div>
      <div class="card-body">
        <p class="text-sm text-muted mb-4">
          Manually trigger system actions for demonstration purposes.
        </p>
        <button class="btn btn-primary w-full justify-center" (click)="triggerScoring()" [disabled]="loadingScore">
          {{ loadingScore ? 'Scoring...' : 'Trigger ML Fleet Scoring Now' }}
        </button>
        <div class="mt-4 error-msg" style="font-size:12px">
          <b>Fault Injection:</b> run the simulator CLI directly:<br>
          <code style="display:block;margin-top:4px;background:rgba(0,0,0,0.08);padding:4px;border-radius:4px">python simulator.py --inject-fault MSCU0042 compressor_degradation</code>
        </div>
      </div>
    </div>

    <!-- System Health -->
    <div class="card">
      <div class="card-header"><span class="card-title">🖥️ System Health</span></div>
      <div class="card-body">
        <table class="data-table">
          <tbody>
            <tr><td>PostgreSQL / TimescaleDB</td><td><span class="status-badge active">Online</span></td><td class="text-xs text-muted">12ms</td></tr>
            <tr><td>Redis Cache &amp; PubSub</td><td><span class="status-badge active">Online</span></td><td class="text-xs text-muted">42MB</td></tr>
            <tr><td>Mosquitto MQTT Broker</td><td><span class="status-badge active">Online</span></td><td class="text-xs text-muted">1.2 msg/s</td></tr>
            <tr><td>FastAPI Backend</td><td><span class="status-badge active">Online</span></td><td class="text-xs text-muted">Uptime 4h</td></tr>
            <tr><td>XGBoost Risk Model</td><td><span class="status-badge active">v1.0</span></td><td class="text-xs text-muted">2 days ago</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- User Management -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">👥 User Management</span>
      <button class="btn btn-primary btn-sm" (click)="showCreate.set(!showCreate())">
        {{ showCreate() ? 'Cancel' : '+ New User' }}
      </button>
    </div>

    <!-- Create User Form -->
    <div class="create-form" *ngIf="showCreate()">
      <div class="form-row">
        <div class="form-group">
          <label>Username</label>
          <input class="form-input" [(ngModel)]="newUser.username" placeholder="johndoe" />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input class="form-input" [(ngModel)]="newUser.email" type="email" placeholder="john@port.com" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input class="form-input" [(ngModel)]="newUser.password" type="password" placeholder="••••••••" />
        </div>
        <div class="form-group">
          <label>Role</label>
          <select class="form-input" [(ngModel)]="newUser.role">
            <option value="operator">Operator</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button class="btn btn-primary align-end" (click)="createUser()" [disabled]="creating()">
          {{ creating() ? 'Creating…' : 'Create' }}
        </button>
      </div>
      <div class="form-error" *ngIf="createError()">{{ createError() }}</div>
    </div>

    <!-- Users Table -->
    <div class="card-body" style="padding:0">
      <table class="data-table" *ngIf="!usersLoading()">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let u of users()" [class.inactive-row]="!u.is_active">
            <td><span class="username-badge">{{ u.username }}</span></td>
            <td class="text-xs text-muted">{{ u.email }}</td>
            <td>
              <select class="role-select" [ngModel]="u.role" (ngModelChange)="changeRole(u, $event)"
                [disabled]="u.id === currentUser()?.id">
                <option value="operator">Operator</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </td>
            <td>
              <span class="status-badge" [class.active]="u.is_active" [class.offline]="!u.is_active">
                {{ u.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="text-xs text-muted">{{ u.created_at | date:'dd/MM/yy' }}</td>
            <td>
              <button class="btn btn-ghost btn-sm danger-btn"
                *ngIf="u.is_active && u.id !== currentUser()?.id"
                (click)="deactivateUser(u)">
                Deactivate
              </button>
            </td>
          </tr>
          <tr *ngIf="users().length === 0">
            <td colspan="6" class="text-center text-muted" style="padding:32px">No users found</td>
          </tr>
        </tbody>
      </table>
      <div *ngIf="usersLoading()" style="padding:24px">
        <div class="skeleton" style="height:40px;margin-bottom:8px;border-radius:6px" *ngFor="let i of [1,2,3]"></div>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    .create-form { padding: 16px 20px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; }
    .form-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
    .form-group { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 140px; }
    .form-group label { font-size: 12px; font-weight: 600; color: #374151; }
    .form-input {
      padding: 8px 10px; border: 1.5px solid #E2E8F0; border-radius: 8px;
      font-size: 13px; outline: none;
      &:focus { border-color: #003B72; }
    }
    .align-end { align-self: flex-end; }
    .form-error { margin-top: 8px; color: #DC2626; font-size: 13px; }
    .role-select {
      padding: 4px 8px; border: 1px solid #E2E8F0; border-radius: 6px;
      font-size: 12px; background: white; cursor: pointer; outline: none;
    }
    .username-badge { font-weight: 600; color: #003B72; font-family: monospace; font-size: 13px; }
    .inactive-row { opacity: 0.55; }
    .danger-btn { color: #DC2626 !important; border-color: rgba(239,68,68,0.3) !important; }
  `]
})
export class AdminComponent implements OnInit {
  loadingScore = false;
  users = signal<User[]>([]);
  usersLoading = signal(true);
  showCreate = signal(false);
  creating = signal(false);
  createError = signal<string | null>(null);
  currentUser = signal<User | null>(null);

  newUser = { username: '', email: '', password: '', role: 'operator' };

  constructor(private analytics: AnalyticsService, private auth: AuthService) {}

  ngOnInit() {
    this.currentUser.set(this.auth.currentUser);
    this.loadUsers();
  }

  loadUsers() {
    this.usersLoading.set(true);
    this.auth.getUserList().subscribe({
      next: (data) => { this.users.set(data); this.usersLoading.set(false); },
      error: () => this.usersLoading.set(false),
    });
  }

  createUser() {
    if (!this.newUser.username || !this.newUser.email || !this.newUser.password) return;
    this.creating.set(true);
    this.createError.set(null);
    this.auth.createUser(this.newUser).subscribe({
      next: (u) => {
        this.creating.set(false);
        this.showCreate.set(false);
        this.newUser = { username: '', email: '', password: '', role: 'operator' };
        this.users.update(prev => [...prev, u]);
      },
      error: (err) => {
        this.creating.set(false);
        this.createError.set(err.error?.detail || 'Failed to create user.');
      },
    });
  }

  changeRole(u: User, role: string) {
    this.auth.updateUser(u.id, { role }).subscribe({
      next: (updated) => this.users.update(prev => prev.map(x => x.id === updated.id ? updated : x)),
    });
  }

  deactivateUser(u: User) {
    if (!confirm(`Deactivate ${u.username}?`)) return;
    this.auth.deactivateUser(u.id).subscribe({
      next: () => this.users.update(prev => prev.map(x => x.id === u.id ? { ...x, is_active: false } : x)),
    });
  }

  triggerScoring() {
    this.loadingScore = true;
    this.analytics.triggerScoring().subscribe({
      next: () => { alert('Fleet scored successfully.'); this.loadingScore = false; },
      error: () => this.loadingScore = false,
    });
  }
}
