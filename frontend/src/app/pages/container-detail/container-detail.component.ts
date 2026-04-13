import { Component, OnInit, OnDestroy, signal, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule, RouterLink, NgApexchartsModule],
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
      <div class="gauge-label">💧 Humidity</div>
      <div class="gauge-value">{{ latestReading()?.humidity?.toFixed(0) ?? '—' }}</div>
      <div class="gauge-unit">%RH (target: {{ container()!.target_humidity }}%)</div>
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
      <div class="gauge-unit">{{ latestReading()?.vibration_level?.toFixed(1) ?? '—' }} vibration</div>
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
