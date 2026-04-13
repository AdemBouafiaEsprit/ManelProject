import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../core/api/analytics.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="page">
  <div class="page-header mb-6">
    <h1 class="page-title">System Administration</h1>
    <p class="page-subtitle">Platform configuration and simulation controls</p>
  </div>

  <div class="grid-2">
    <!-- Simulation Controls -->
    <div class="card">
      <div class="card-header"><span class="card-title">🎮 Demonstration Controls</span></div>
      <div class="card-body">
        <p class="text-sm text-muted mb-4">
          Manually trigger system actions for demonstration purposes. Note that the simulator must be running for faults to be fully realistic.
        </p>

        <div class="flex flex-col gap-3">
          <button class="btn btn-primary w-full justify-center" (click)="triggerScoring()" [disabled]="loadingScore">
            {{ loadingScore ? 'Scoring...' : 'Trigger ML Fleet Scoring Now' }}
          </button>
        </div>

        <div class="mt-6">
          <p class="text-xs font-semibold text-muted uppercase mb-2">Simulated Fault Injection</p>
          <div class="error-msg" style="margin-bottom:10px">
            <span style="display:inline-block;margin-right:5px">ℹ️</span> To inject faults, run the simulator CLI directly on the server:<br>
            <code style="display:block;margin-top:6px;background:rgba(0,0,0,0.1);padding:4px;border-radius:4px">python simulator.py --inject-fault MSCU0042 compressor_degradation</code>
          </div>
        </div>
      </div>
    </div>

    <!-- System Health -->
    <div class="card">
      <div class="card-header"><span class="card-title">🖥️ System Health (Simulated)</span></div>
      <div class="card-body">
        <table class="data-table">
          <tbody>
            <tr>
              <td>PostgreSQL (TimescaleDB)</td>
              <td><span class="status-badge active">Online</span></td>
              <td class="text-xs text-muted">Latency: 12ms</td>
            </tr>
            <tr>
              <td>Redis Cache & PubSub</td>
              <td><span class="status-badge active">Online</span></td>
              <td class="text-xs text-muted">Memory: 42MB</td>
            </tr>
            <tr>
              <td>Mosquitto MQTT Broker</td>
              <td><span class="status-badge active">Online</span></td>
              <td class="text-xs text-muted">Msgs/sec: 1.2</td>
            </tr>
            <tr>
              <td>FastAPI Backend</td>
              <td><span class="status-badge active">Online</span></td>
              <td class="text-xs text-muted">Uptime: 4h 12m</td>
            </tr>
            <tr>
              <td>XGBoost Risk Model</td>
              <td><span class="status-badge active">v1.0</span></td>
              <td class="text-xs text-muted">Last trained: 2 days ago</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
  `
})
export class AdminComponent {
  loadingScore = false;

  constructor(private analytics: AnalyticsService, private auth: AuthService) {}

  triggerScoring() {
    this.loadingScore = true;
    this.analytics.triggerScoring().subscribe({
      next: () => {
        alert('All active containers have been scored successfully.');
        this.loadingScore = false;
      },
      error: () => this.loadingScore = false
    });
  }
}
