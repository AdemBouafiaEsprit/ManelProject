import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgApexchartsModule } from 'ng-apexcharts';
import { AnalyticsService } from '../../core/api/analytics.service';
import { KPISummary } from '../../shared/models/models';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  template: `
<div class="page">
  <div class="page-header mb-6">
    <h1 class="page-title">Analytics & Intelligence</h1>
    <p class="page-subtitle">Historical performance and machine learning insights</p>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Active Containers</div>
      <div class="kpi-value">{{ kpi()?.total_active_containers ?? '—' }}</div>
    </div>
    <div class="kpi-card info">
      <div class="kpi-label">Losses Prevented</div>
      <div class="kpi-value">\${{ (kpi()?.losses_prevented_usd ?? 0).toFixed(0) }}</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-label">Avg Risk Score</div>
      <div class="kpi-value">{{ ((kpi()?.avg_risk_score ?? 0) * 100).toFixed(0) }}<span class="text-sm">/100</span></div>
    </div>
  </div>

  <div class="grid-2 mb-6">
    <!-- Alerts over time -->
    <div class="card">
      <div class="card-header"><span class="card-title">Alerts by Severity (30 Days)</span></div>
      <div class="card-body" style="padding-top:0">
        <apx-chart *ngIf="alertsChart"
          [series]="alertsChart.series!" [chart]="alertsChart.chart!"
          [xaxis]="alertsChart.xaxis!" [colors]="alertsChart.colors!"
          [dataLabels]="alertsChart.dataLabels!" [plotOptions]="alertsChart.plotOptions!">
        </apx-chart>
        <div *ngIf="!alertsChart" class="skeleton chart-container"></div>
      </div>
    </div>

    <!-- Risk dist -->
    <div class="card">
      <div class="card-header"><span class="card-title">Current Risk Distribution</span></div>
      <div class="card-body flex items-center justify-center">
        <apx-chart *ngIf="riskChart"
          [series]="riskChart.series!" [chart]="riskChart.chart!"
          [labels]="riskChart.labels!" [colors]="riskChart.colors!"
          [plotOptions]="riskChart.plotOptions!">
        </apx-chart>
        <div *ngIf="!riskChart" class="skeleton chart-container" style="border-radius:50%;width:250px;height:250px"></div>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <!-- Top problematic -->
    <div class="card">
      <div class="card-header"><span class="card-title">Top Problematic Containers (7 Days)</span></div>
      <div class="card-body" style="padding:0">
        <table class="data-table">
          <thead><tr><th>Container</th><th>Commodity</th><th>Alerts</th></tr></thead>
          <tbody>
            <tr *ngFor="let c of topContainers()">
              <td><code style="color:#003B72;font-weight:600">{{ c.container_number }}</code></td>
              <td>{{ c.commodity }}</td>
              <td><span style="font-weight:700;color:#DC2626">{{ c.alert_count }}</span></td>
            </tr>
            <tr *ngIf="topContainers().length===0"><td colspan="3" class="text-center text-muted p-4">No data</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Commodity Performance -->
    <div class="card">
      <div class="card-header"><span class="card-title">Commodity Risk Profile</span></div>
      <div class="card-body" style="padding:0">
        <table class="data-table">
          <thead><tr><th>Commodity</th><th>Avg Risk</th><th>Incidents</th></tr></thead>
          <tbody>
            <tr *ngFor="let c of commodityData()">
              <td>{{ c.commodity }}</td>
              <td>
                <span class="risk-badge" [class.HIGH]="c.avg_risk_score > 0.5" [class.LOW]="c.avg_risk_score <= 0.2">
                  {{ (c.avg_risk_score * 100).toFixed(0) }}
                </span>
              </td>
              <td>{{ c.incidents }}</td>
            </tr>
            <tr *ngIf="commodityData().length===0"><td colspan="3" class="text-center text-muted p-4">No data</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
  `
})
export class AnalyticsComponent implements OnInit {
  kpi = signal<KPISummary | null>(null);
  topContainers = signal<any[]>([]);
  commodityData = signal<any[]>([]);

  alertsChart: any = null;
  riskChart: any = null;

  constructor(private analytics: AnalyticsService) {}

  ngOnInit() {
    this.analytics.getSummary().subscribe(k => this.kpi.set(k));
    this.analytics.getTopProblematic().subscribe(d => this.topContainers.set(d));
    this.analytics.getCommodityPerformance().subscribe(d => this.commodityData.set(d));

    this.analytics.getAlertsOverTime(30).subscribe(data => {
      this.alertsChart = {
        series: data.series,
        chart: { type: 'bar', height: 300, stacked: true, toolbar: { show: false } },
        colors: ['#3B82F6', '#F59E0B', '#EF4444'],
        plotOptions: { bar: { horizontal: false, columnWidth: '60%' } },
        xaxis: { categories: data.categories, type: 'category' },
        dataLabels: { enabled: false },
      };
    });

    this.analytics.getRiskDistribution().subscribe(data => {
      this.riskChart = {
        series: data.series,
        chart: { type: 'donut', height: 280 },
        labels: data.labels,
        colors: ['#22C55E', '#EAB308', '#F97316', '#EF4444'],
        plotOptions: {
          pie: { donut: { size: '65%', labels: { show: true, name: {show:true}, value:{show:true} } } }
        }
      };
    });
  }
}
