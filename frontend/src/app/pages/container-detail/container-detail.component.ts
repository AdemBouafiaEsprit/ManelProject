import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { Subscription } from 'rxjs';
import { ContainerService } from '../../core/api/container.service';
import { AlertService } from '../../core/api/alert.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { WebSocketService } from '../../core/websocket/websocket.service';
import { Container, SensorReading, RiskScore, Alert } from '../../shared/models/models';

@Component({
  selector: 'app-container-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, NgApexchartsModule, FormsModule],
  template: `
<div class="page" *ngIf="container(); else loadingTpl">

  <!-- Header -->
  <div class="detail-header mb-6">
    <a routerLink="/containers" class="back-link">← Back to Fleet</a>
    <div class="flex items-center justify-between" style="margin-top:12px">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="page-title">{{ container()!.container_number }}</h1>
          <span class="status-badge {{ container()!.status }}">{{ container()!.status.toUpperCase() }}</span>
          <span class="risk-badge {{ latestRisk()?.risk_level ?? 'LOW' }}">
            {{ latestRisk()?.risk_level ?? 'LOW' }} RISK
          </span>
        </div>
        <p class="page-subtitle">
          {{ container()!.commodity }} · Block {{ container()!.block }},
          Row {{ container()!.row_num }}, Bay {{ container()!.bay }} · {{ container()!.ecp_id }}
        </p>
      </div>
      <div class="header-actions">
        <button class="btn-report-incident" (click)="showReportModal.set(true)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Report Incident
        </button>
        <div class="temp-banner" [class]="getTempClass()">
          <div class="tb-current">{{ latestReading()?.temperature?.toFixed(2) ?? '—' }}°C</div>
          <div class="tb-label">Setpoint: {{ container()!.target_temp }}°C ±{{ container()!.tolerance }}°C</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Live Gauges -->
  <div class="gauges-grid mb-6">
    <div class="gauge-card">
      <div class="gauge-label">🌡️ Temperature</div>
      <div class="gauge-value" [class]="getTempClass()">
        {{ latestReading()?.temperature?.toFixed(1) ?? '—' }}
      </div>
      <div class="gauge-unit">°C (set: {{ container()!.target_temp }}°C)</div>
    </div>
    <div class="gauge-card">
      <div class="gauge-label">⚡ Power Consumption</div>
      <div class="gauge-value">{{ latestReading()?.power_consumption?.toFixed(2) ?? '—' }}</div>
      <div class="gauge-unit">kWh</div>
    </div>
    <div class="gauge-card">
      <div class="gauge-label">🔌 Supply Voltage</div>
      <div class="gauge-value" [class.danger-val]="(latestReading()?.supply_voltage ?? 230) < 200">
        {{ latestReading()?.supply_voltage?.toFixed(0) ?? '—' }}
      </div>
      <div class="gauge-unit">Volts</div>
    </div>
    <div class="gauge-card">
      <div class="gauge-label">🚪 Door Status</div>
      <div class="gauge-value" [class.danger-val]="latestReading()?.door_status">
        {{ latestReading()?.door_status ? 'OPEN' : 'CLOSED' }}
      </div>
      <div class="gauge-unit">{{ latestReading()?.door_status ? '⚠️ Check door!' : '✅ Secured' }}</div>
    </div>
    <div class="gauge-card">
      <div class="gauge-label">❄️ Compressor</div>
      <div class="gauge-value" [class.danger-val]="latestReading()?.compressor_status === false">
        {{ latestReading()?.compressor_status !== false ? 'RUNNING' : 'FAULT' }}
      </div>
      <div class="gauge-unit">{{ latestReading()?.compressor_status !== false ? '✅ Operating' : '🔴 Check unit' }}</div>
    </div>
    <div class="gauge-card" [class.gauge-shock]="isCriticalVibration()" [class.gauge-warn]="isHighVibration()">
      <div class="gauge-label">📳 Vibration</div>
      <div class="gauge-value" [class.danger-val]="isCriticalVibration()" [class.warn-val]="isHighVibration()">
        {{ latestReading()?.vibration_level?.toFixed(2) ?? '—' }}
      </div>
      <div class="gauge-unit">{{ getVibrationStatus() }}</div>
    </div>
  </div>

  <!-- Temperature History Chart -->
  <div class="card mb-6">
    <div class="card-header">
      <span class="card-title">📈 Temperature History</span>
      <div class="flex gap-2">
        <button *ngFor="let h of [1,6,24,72]" class="btn btn-ghost btn-sm"
          [class.active-btn]="chartHours() === h" (click)="loadChart(h)">
          {{ h }}h
        </button>
      </div>
    </div>
    <div class="card-body" style="padding-top:0">
      <apx-chart *ngIf="chartOptions" [series]="chartOptions.series!"
        [chart]="chartOptions.chart!" [xaxis]="chartOptions.xaxis!"
        [yaxis]="chartOptions.yaxis!" [stroke]="chartOptions.stroke!"
        [fill]="chartOptions.fill!" [annotations]="chartOptions.annotations!"
        [tooltip]="chartOptions.tooltip!" [colors]="chartOptions.colors!"
        [legend]="chartOptions.legend!" [grid]="chartOptions.grid!">
      </apx-chart>
      <div *ngIf="!chartOptions" class="skeleton" style="height:280px;border-radius:8px"></div>
    </div>
  </div>

  <!-- ML Risk Panel + Alert History -->
  <div class="grid-2">
    <!-- ML Panel -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">🧠 ML Risk Score</span>
        <span class="text-xs text-muted">{{ latestRisk()?.model_version }}</span>
      </div>
      <div class="card-body" *ngIf="latestRisk(); else noRisk">
        <div class="risk-score-display">
          <div class="risk-circle" [class]="'rc-' + (latestRisk()?.risk_level ?? 'LOW').toLowerCase()">
            <div class="rc-value">{{ ((latestRisk()!.risk_score ?? 0) * 100).toFixed(0) }}</div>
            <div class="rc-max">/100</div>
          </div>
          <div class="risk-meta">
            <div class="risk-badge {{ latestRisk()!.risk_level }}" style="font-size:14px;padding:4px 14px">
              {{ latestRisk()!.risk_level }}
            </div>
            <div *ngIf="latestRisk()!.predicted_failure_in_hours" class="failure-est">
              ⏱ Predicted failure in <b>{{ latestRisk()!.predicted_failure_in_hours?.toFixed(1) }}h</b>
            </div>
          </div>
        </div>

        <!-- Top Factors -->
        <div class="factors-list" *ngIf="latestRisk()!.top_factors?.length">
          <p class="factors-title">Top Contributing Factors</p>
          <div *ngFor="let f of latestRisk()!.top_factors" class="factor-row">
            <span class="factor-name">{{ f.factor }}</span>
            <div class="factor-bar-wrap">
              <div class="factor-bar" [style.width]="getFactorWidth(f.value)"></div>
            </div>
            <span class="factor-val">{{ f.value }}</span>
          </div>
        </div>

        <!-- Forecast -->
        <div *ngIf="latestRisk()!.forecast_temperatures?.length" class="forecast-section">
          <p class="factors-title">6-Hour Temperature Forecast</p>
          <apx-chart *ngIf="forecastOptions" [series]="forecastOptions.series!"
            [chart]="forecastOptions.chart!" [xaxis]="forecastOptions.xaxis!"
            [yaxis]="forecastOptions.yaxis!" [stroke]="forecastOptions.stroke!"
            [colors]="forecastOptions.colors!" [grid]="forecastOptions.grid!">
          </apx-chart>
        </div>
      </div>
      <ng-template #noRisk>
        <div class="card-body empty-state">No risk score available yet</div>
      </ng-template>
    </div>

    <!-- Alert History -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">🔔 Alert History</span>
        <span class="text-xs text-muted">{{ containerAlerts().length }} alerts</span>
      </div>
      <div class="alert-history-list">
        <div *ngFor="let a of containerAlerts()" class="ah-item">
          <div class="ah-row1">
            <span class="severity-badge {{ a.severity }}">{{ a.severity }}</span>
            <span class="text-xs text-muted">{{ a.triggered_at | date:'dd/MM HH:mm' }}</span>
            <span *ngIf="!a.is_active" class="resolved-badge">Resolved</span>
          </div>
          <div class="ah-type text-xs">{{ a.alert_type }}</div>
          <div class="ah-msg text-sm">{{ a.message }}</div>
          <div class="ah-action text-xs text-muted" *ngIf="a.recommended_action">
            💡 {{ a.recommended_action }}
          </div>
          <div class="ah-actions" *ngIf="a.is_active">
            <button class="btn btn-ghost btn-sm" (click)="ackAlert(a)" *ngIf="!a.acknowledged_at">
              Acknowledge
            </button>
            <button class="btn btn-ghost btn-sm" (click)="resolveAlert(a)">Resolve</button>
          </div>
        </div>
        <div *ngIf="containerAlerts().length === 0" class="empty-state">No alerts for this container</div>
      </div>
    </div>
  </div>
  <!-- Report Incident Modal -->
  <div class="modal-overlay" *ngIf="showReportModal()" (click)="showReportModal.set(false)">
    <div class="modal-card" (click)="$event.stopPropagation()">
      <div class="modal-header">
        <h3 class="modal-title">⚠️ Report Physical Incident</h3>
        <button class="btn-close-modal" (click)="showReportModal.set(false)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <p class="modal-desc">
          Report a physical accident on <strong>{{ container()!.container_number }}</strong> —
          collision with a truck, crane, forklift, or another container.
        </p>
        <div class="modal-form-group">
          <label>Description</label>
          <textarea [(ngModel)]="incidentDescription" name="incident"
            placeholder="Describe what happened (e.g. forklift hit the left side, dropped by crane...)"
            rows="4"></textarea>
        </div>
        <div class="modal-error" *ngIf="reportError()">{{ reportError() }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" (click)="showReportModal.set(false)" [disabled]="reporting()">Cancel</button>
        <button class="btn btn-danger" (click)="submitIncident()"
          [disabled]="reporting() || !incidentDescription.trim()">
          {{ reporting() ? 'Reporting...' : 'Report Incident' }}
        </button>
      </div>
    </div>
  </div>
</div>

<ng-template #loadingTpl>
  <div class="page">
    <div class="skeleton" style="height:100px;margin-bottom:16px;border-radius:12px"></div>
    <div class="skeleton" style="height:200px;margin-bottom:16px;border-radius:12px"></div>
    <div class="skeleton" style="height:350px;border-radius:12px"></div>
  </div>
</ng-template>
  `,
  styles: [`
    .back-link { font-size: 13px; color: #64748B; text-decoration: none;
      &:hover { color: #003B72; } }
    .header-actions { display: flex; align-items: center; gap: 12px; }

    .btn-report-incident {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 9px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
      border: 1.5px solid #FCA5A5; background: #FFF5F5; color: #DC2626; cursor: pointer;
      transition: all 0.15s;
      &:hover { background: #FEE2E2; border-color: #EF4444; }
    }
    .warn-val { color: #B45309 !important; font-weight: 700; }
    .gauge-warn { background: rgba(245,158,11,0.06) !important; border-color: rgba(245,158,11,0.3) !important; }
    .gauge-shock { background: rgba(239,68,68,0.06) !important; border-color: rgba(239,68,68,0.3) !important;
      animation: badge-pulse 2s infinite; }

    /* Report Incident Modal */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(15,23,42,0.5);
      backdrop-filter: blur(4px); z-index: 1100;
      display: flex; align-items: center; justify-content: center;
    }
    .modal-card {
      background: white; border-radius: 16px; width: 100%; max-width: 480px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.2);
      animation: slideUp 0.2s ease-out;
    }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .modal-header {
      padding: 20px 24px 16px; border-bottom: 1px solid #F1F5F9;
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-title { font-size: 17px; font-weight: 700; color: #0F172A; }
    .btn-close-modal { background: none; border: none; color: #94A3B8; cursor: pointer;
      &:hover { color: #374151; } }
    .modal-body { padding: 20px 24px; }
    .modal-desc { font-size: 13px; color: #64748B; margin-bottom: 16px; line-height: 1.5; }
    .modal-form-group label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    .modal-form-group textarea {
      width: 100%; padding: 10px 12px; border: 1.5px solid #E2E8F0; border-radius: 8px;
      font-size: 14px; outline: none; resize: vertical; font-family: inherit;
      &:focus { border-color: #003B72; }
    }
    .modal-error { margin-top: 10px; background: #FEF2F2; color: #DC2626;
      padding: 10px 12px; border-radius: 8px; font-size: 13px; }
    .modal-footer {
      padding: 16px 24px; border-top: 1px solid #F1F5F9; background: #F8FAFC;
      border-radius: 0 0 16px 16px; display: flex; gap: 10px; justify-content: flex-end;
    }
    .btn-danger {
      padding: 9px 20px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600;
      background: #EF4444; color: white; cursor: pointer; transition: background 0.15s;
      &:hover:not(:disabled) { background: #DC2626; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .temp-banner {
      text-align: center; padding: 12px 20px; border-radius: 12px;
      background: rgba(34,197,94,0.08); border: 1.5px solid rgba(34,197,94,0.2);
      &.warn { background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.2); }
      &.crit { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); }
    }
    .tb-current { font-size: 28px; font-weight: 700; color: #22C55E;
      .warn & { color: #B45309; } .crit & { color: #DC2626; } }
    .tb-label { font-size: 11px; color: #64748B; }
    .danger-val { color: #EF4444 !important; font-weight: 700; }
    .active-btn { background: #003B72 !important; color: white !important; }

    /* Risk panel */
    .risk-score-display { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
    .risk-circle {
      width: 90px; height: 90px; border-radius: 50%; display: flex; flex-direction: column;
      align-items: center; justify-content: center; flex-shrink: 0;
      border: 4px solid #22C55E; background: rgba(34,197,94,0.08);
      &.rc-medium { border-color: #EAB308; background: rgba(234,179,8,0.08); }
      &.rc-high   { border-color: #F97316; background: rgba(249,115,22,0.08); }
      &.rc-critical { border-color: #EF4444; background: rgba(239,68,68,0.08);
        animation: badge-pulse 2s infinite; }
    }
    .rc-value { font-size: 26px; font-weight: 800; color: #0F172A; line-height: 1; }
    .rc-max   { font-size: 11px; color: #9CA3AF; }
    .risk-meta { display: flex; flex-direction: column; gap: 8px; }
    .failure-est { font-size: 13px; color: #EF4444; }

    .factors-title { font-size: 12px; font-weight: 600; color: #9CA3AF;
      text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
    .factors-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .factor-row { display: flex; align-items: center; gap: 10px; }
    .factor-name { font-size: 12px; width: 180px; color: #374151; }
    .factor-bar-wrap { flex: 1; height: 6px; background: #F1F5F9; border-radius: 3px; }
    .factor-bar { height: 100%; background: #003B72; border-radius: 3px; transition: width 0.5s; }
    .factor-val { font-size: 11px; color: #9CA3AF; width: 50px; text-align: right; }
    .forecast-section { margin-top: 12px; }

    /* Alert history */
    .alert-history-list { max-height: 500px; overflow-y: auto; }
    .ah-item {
      padding: 12px 16px; border-bottom: 1px solid #F1F5F9;
      display: flex; flex-direction: column; gap: 4px;
    }
    .ah-row1 { display: flex; align-items: center; gap: 8px; }
    .ah-type { color: #64748B; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .ah-msg  { color: #374151; line-height: 1.4; }
    .ah-action { line-height: 1.4; margin-top: 2px; }
    .ah-actions { display: flex; gap: 6px; margin-top: 6px; }
    .resolved-badge {
      font-size: 11px; background: rgba(100,116,139,0.1); color: #475569;
      padding: 1px 8px; border-radius: 99px;
    }
  `]
})
export class ContainerDetailComponent implements OnInit, OnDestroy {
  container = signal<Container | null>(null);
  latestReading = signal<SensorReading | null>(null);
  latestRisk = signal<RiskScore | null>(null);
  containerAlerts = signal<Alert[]>([]);
  chartHours = signal(24);
  chartOptions: any = null;
  forecastOptions: any = null;

