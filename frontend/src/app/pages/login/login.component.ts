import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { timeout, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-bg">
      <!-- Animated background layers -->
      <div class="bg-grid"></div>
      <div class="bg-glow"></div>

      <div class="login-wrap">
        <!-- Logo Panel -->
        <div class="brand-panel">
          <div class="brand-logo">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <rect width="56" height="56" rx="14" fill="#003B72"/>
              <path d="M10 40V24l18-14 18 14v16H36V28H20v12H10z" fill="#00A651"/>
              <rect x="20" y="28" width="16" height="3" rx="1.5" fill="white" opacity="0.5"/>
              <rect x="22" y="33" width="12" height="3" rx="1.5" fill="white" opacity="0.3"/>
            </svg>
          </div>
          <h1 class="brand-name">STAM Reefer</h1>
          <p class="brand-sub">Port de Radès — Intelligent Monitoring Platform</p>

          <div class="brand-stats">
            <div class="stat"><span class="stat-v">25</span><span class="stat-l">Containers</span></div>
            <div class="stat-divider"></div>
            <div class="stat"><span class="stat-v">24/7</span><span class="stat-l">Monitoring</span></div>
            <div class="stat-divider"></div>
            <div class="stat"><span class="stat-v">AI</span><span class="stat-l">Powered</span></div>
          </div>
        </div>

        <!-- Login Card -->
        <div class="login-card">
          <div class="login-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account</p>
          </div>

          <form class="login-form" (ngSubmit)="submit()">
            <div class="field">
              <label for="username">Username</label>
              <div class="input-wrap">
                <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
                </svg>
                <input id="username" type="text" [(ngModel)]="username" name="username"
                  placeholder="Enter username" autocomplete="username" required />
              </div>
            </div>

            <div class="field">
              <label for="password">Password</label>
              <div class="input-wrap">
                <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
                </svg>
                <input id="password" type="password" [(ngModel)]="password" name="password"
                  placeholder="Enter password" autocomplete="current-password" required />
              </div>
            </div>

            <div class="error-msg" *ngIf="error">{{ error }}</div>

            <button type="submit" class="login-btn" [disabled]="loading">
              <span *ngIf="!loading">Sign In</span>
              <span *ngIf="loading" class="spinner"></span>
            </button>
          </form>

          <div class="demo-creds">
            <p class="demo-title">Demo credentials</p>
            <div class="cred-row" (click)="fillCreds('admin','admin123')">
              <span class="cred-role admin">Admin</span>
              <span class="cred-text">admin / admin123</span>
            </div>
            <div class="cred-row" (click)="fillCreds('operator','admin123')">
              <span class="cred-role operator">Operator</span>
              <span class="cred-text">operator / admin123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-bg {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #001d3d 0%, #003B72 50%, #00285a 100%);
      position: relative; overflow: hidden; padding: 24px;
    }
    .bg-grid {
      position: absolute; inset: 0;
      background-image: linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),
                        linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px);
      background-size: 60px 60px;
    }
    .bg-glow {
      position: absolute; top: -20%; right: -10%; width: 600px; height: 600px;
      background: radial-gradient(circle, rgba(0,166,81,0.15) 0%, transparent 70%);
      pointer-events: none;
    }

    .login-wrap {
      display: flex; gap: 48px; align-items: center;
      max-width: 900px; width: 100%; position: relative; z-index: 1;
    }

    /* Brand panel */
    .brand-panel { flex: 1; color: white; }
    .brand-logo { margin-bottom: 20px; }
    .brand-name { font-size: 32px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 8px; }
    .brand-sub { font-size: 14px; color: rgba(255,255,255,0.55); line-height: 1.6; }
    .brand-stats {
      display: flex; align-items: center; gap: 16px; margin-top: 40px;
      padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1);
    }
    .stat { display: flex; flex-direction: column; gap: 2px; }
    .stat-v { font-size: 22px; font-weight: 700; color: #00A651; }
    .stat-l { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-divider { width: 1px; height: 40px; background: rgba(255,255,255,0.1); }

    /* Login card */
    .login-card {
      background: white; border-radius: 20px; padding: 40px;
      width: 380px; flex-shrink: 0;
      box-shadow: 0 24px 80px rgba(0,0,0,0.3);
    }
    .login-card-header { margin-bottom: 28px; }
    .login-card-header h2 { font-size: 22px; font-weight: 700; color: #0F172A; }
    .login-card-header p { font-size: 13px; color: #64748B; margin-top: 4px; }

    .login-form { display: flex; flex-direction: column; gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: 13px; font-weight: 600; color: #374151; }
    .input-wrap { position: relative; }
    .input-icon {
      position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
      width: 16px; height: 16px; color: #9CA3AF; pointer-events: none;
    }
    input {
      width: 100%; padding: 10px 12px 10px 38px; border: 1.5px solid #E5E7EB;
      border-radius: 10px; font-size: 14px; color: #0F172A; outline: none;
      transition: border-color 0.15s;
      &:focus { border-color: #003B72; box-shadow: 0 0 0 3px rgba(0,59,114,0.08); }
      &::placeholder { color: #D1D5DB; }
    }

    .error-msg {
      background: rgba(239,68,68,0.08); color: #DC2626;
      padding: 10px 14px; border-radius: 8px; font-size: 13px;
    }

    .login-btn {
      width: 100%; padding: 12px; background: #003B72; color: white; border: none;
      border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
      transition: all 0.2s; display: flex; align-items: center; justify-content: center;
      margin-top: 4px;
      &:hover:not(:disabled) { background: #0056a8; transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(0,59,114,0.3); }
      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }
    .spinner {
      width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .demo-creds {
      margin-top: 24px; padding-top: 20px; border-top: 1px solid #F1F5F9;
    }
    .demo-title { font-size: 11px; font-weight: 600; color: #9CA3AF;
      text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
    .cred-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; border-radius: 8px; cursor: pointer;
      transition: background 0.12s; margin-bottom: 4px;
      &:hover { background: #F8FAFC; }
    }
    .cred-role {
      font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px;
      &.admin    { background: rgba(0,59,114,0.1); color: #003B72; }
      &.operator { background: rgba(0,166,81,0.1); color: #00A651; }
    }
    .cred-text { font-size: 13px; color: #6B7280; font-family: monospace; }

    @media (max-width: 700px) {
      .login-wrap { flex-direction: column; }
      .brand-panel { text-align: center; }
      .brand-stats { justify-content: center; }
      .login-card { width: 100%; }
    }
  `]
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  fillCreds(u: string, p: string) {
    this.username = u;
    this.password = p;
  }

  submit() {
    if (!this.username || !this.password) return;
    this.loading = true;
    this.error = '';
    this.auth.login(this.username, this.password).pipe(
      timeout(10000),
      catchError((err) => {
        if (err.name === 'TimeoutError') {
          return throwError(() => ({ error: { detail: '⚠️ Le serveur ne répond pas. Vérifiez que le backend est démarré.' } }));
        }
        return throwError(() => err);
      })
    ).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (e) => {
        this.error = e?.error?.detail || 'Identifiants invalides ou serveur inaccessible.';
        this.loading = false;
      },
    });
  }
}
