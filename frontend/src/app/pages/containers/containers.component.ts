import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ContainerService } from '../../core/api/container.service';
import { Container } from '../../shared/models/models';
import { RegisterContainerComponent } from './register-container.component';

@Component({
  selector: 'app-containers',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, RegisterContainerComponent],
  template: `
<div class="page">
  <div class="page-header flex items-center justify-between">
    <div>
      <h1 class="page-title">Container Fleet</h1>
      <p class="page-subtitle">{{ filtered().length }} of {{ containers().length }} containers shown</p>
    </div>
    <div class="flex gap-2">
      <select class="filter-select" [(ngModel)]="filterBlock" (change)="applyFilters()">
        <option value="">All Blocks</option>
        <option value="A">Block A</option>
        <option value="B">Block B</option>
        <option value="C">Block C</option>
      </select>
      <select class="filter-select" [(ngModel)]="filterStatus" (change)="applyFilters()">
        <option value="">All Status</option>
        <option value="active">Active</option>
        <option value="critical">Critical</option>
        <option value="maintenance">Maintenance</option>
      </select>
      <select class="filter-select" [(ngModel)]="filterRisk" (change)="applyFilters()">
        <option value="">All Risk</option>
        <option value="CRITICAL">Critical</option>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
      </select>
      <input class="search-input" [(ngModel)]="search" (input)="applyFilters()"
        placeholder="🔍 Search container..." />
      <button class="btn btn-primary" (click)="showRegister.set(true)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Register Container
      </button>
    </div>
  </div>

  <!-- Bulk actions toolbar -->
  <div class="bulk-toolbar" *ngIf="selected().size > 0">
    <span class="bulk-info">{{ selected().size }} selected</span>
    <select class="filter-select" [(ngModel)]="bulkStatus">
      <option value="">Set Status…</option>
      <option value="active">Active</option>
      <option value="maintenance">Maintenance</option>
      <option value="offline">Offline</option>
      <option value="departed">Departed</option>
    </select>
    <button class="btn btn-primary btn-sm" (click)="applyBulkStatus()" [disabled]="!bulkStatus || bulkLoading()">
      {{ bulkLoading() ? 'Applying…' : 'Apply' }}
    </button>
    <button class="btn btn-ghost btn-sm" (click)="clearSelection()">Clear</button>
  </div>

  <app-register-container *ngIf="showRegister()"
    (close)="showRegister.set(false)"
    (created)="onContainerCreated($event)">
  </app-register-container>

  <app-register-container *ngIf="showEdit() && editingContainer()"
    [editContainer]="editingContainer()"
    (close)="closeEdit()"
    (created)="onContainerUpdated($event)">
  </app-register-container>

  <div class="card" style="overflow:auto">
    <table class="data-table" *ngIf="!loading(); else skeletonTpl">
      <thead>
        <tr>
          <th><input type="checkbox" (change)="toggleAll($event)" /></th>
          <th>Container #</th>
          <th>Commodity</th>
          <th>Block / Slot</th>
          <th>Setpoint</th>
          <th>Current Temp</th>
          <th>Compressor</th>
          <th>Risk</th>
          <th>Status</th>
          <th>Last Update</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let c of filtered()" [class.selected-row]="selected().has(c.id)">
          <td (click)="$event.stopPropagation()">
            <input type="checkbox" [checked]="selected().has(c.id)" (change)="toggleSelect(c.id)" />
          </td>
          <td [routerLink]="['/containers', c.id]" style="cursor:pointer"><code class="cn-code">{{ c.container_number }}</code></td>
          <td>
            <div class="commodity-cell">
              <span class="comm-icon">{{ getCommodityIcon(c.commodity) }}</span>
              {{ c.commodity }}
            </div>
          </td>
          <td>
            <span *ngIf="c.block" class="block-badge">{{ c.block }}</span>
            {{ c.row_num }}-{{ c.bay }}
            <span *ngIf="c.ecp_id" class="ecp-label">{{ c.ecp_id }}</span>
          </td>
          <td class="mono">{{ c.target_temp }}°C</td>
          <td>
            <span class="temp-cell" [class.temp-warn]="isTempWarning(c)" [class.temp-crit]="isTempCritical(c)">
              {{ c.latest_reading?.temperature?.toFixed(1) ?? '—' }}°C
            </span>
          </td>
          <td>
            <span class="comp-indicator" [class.on]="c.latest_reading?.compressor_status !== false">
              <span class="dot" [class]="c.latest_reading?.compressor_status !== false ? 'green' : 'red'"></span>
              {{ c.latest_reading?.compressor_status !== false ? 'ON' : 'OFF' }}
            </span>
          </td>
          <td>
            <span class="risk-badge {{ c.latest_risk?.risk_level ?? 'LOW' }}">
              {{ c.latest_risk?.risk_level ?? 'LOW' }}
            </span>
          </td>
          <td>
            <span class="status-badge {{ c.status }}">{{ c.status.toUpperCase() }}</span>
          </td>
          <td class="text-muted text-xs">{{ c.latest_reading?.time | date:'HH:mm:ss' }}</td>
          <td (click)="$event.stopPropagation()">
            <button class="btn-edit" (click)="openEdit(c)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
          </td>
        </tr>
        <tr *ngIf="filtered().length === 0">
          <td colspan="11" class="empty-row">No containers match your filters</td>
        </tr>
      </tbody>
    </table>

    <ng-template #skeletonTpl>
      <div class="skeleton-rows">
        <div class="skeleton skeleton-row" *ngFor="let i of [1,2,3,4,5]"></div>
      </div>
    </ng-template>
  </div>
</div>
  `,
  styles: [`
    .filter-select, .search-input {
      padding: 8px 12px; border: 1.5px solid #E2E8F0; border-radius: 8px;
      font-size: 13px; color: #374151; outline: none; background: white;
      &:focus { border-color: #003B72; }
    }
    .search-input { width: 200px; }

    .cn-code { font-family: monospace; font-size: 13px; color: #003B72; font-weight: 600; }
    .commodity-cell { display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .comm-icon { font-size: 16px; }
    .block-badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border-radius: 6px; background: #003B72;
      color: white; font-size: 11px; font-weight: 700; margin-right: 4px;
    }
    .ecp-label { font-size: 10px; color: #9CA3AF; margin-left: 4px; }
    .mono { font-family: monospace; }

    .temp-cell { font-weight: 600; font-size: 13px; color: #0F172A; }
    .temp-warn { color: #B45309; background: rgba(245,158,11,0.1);
      padding: 2px 6px; border-radius: 4px; }
    .temp-crit { color: #DC2626; background: rgba(239,68,68,0.1);
      padding: 2px 6px; border-radius: 4px; animation: badge-pulse 2s infinite; }

    .comp-indicator { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; }
    .dot { width: 7px; height: 7px; border-radius: 50%; }
    .dot.green { background: #22C55E; box-shadow: 0 0 4px #22C55E; }
    .dot.red   { background: #EF4444; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

    .empty-row { text-align: center; padding: 40px !important; color: #9CA3AF; }
    .skeleton-rows { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .skeleton-row { height: 44px; border-radius: 8px; }

    .btn-edit {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 10px; border-radius: 6px; border: 1.5px solid #E2E8F0;
      background: white; color: #374151; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all 0.15s;
      &:hover { border-color: #003B72; color: #003B72; background: #F0F7FF; }
    }
    .bulk-toolbar {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 16px; background: #EFF6FF; border: 1.5px solid #BFDBFE;
      border-radius: 10px; margin-bottom: 12px;
    }
    .bulk-info { font-size: 13px; font-weight: 600; color: #1D4ED8; flex: 1; }
    .selected-row { background: rgba(0,59,114,0.04); }
  `]
})
export class ContainersComponent implements OnInit {
  containers = signal<Container[]>([]);
  filtered = signal<Container[]>([]);
  loading = signal(true);
  selected = signal<Set<string>>(new Set());
  bulkLoading = signal(false);

