import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
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

  <app-register-container *ngIf="showRegister()" 
    (close)="showRegister.set(false)"
    (created)="onContainerCreated($event)">
  </app-register-container>

  <div class="card" style="overflow:auto">
    <table class="data-table" *ngIf="!loading(); else skeletonTpl">
      <thead>
        <tr>
          <th>Container #</th>
          <th>Commodity</th>
          <th>Block / Slot</th>
          <th>Setpoint</th>
          <th>Current Temp</th>
          <th>Humidity</th>
          <th>Compressor</th>
          <th>Risk</th>
          <th>Status</th>
          <th>Last Update</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let c of filtered()" [routerLink]="['/containers', c.id]">
          <td><code class="cn-code">{{ c.container_number }}</code></td>
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
          <td>{{ c.latest_reading?.humidity?.toFixed(0) ?? '—' }}%</td>
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
        </tr>
        <tr *ngIf="filtered().length === 0">
          <td colspan="10" class="empty-row">No containers match your filters</td>
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
  `]
})
export class ContainersComponent implements OnInit {
  containers = signal<Container[]>([]);
  filtered = signal<Container[]>([]);
  loading = signal(true);

  search = '';
  filterBlock = '';
  filterStatus = '';
  filterRisk = '';
  showRegister = signal(false);

  constructor(private containerService: ContainerService) {}

  ngOnInit() {
    this.containerService.getAll().subscribe({
      next: (data) => {
        this.containers.set(data);
        this.filtered.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onContainerCreated(c: Container) {
    this.showRegister.set(false);
    // Add to local list and re-filter
    this.containers.update(prev => [c, ...prev]);
    this.applyFilters();
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
