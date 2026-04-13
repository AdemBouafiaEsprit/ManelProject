import { Component, OnInit, OnDestroy, signal, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AnalyticsService } from '../../core/api/analytics.service';
import { AlertService } from '../../core/api/alert.service';
import { ContainerService } from '../../core/api/container.service';
import { WebSocketService } from '../../core/websocket/websocket.service';
import { KPISummary, Alert, LiveReading } from '../../shared/models/models';

declare const L: any;

import { RegisterContainerComponent } from '../containers/register-container.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, RegisterContainerComponent],
  template: `
<div class="page">
  <div class="page-header flex items-center justify-between">
    <div>
      <h1 class="page-title">Operations Dashboard</h1>
      <p class="page-subtitle">Port de Radès — Real-time reefer fleet overview</p>
    </div>
    <div class="flex items-center gap-3">
      <span class="live-chip" [class.connected]="wsAlive()">
        <span class="live-dot"></span>
        {{ wsAlive() ? 'LIVE' : 'CONNECTING...' }}
      </span>
    </div>
  </div>

  <!-- KPI Strip -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
        </svg>
      </div>
      <div class="kpi-label">Active Reefers</div>
      <div class="kpi-value">{{ kpi()?.total_active_containers ?? '—' }}</div>
      <div class="kpi-sub">{{ kpi()?.offline_containers ?? 0 }} offline</div>
    </div>

    <div class="kpi-card danger">
      <div class="kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div class="kpi-label">Critical Alerts</div>
      <div class="kpi-value" [class.pulse-red]="(kpi()?.critical_alerts ?? 0) > 0">
        {{ kpi()?.critical_alerts ?? '—' }}
      </div>
      <div class="kpi-sub">{{ kpi()?.warning_alerts ?? 0 }} warnings</div>
    </div>

    <div class="kpi-card warning">
      <div class="kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      </div>
      <div class="kpi-label">Avg Risk Score</div>
      <div class="kpi-value">{{ ((kpi()?.avg_risk_score ?? 0) * 100).toFixed(0) }}<span style="font-size:16px">/100</span></div>
      <div class="kpi-sub">Fleet-wide average</div>
    </div>

    <div class="kpi-card info">
      <div class="kpi-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
      </div>
      <div class="kpi-label">Losses Prevented</div>
      <div class="kpi-value">\${{ (kpi()?.losses_prevented_usd ?? 0).toFixed(0) }}</div>
      <div class="kpi-sub">Today's interventions</div>
    </div>
  </div>

  <!-- Main Split: Map + Live Feed -->
  <div class="dashboard-split">
    <!-- Map -->
    <div class="card map-card">
      <div id="port-map" class="port-map" [class.fullscreen]="isFullscreen()">
        <!-- Map Controls -->
        <div class="map-controls">
          <button class="m-btn" [class.active]="mapMode() === 'default'" (click)="setMapMode('default')" title="Pan & Zoom">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <button class="m-btn" [class.active]="mapMode() === 'add_container'" (click)="setMapMode('add_container')" title="Add Container">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M12 11v6M9 14h6"/></svg>
          </button>
           <button class="m-btn" [class.active]="mapMode() === 'add_block'" (click)="setMapMode('add_block')" title="Add Block">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/><path d="M12 8v8M8 12h8"/></svg>
          </button>
          <div class="m-sep"></div>
          <button class="m-btn" (click)="toggleFullscreen()" title="Toggle Fullscreen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 15v6h-6M3 9V3h6"/>
            </svg>
          </button>
        </div>

        <!-- Mode Indicator -->
        <div class="mode-toast" *ngIf="mapMode() !== 'default'">
          <span class="pulse-dot"></span>
          {{ mapMode() === 'add_container' ? 'Click on map to place container' : 
             (blockPoints.length === 0 ? 'Click to set first corner of new block' : 'Click to set second corner') }}
          <button class="btn-cancel" (click)="setMapMode('default')">Cancel</button>
        </div>

        <!-- New Block Form Overlay -->
        <div class="block-form-overlay" *ngIf="showBlockForm()">
          <div class="card p-4 shadow-lg w-80">
            <h3 class="font-bold text-sm mb-3">New Block Details</h3>
            <div class="mb-3">
              <label class="text-xs block mb-1">Block ID</label>
              <input type="text" class="form-input" [(ngModel)]="newBlockData.block_id" placeholder="e.g. D" />
            </div>
            <div class="mb-3">
              <label class="text-xs block mb-1">Name</label>
              <input type="text" class="form-input" [(ngModel)]="newBlockData.name" placeholder="Reefer West" />
            </div>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm flex-1" (click)="showBlockForm.set(false)">Cancel</button>
              <button class="btn btn-primary btn-sm flex-1" (click)="saveBlock()">Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <app-register-container *ngIf="showRegister()" 
      (close)="showRegister.set(false)"
      (created)="onContainerCreated($event)">
    </app-register-container>

    <!-- Live Feed -->
    <div class="live-panel">
      <!-- Critical containers quick list -->
      <div class="card mb-4" style="overflow:visible">
        <div class="card-header">
          <span class="card-title">🔴 Critical Containers</span>
          <a routerLink="/containers" class="btn btn-ghost btn-sm">View all</a>
        </div>
        <div class="critical-list">
          <div *ngFor="let c of criticalContainers()" class="critical-item" [routerLink]="['/containers', c.container_id]">
            <div class="ci-number">{{ c.container_number }}</div>
            <div class="ci-detail">{{ c.commodity }}</div>
            <div class="ci-temp" [class.danger-text]="true">{{ c.temperature?.toFixed(1) }}°C</div>
          </div>
          <div *ngIf="criticalContainers().length === 0" class="empty-state">
            <span>✅ No critical containers</span>
          </div>
        </div>
      </div>

      <!-- Recent Alerts -->
      <div class="card" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
        <div class="card-header">
          <span class="card-title">🔔 Live Alert Feed</span>
          <a routerLink="/alerts" class="btn btn-ghost btn-sm">All alerts</a>
        </div>
        <div class="alert-feed">
          <div *ngFor="let a of recentAlerts()" class="alert-item" [class]="'sev-' + a.severity.toLowerCase()">
            <div class="ai-header">
              <span class="severity-badge {{ a.severity }}">{{ a.severity }}</span>
              <span class="ai-time text-xs text-muted">{{ a.triggered_at | date:'HH:mm' }}</span>
            </div>
            <div class="ai-container text-xs font-semibold">{{ a.container_number }}</div>
            <div class="ai-message text-sm">{{ a.message }}</div>
          </div>
          <div *ngIf="recentAlerts().length === 0" class="empty-state">
            <span>✅ No active alerts</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  `,
  styles: [`
    .live-chip {
      display: flex; align-items: center; gap: 6px; padding: 6px 14px;
      background: rgba(107,114,128,0.1); border-radius: 99px; font-size: 11px;
      font-weight: 700; color: #6B7280; letter-spacing: 0.06em;
    }
    .live-chip.connected { background: rgba(0,166,81,0.1); color: #00A651; }
    .live-dot {
      width: 7px; height: 7px; background: #6B7280; border-radius: 50%;
      .connected & { background: #00A651; animation: pulse 1.5s infinite;
        box-shadow: 0 0 6px rgba(0,166,81,0.6); }
    }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

    .pulse-red { animation: num-pulse 2s infinite; }
    @keyframes num-pulse { 0%,100%{color:inherit} 50%{color:#EF4444} }

    .dashboard-split {
      display: grid; grid-template-columns: 60fr 40fr; gap: 16px;
      height: calc(100vh - 220px); min-height: 500px;
    }

    .map-card { display: flex; flex-direction: column; overflow: hidden; }
    .port-map { flex: 1; min-height: 400px; }

    .live-panel { display: flex; flex-direction: column; gap: 16px; overflow: hidden; }

    /* Map legend */
    .map-legend {
      display: flex; align-items: center; gap: 6px; font-size: 11px; color: #64748B;
    }
    .leg-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-left: 8px; }

    /* Critical list */
    .critical-list { padding: 8px; max-height: 200px; overflow-y: auto; }
    .critical-item {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 12px; border-radius: 8px; cursor: pointer;
      transition: background 0.12s;
      &:hover { background: #FEF2F2; }
    }
    .ci-number { font-size: 12px; font-weight: 700; color: #0F172A; font-family: monospace; }
    .ci-detail { font-size: 11px; color: #64748B; flex: 1; }
    .ci-temp { font-size: 14px; font-weight: 700; color: #EF4444; }

    /* Alert feed */
    .alert-feed { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .alert-item {
      padding: 10px 12px; border-radius: 8px; border-left: 3px solid transparent;
      &.sev-critical { border-color: #EF4444; background: rgba(239,68,68,0.04); }
      &.sev-warning  { border-color: #F59E0B; background: rgba(245,158,11,0.04); }
      &.sev-info     { border-color: #3B82F6; background: rgba(59,130,246,0.04); }
    }
    .ai-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
    .ai-container { color: #003B72; margin-bottom: 2px; }
    .ai-message { color: #374151; line-height: 1.4; font-size: 12px; }

    .empty-state { text-align: center; padding: 20px; color: #9CA3AF; font-size: 13px; }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  kpi = signal<KPISummary | null>(null);
  recentAlerts = signal<Alert[]>([]);
  criticalContainers = signal<LiveReading[]>([]);
  wsAlive = signal(false);
  isFullscreen = signal(false);
  mapMode = signal<'default' | 'add_block' | 'add_container'>('default');
  showRegister = signal(false);
  showBlockForm = signal(false);

  newBlockData = { block_id: '', name: '', lat_min: 0, lat_max: 0, lng_min: 0, lng_max: 0 };
  blockPoints: any[] = [];
  
  private map: any;
  private markers = new Map<string, any>();
  private blocksArr: any[] = [];
  private subs: Subscription[] = [];
  private liveReadings: LiveReading[] = [];

  constructor(
    private analytics: AnalyticsService,
    private alertService: AlertService,
    private containerService: ContainerService,
    private ws: WebSocketService,
    private http: HttpClient
  ) {}

  toggleFullscreen() {
    this.isFullscreen.update(v => !v);
    setTimeout(() => this.map.invalidateSize(), 300);
  }

  setMapMode(mode: 'default' | 'add_block' | 'add_container') {
    this.mapMode.set(mode);
    this.blockPoints = [];
  }

  ngOnInit() {
    this.loadData();
    this.wsAlive.set(true);

    this.subs.push(
      this.ws.messages$.subscribe((msg) => {
        if (msg.type === 'sensor_update') this.updateMarker(msg);
        if (msg.type === 'new_alert') this.loadAlerts();
        if (msg.type === 'risk_update') this.updateMarkerRisk(msg);
      })
    );
  }

  ngAfterViewInit() {
    this.initMap();
  }

  private loadData() {
    this.analytics.getSummary().subscribe((k) => this.kpi.set(k));
    this.loadAlerts();
    this.analytics.getLiveSensors().subscribe((data) => {
      this.liveReadings = data;
      this.criticalContainers.set(data.filter((d) => d.status === 'critical').slice(0, 5));
      this.refreshMapMarkers();
    });
  }

  private loadAlerts() {
    this.alertService.getAll({ is_active: true, limit: 20 }).subscribe((a) => {
      this.recentAlerts.set(a.slice(0, 15));
    });
  }

  private initMap() {
    if (typeof L === 'undefined') {
      setTimeout(() => this.initMap(), 500);
      return;
    }
    this.map = L.map('port-map', {
      center: [36.8025, 10.2425],
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.map.on('click', (e: any) => this.onMapClick(e));

    // Load port layout + container markers
    this.analytics.getMapLayout().subscribe((layout) => this.drawBlocks(layout));
    this.analytics.getMapContainers().subscribe((fc) => this.drawContainers(fc));
  }

  private onMapClick(e: any) {
    const latlng = e.latlng;

    if (this.mapMode() === 'add_container') {
      // Find which block we clicked in
      const block = this.blocksArr.find(b => b.polygon.getBounds().contains(latlng));
      
      this.containerService.setPrefill({
        block: block ? block.props.block_id : 'A',
        slot_lat: latlng.lat,
        slot_lng: latlng.lng
      });
      
      this.showRegister.set(true);
      this.setMapMode('default');
    }

    if (this.mapMode() === 'add_block') {
      this.blockPoints.push(latlng);
      if (this.blockPoints.length === 2) {
        const p1 = this.blockPoints[0];
        const p2 = this.blockPoints[1];
        this.newBlockData.lat_min = Math.min(p1.lat, p2.lat);
        this.newBlockData.lat_max = Math.max(p1.lat, p2.lat);
        this.newBlockData.lng_min = Math.min(p1.lng, p2.lng);
        this.newBlockData.lng_max = Math.max(p1.lng, p2.lng);
        this.showBlockForm.set(true);
      }
    }
  }

  saveBlock() {
    this.analytics.createBlock(this.newBlockData).subscribe(() => {
      this.showBlockForm.set(false);
      this.setMapMode('default');
      this.initMap(); // Reload map
    });
  }

  onContainerCreated(c: any) {
    this.showRegister.set(false);
    this.initMap();
  }

  private drawBlocks(layout: any) {
    if (!this.map) return;
    this.blocksArr = [];
    layout.features.forEach((f: any) => {
      const coords = f.geometry.coordinates[0].map((c: any) => [c[1], c[0]]);
      const polygon = L.polygon(coords, {
        color: f.properties.stroke,
        fillColor: f.properties.color,
        fillOpacity: 0.3,
        weight: 1.5,
        dashArray: '4',
      })
        .bindTooltip(f.properties.name, { permanent: false, direction: 'center' })
        .addTo(this.map);
      
      this.blocksArr.push({ polygon, props: f.properties });
    });
  }

  private drawContainers(fc: any) {
    if (!this.map) return;
    fc.features.forEach((f: any) => {
      const p = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      this.createMarker(p.container_id, lat, lng, p);
    });
  }

  private createMarker(id: string, lat: number, lng: number, props: any) {
    const isCritical = props.risk_level === 'CRITICAL';
    const marker = L.circleMarker([lat, lng], {
      radius: isCritical ? 10 : 8,
      color: props.color,
      fillColor: props.color,
      fillOpacity: 0.85,
      weight: 2,
    });

    marker.bindTooltip(`
      <b>${props.container_number}</b><br>
      ${props.commodity}<br>
      Risk: <b>${props.risk_level}</b>${props.failure_hours ? `<br>Failure in ~${props.failure_hours}h` : ''}
    `, { direction: 'top', offset: [0, -8] });

    marker.on('click', () => {
      window.location.href = `/containers/${props.container_id}`;
    });

    marker.addTo(this.map);
    this.markers.set(id, { marker, props });
  }

  private updateMarker(msg: any) {
    const entry = this.markers.get(msg.container_id);
    if (!entry) return;
    // Update tooltip with latest temp
    entry.marker.setTooltipContent(`
      <b>${msg.container_number}</b><br>
      Temp: <b>${msg.data.temperature?.toFixed(1)}°C</b><br>
      Risk: ${entry.props.risk_level}
    `);
  }

  private updateMarkerRisk(msg: any) {
    const entry = this.markers.get(msg.container_id);
    if (!entry) return;
    const colors: Record<string, string> = {
      LOW: '#22C55E', MEDIUM: '#EAB308', HIGH: '#F97316', CRITICAL: '#EF4444',
    };
    const color = colors[msg.data.risk_level] || '#6B7280';
    entry.marker.setStyle({ color, fillColor: color });
    entry.props.risk_level = msg.data.risk_level;
  }

  private refreshMapMarkers() {
    // Re-draw after WS live data update
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    this.map?.remove();
  }
}