  search = '';
  filterBlock = '';
  filterStatus = '';
  filterRisk = '';
  bulkStatus = '';
  showRegister = signal(false);
  showEdit = signal(false);
  editingContainer = signal<Container | null>(null);

  constructor(private containerService: ContainerService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['q']) this.search = params['q'];
    });
    this.containerService.getAll().subscribe({
      next: (data) => {
        this.containers.set(data);
        this.applyFilters();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onContainerCreated(c: Container) {
    this.showRegister.set(false);
    this.containers.update(prev => [c, ...prev]);
    this.applyFilters();
  }

  openEdit(c: Container) {
    this.editingContainer.set(c);
    this.showEdit.set(true);
  }

  closeEdit() {
    this.showEdit.set(false);
    this.editingContainer.set(null);
  }

  onContainerUpdated(updated: Container) {
    this.closeEdit();
    this.containers.update(prev => prev.map(c => c.id === updated.id ? updated : c));
    this.applyFilters();
  }

  toggleSelect(id: string) {
    const set = new Set(this.selected());
    set.has(id) ? set.delete(id) : set.add(id);
    this.selected.set(set);
  }

  toggleAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.set(checked ? new Set(this.filtered().map(c => c.id)) : new Set());
  }

  clearSelection() {
    this.selected.set(new Set());
    this.bulkStatus = '';
  }

  applyBulkStatus() {
    if (!this.bulkStatus) return;
    const ids = Array.from(this.selected());
    this.bulkLoading.set(true);
    this.containerService.bulkStatus(ids, this.bulkStatus).subscribe({
      next: () => {
        this.bulkLoading.set(false);
        this.clearSelection();
        this.containerService.getAll().subscribe(data => {
          this.containers.set(data);
          this.applyFilters();
        });
      },
      error: () => this.bulkLoading.set(false),
    });
  }

  applyFilters() {
    let data = this.containers();
    if (this.search) {
      const q = this.search.toLowerCase();
      data = data.filter(
        (c) =>
          c.container_number.toLowerCase().includes(q) ||
          c.commodity.toLowerCase().includes(q) ||
          c.owner?.toLowerCase().includes(q)
      );
    }
    if (this.filterBlock) data = data.filter((c) => c.block === this.filterBlock);
    if (this.filterStatus) data = data.filter((c) => c.status === this.filterStatus);
    if (this.filterRisk) data = data.filter((c) => c.latest_risk?.risk_level === this.filterRisk);
    this.filtered.set(data);
  }

  isTempWarning(c: Container): boolean {
    if (!c.latest_reading?.temperature) return false;
    const dev = Math.abs(c.latest_reading.temperature - c.target_temp);
    return dev > c.tolerance * 1.5 && dev <= c.tolerance * 3;
  }

  isTempCritical(c: Container): boolean {
    if (!c.latest_reading?.temperature) return false;
    return Math.abs(c.latest_reading.temperature - c.target_temp) > c.tolerance * 3;
  }

  getCommodityIcon(commodity: string): string {
    const icons: Record<string, string> = {
      'Frozen Fish': '🐟', 'Fresh Vegetables': '🥦', 'Dairy Products': '🧀',
      'Meat Products': '🥩', 'Pharmaceutical': '💊', 'Tropical Fruits': '🍍', 'Ice Cream': '🍦',
    };
    return icons[commodity] || '📦';
  }
}