  showReportModal = signal(false);
  reporting = signal(false);
  reportError = signal<string | null>(null);
  incidentDescription = '';

  private id!: string;
  private subs: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private containerService: ContainerService,
    private alertService: AlertService,
    private analytics: AnalyticsService,
    private ws: WebSocketService
  ) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.loadAll();

    this.subs.push(
      this.ws.messages$.subscribe((msg) => {
        if (msg.container_id === this.id && msg.type === 'sensor_update') {
          this.latestReading.set({ ...msg.data, container_id: this.id });
        }
        if (msg.container_id === this.id && msg.type === 'risk_update') {
          this.loadRisk();
        }
      })
    );
  }

  private loadAll() {
    this.containerService.getById(this.id).subscribe((c) => {
      this.container.set(c);
      this.latestReading.set(c.latest_reading ?? null);
      this.latestRisk.set(c.latest_risk ?? null);
      if (c.latest_risk?.forecast_temperatures?.length) this.buildForecastChart(c.latest_risk);
    });
    this.loadChart(24);
    this.loadRisk();
    this.alertService.getAll({ is_active: undefined }).subscribe((all) => {
      this.containerAlerts.set(all.filter((a) => a.container_id === this.id));
    });
  }

  private loadRisk() {
    this.containerService.getRisk(this.id).subscribe({
      next: (r) => {
        this.latestRisk.set(r);
        if (r.forecast_temperatures?.length) this.buildForecastChart(r);
      },
      error: () => {},
    });
  }

  loadChart(hours: number) {
    this.chartHours.set(hours);
    this.chartOptions = null;
    this.analytics.getSensorChart(this.id, hours).subscribe((data) => {
      const target = this.container()?.target_temp ?? 0;
      const tol = this.container()?.tolerance ?? 2;
      this.chartOptions = {
        series: [
          { name: 'Temperature', type: 'area', data: data.temperature.map((v: number, i: number) => ({ x: data.timestamps[i], y: v })) },
          { name: 'Setpoint', type: 'line', data: data.timestamps.map((t: string) => ({ x: t, y: target })) },
          { name: 'Upper Limit', type: 'line', data: data.timestamps.map((t: string) => ({ x: t, y: target + tol * 1.5 })) },
          { name: 'Lower Limit', type: 'line', data: data.timestamps.map((t: string) => ({ x: t, y: target - tol * 1.5 })) },
        ],
        chart: { type: 'line', height: 300, toolbar: { show: true }, zoom: { enabled: true } },
        colors: ['#003B72', '#00A651', '#F59E0B', '#F59E0B'],
        stroke: { curve: 'smooth', width: [2, 2, 1, 1], dashArray: [0, 4, 4, 4] },
        fill: { type: ['gradient', 'solid', 'solid', 'solid'], gradient: { shadeIntensity: 0.3, opacityFrom: 0.3, opacityTo: 0.02 } },
        xaxis: { type: 'datetime', labels: { datetimeFormatter: { hour: 'HH:mm' } } },
        yaxis: { title: { text: '°C' }, decimalsInFloat: 1 },
        tooltip: { x: { format: 'dd/MM HH:mm:ss' } },
        grid: { borderColor: '#F1F5F9' },
        legend: { position: 'top' },
        annotations: {},
      };
    });
  }

  private buildForecastChart(risk: RiskScore) {
    const temps = risk.forecast_temperatures!;
    const labels = temps.map((_, i) => `+${(i + 1) * 0.5}h`);
    this.forecastOptions = {
      series: [{ name: 'Forecast Temp', data: temps }],
      chart: { type: 'line', height: 160, sparkline: { enabled: false }, toolbar: { show: false } },
      colors: ['#EF4444'],
      stroke: { curve: 'smooth', width: 2, dashArray: 5 },
      xaxis: { categories: labels, labels: { style: { fontSize: '10px' } } },
      yaxis: { decimalsInFloat: 1, labels: { style: { fontSize: '10px' } } },
      grid: { borderColor: '#F8FAFC' },
    };
  }

  getFactorWidth(value: number): string {
    const max = 5;
    return Math.min(100, (Math.abs(value) / max) * 100).toFixed(0) + '%';
  }

  getTempClass(): string {
    const c = this.container();
    const r = this.latestReading();
    if (!c || !r?.temperature) return '';
    const dev = Math.abs(r.temperature - c.target_temp);
    if (dev > c.tolerance * 3) return 'crit';
    if (dev > c.tolerance * 1.5) return 'warn';
    return '';
  }

  isHighVibration(): boolean {
    const v = this.latestReading()?.vibration_level;
    return v != null && v >= 3.5 && v < 7.0;
  }

  isCriticalVibration(): boolean {
    const v = this.latestReading()?.vibration_level;
    return v != null && v >= 7.0;
  }

  getVibrationStatus(): string {
    const v = this.latestReading()?.vibration_level;
    if (v == null) return 'No data';
    if (v >= 7.0) return '🚨 Critical shock!';
    if (v >= 3.5) return '⚠️ Elevated — check';
    return '✅ Normal';
  }

  submitIncident() {
    if (!this.incidentDescription.trim()) return;
    this.reporting.set(true);
    this.reportError.set(null);
    this.containerService.reportIncident(this.id, this.incidentDescription).subscribe({
      next: (alert) => {
        this.reporting.set(false);
        this.showReportModal.set(false);
        this.incidentDescription = '';
        this.containerAlerts.update(prev => [alert, ...prev]);
      },
      error: (err) => {
        this.reporting.set(false);
        this.reportError.set(err.error?.detail || 'Failed to report incident.');
      },
    });
  }

  ackAlert(a: Alert) {
    this.alertService.acknowledge(a.id).subscribe(() => this.loadAll());
  }

  resolveAlert(a: Alert) {
    this.alertService.resolve(a.id).subscribe(() => this.loadAll());
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }
}
