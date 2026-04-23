import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertService } from '../../core/api/alert.service';
import { Alert } from '../../shared/models/models';

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="page">
  <div class="page-header flex items-center justify-between">
    <div>
      <h1 class="page-title">Alert Center</h1>
      <p class="page-subtitle">{{ filtered().length }} alerts shown · {{ selected().size }} selected</p>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-accent btn-sm" (click)="bulkAck()" [disabled]="selected().size === 0">
        ✓ Acknowledge Selected ({{ selected().size }})
      </button>
      <select class="filter-select" [(ngModel)]="filterSeverity" (change)="applyFilters()">
        <option value="">All Severity</option>
        <option value="CRITICAL">Critical</option>
        <option value="WARNING">Warning</option>
        <option value="INFO">Info</option>
      </select>
      <select class="filter-select" [(ngModel)]="filterActive" (change)="applyFilters()">
        <option value="">All Status</option>
        <option value="true">Active</option>
        <option value="false">Resolved</option>
      </select>
    </div>
  </div>

  <!-- Alert counts strip -->
  <div class="alert-counts mb-4">
    <div class="ac-item danger" (click)="quickFilter('CRITICAL')">
      <span class="ac-val">{{ countBySeverity('CRITICAL') }}</span>
      <span class="ac-label">Critical</span>
    </div>
    <div class="ac-item warn" (click)="quickFilter('WARNING')">
      <span class="ac-val">{{ countBySeverity('WARNING') }}</span>
      <span class="ac-label">Warning</span>
    </div>
    <div class="ac-item info" (click)="quickFilter('INFO')">
      <span class="ac-val">{{ countBySeverity('INFO') }}</span>
      <span class="ac-label">Info</span>
    </div>
    <div class="ac-item" (click)="quickFilter('')">
      <span class="ac-val">{{ alerts().length }}</span>
      <span class="ac-label">Total</span>
    </div>
  </div>

  <div class="card" style="overflow:auto">
    <table class="data-table" *ngIf="!loading()">
      <thead>
        <tr>
          <th><input type="checkbox" (change)="toggleAll($event)" /></th>
          <th>Severity</th>
          <th>Container</th>
          <th>Type</th>
          <th>Message</th>
          <th>Recommended Action</th>
          <th>Triggered</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let a of filtered()" [class.selected-row]="selected().has(a.id)"
          [class.resolved-row]="!a.is_active">
          <td><input type="checkbox" [checked]="selected().has(a.id)" (change)="toggleSelect(a.id)" /></td>
          <td><span class="severity-badge {{ a.severity }}">{{ a.severity }}</span></td>
          <td><code class="cn-code">{{ a.container_number ?? a.container_id.slice(0,8) }}</code></td>
          <td><span class="type-badge">{{ a.alert_type }}</span></td>
          <td class="msg-cell">{{ a.message }}</td>
          <td class="action-cell text-xs text-muted">{{ a.recommended_action }}</td>
          <td class="text-xs text-muted">{{ a.triggered_at | date:'dd/MM/yy HH:mm' }}</td>
          <td>
            <span *ngIf="!a.is_active" class="status-badge departed">Resolved</span>
            <span *ngIf="a.is_active && a.acknowledged_at" class="status-badge maintenance">Acked</span>
            <span *ngIf="a.is_active && !a.acknowledged_at" class="status-badge critical">Active</span>
          </td>
          <td>
            <div class="flex gap-1">
              <button class="btn btn-ghost btn-sm" (click)="ack(a)" *ngIf="a.is_active && !a.acknowledged_at">
                Ack
              </button>
              <button class="btn btn-ghost btn-sm" (click)="openResolve(a)" *ngIf="a.is_active">
                Resolve
              </button>
            </div>
            <div *ngIf="!a.is_active && a.resolution_notes" class="res-notes">
              {{ a.resolution_notes }}
            </div>
          </td>
        </tr>
        <tr *ngIf="filtered().length === 0">
          <td colspan="9" style="text-align:center;padding:40px;color:#9CA3AF">No alerts found</td>
        </tr>
      </tbody>
    </table>
    <div *ngIf="loading()" class="p-8">
      <div class="skeleton skeleton-row" *ngFor="let i of [1,2,3,4,5]" style="margin-bottom:10px;height:44px;border-radius:6px"></div>
    </div>
  </div>
</div>

<!-- Resolve modal -->
<div class="modal-backdrop" *ngIf="resolvingAlert()">
  <div class="modal-box">
    <h3 class="modal-title">Resolve Alert</h3>
    <p class="text-xs text-muted mb-3">
      {{ resolvingAlert()?.message }}
    </p>
    <label class="form-label">Resolution Notes (optional)</label>
    <textarea class="form-input" rows="3" [(ngModel)]="resolveNotes"
      placeholder="Describe what action was taken..."></textarea>
    <div class="flex gap-2 mt-4 justify-end">
      <button class="btn btn-ghost btn-sm" (click)="closeResolve()">Cancel</button>
      <button class="btn btn-primary btn-sm" (click)="submitResolve()" [disabled]="resolving()">
        {{ resolving() ? 'Resolving…' : 'Confirm Resolve' }}
      </button>
    </div>
  </div>
</div>
  `,
  styles: [`
    .filter-select {
      padding: 7px 12px; border: 1.5px solid #E2E8F0; border-radius: 8px;
      font-size: 13px; outline: none; background: white;
      &:focus { border-color: #003B72; }
    }
    .alert-counts {
      display: flex; gap: 12px;
    }
    .ac-item {
      flex: 1; padding: 14px 20px; border-radius: 10px;
      background: white; border: 1.5px solid #E2E8F0;
      cursor: pointer; transition: all 0.15s; text-align: center;
      &:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
      &.danger { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.03); }
      &.warn   { border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.03); }
      &.info   { border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.03); }
    }
    .ac-val { display: block; font-size: 28px; font-weight: 700; color: #0F172A; }
    .ac-label { font-size: 12px; color: #64748B; font-weight: 500; }
    .danger .ac-val { color: #EF4444; }
    .warn .ac-val   { color: #F59E0B; }
    .info .ac-val   { color: #3B82F6; }

    .cn-code { font-family: monospace; font-size: 12px; color: #003B72; font-weight: 600; }
    .type-badge {
      font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px;
      background: #F1F5F9; color: #475569; letter-spacing: 0.03em;
    }
    .msg-cell { max-width: 280px; font-size: 12px; line-height: 1.4; }
    .action-cell { max-width: 200px; line-height: 1.4; }
    .selected-row { background: rgba(0,59,114,0.04); }
    .resolved-row { opacity: 0.6; }
    .p-8 { padding: 32px; }
    .skeleton-row { height: 44px; }
    .res-notes { font-size: 11px; color: #64748B; font-style: italic; margin-top: 2px; max-width: 180px; }
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.45);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal-box {
      background: white; border-radius: 14px; padding: 28px;
      width: 420px; box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .modal-title { font-size: 16px; font-weight: 700; color: #0F172A; margin-bottom: 12px; }
    .form-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    .form-input { width: 100%; border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; font-size: 13px; outline: none; resize: vertical; box-sizing: border-box; }
  `]
})
export class AlertsComponent implements OnInit {
  alerts = signal<Alert[]>([]);
  filtered = signal<Alert[]>([]);
  selected = signal<Set<string>>(new Set());
  loading = signal(true);
  resolvingAlert = signal<Alert | null>(null);
  resolving = signal(false);
  resolveNotes = '';

  filterSeverity = '';
  filterActive = '';

  constructor(private alertService: AlertService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.alertService.getAll({ limit: 200 }).subscribe({
      next: (data) => {
        this.alerts.set(data);
        this.applyFilters();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  applyFilters() {
    let data = this.alerts();
    if (this.filterSeverity) data = data.filter((a) => a.severity === this.filterSeverity);
    if (this.filterActive === 'true') data = data.filter((a) => a.is_active);
    if (this.filterActive === 'false') data = data.filter((a) => !a.is_active);
    this.filtered.set(data);
  }

  quickFilter(severity: string) {
    this.filterSeverity = severity;
    this.applyFilters();
  }

  countBySeverity(s: string): number {
    return this.alerts().filter((a) => a.severity === s).length;
  }

  toggleSelect(id: string) {
    const set = new Set(this.selected());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.selected.set(set);
  }

  toggleAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.set(checked ? new Set(this.filtered().map((a) => a.id)) : new Set());
  }

  ack(a: Alert) {
    this.alertService.acknowledge(a.id).subscribe(() => this.load());
  }

  openResolve(a: Alert) {
    this.resolvingAlert.set(a);
    this.resolveNotes = '';
  }

  closeResolve() {
    this.resolvingAlert.set(null);
    this.resolveNotes = '';
  }

  submitResolve() {
    const a = this.resolvingAlert();
    if (!a) return;
    this.resolving.set(true);
    this.alertService.resolve(a.id, this.resolveNotes || undefined).subscribe({
      next: () => { this.resolving.set(false); this.closeResolve(); this.load(); },
      error: () => this.resolving.set(false),
    });
  }

  bulkAck() {
    const ids = Array.from(this.selected());
    this.alertService.bulkAcknowledge(ids).subscribe(() => {
      this.selected.set(new Set());
      this.load();
    });
  }
}
