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
        <div class="map-controls" (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()">
          <button class="m-btn" [class.active]="mapMode() === 'default'"
            (click)="setMapMode('default')" title="Pan & Zoom">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2C8 2 4 5.5 4 10c0 6 8 12 8 12s8-6 8-12c0-4.5-4-8-8-8z"/>
              <circle cx="12" cy="10" r="2.5"/>
            </svg>
          </button>
          <button class="m-btn" [class.active]="mapMode() === 'add_block'"
            (click)="setMapMode('add_block')" title="Draw New Bloc">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="3 6 12 3 21 6 21 18 12 21 3 18"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </button>
          <button class="m-btn" [class.active]="mapMode() === 'add_container'"
            (click)="setMapMode('add_container')" title="Place Container">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M12 11v6M9 14h6"/>
            </svg>
          </button>
          <div class="m-sep"></div>
          <button class="m-btn" [class.active]="showBlockMgmt()"
            (click)="toggleBlockMgmt()" title="Manage Blocks">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button class="m-btn" (click)="toggleFullscreen()" title="Toggle Fullscreen">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 15v6h-6M3 9V3h6"/>
            </svg>
          </button>
        </div>

        <!-- Mode Toast -->
        <div class="mode-toast" *ngIf="mapMode() !== 'default'">
          <span class="pulse-dot"></span>
          <span *ngIf="mapMode() === 'add_block'">Draw a polygon on the map to define the bloc area</span>
          <span *ngIf="mapMode() === 'add_container'">Click inside a bloc to place a container</span>
          <button class="btn-cancel" (click)="setMapMode('default')">✕ Cancel</button>
        </div>

        <!-- Bloc Naming Form (appears after drawing) -->
        <div class="bloc-form-overlay" *ngIf="showBlockForm()" (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()">
          <div class="bloc-form-card">
            <div class="bloc-form-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2">
                <polygon points="3 6 12 3 21 6 21 18 12 21 3 18"/>
              </svg>
              <h3>Name Your Bloc</h3>
            </div>
            <div class="bloc-form-body">
              <div class="field-group">
                <label>Bloc ID</label>
                <input type="text" class="form-input" [(ngModel)]="newBlockData.block_id"
                  placeholder="e.g. D" maxlength="4" />
              </div>
              <div class="field-group">
                <label>Bloc Name</label>
                <input type="text" class="form-input" [(ngModel)]="newBlockData.name"
                  placeholder="e.g. Reefer West Zone" />
              </div>
            </div>
            <div class="bloc-form-actions">
              <button class="btn btn-ghost btn-sm" (click)="cancelBlockForm()">Cancel</button>
              <button class="btn btn-primary btn-sm" (click)="saveBlock()"
                [disabled]="!newBlockData.block_id || !newBlockData.name">
                Save Bloc
              </button>
            </div>
          </div>
        </div>

        <!-- Block Management Panel -->
        <div class="block-mgmt-panel" *ngIf="showBlockMgmt()"
          (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()">
          <div class="bmp-header">
            <span class="bmp-title">Block Management</span>
            <button class="bmp-close" (click)="showBlockMgmt.set(false)">✕</button>
          </div>
          <div class="bmp-list">
            <div *ngFor="let b of blockList()" class="bmp-item">
              <div class="bmp-color-dot" [style.background]="b.color" [style.border-color]="b.stroke"></div>
              <div class="bmp-info">
                <span class="bmp-id">{{ b.block_id }}</span>
                <span class="bmp-name">{{ b.name }}</span>
                <span class="bmp-dims">{{ b.rows }}r × {{ b.bays }}b × {{ b.tiers }}t &nbsp;|&nbsp; {{ b.rotation || 0 }}°</span>
              </div>
              <div class="bmp-btns">
                <button class="bmp-btn edit-btn" (click)="openEditBlock(b)" title="Edit">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </button>
                <button class="bmp-btn del-btn" (click)="confirmDeleteBlock(b)" title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            </div>
            <div *ngIf="blockList().length === 0" class="bmp-empty">No blocks found</div>
          </div>
        </div>

        <!-- Edit Block Modal -->
        <div class="edit-block-overlay" *ngIf="showEditBlock()"
          (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()">
          <div class="edit-block-card">
            <div class="edit-block-header">
              <h3>Edit Block {{ editingBlock()?.block_id }}</h3>
              <button class="bmp-close" (click)="showEditBlock.set(false)">✕</button>
            </div>
            <div class="edit-block-body">
              <div class="field-group">
                <label>Block Name</label>
                <input type="text" class="form-input" [(ngModel)]="editBlockForm.name" />
              </div>
              <div class="edit-row-3">
                <div class="field-group">
                  <label>Rows</label>
                  <input type="number" class="form-input" [(ngModel)]="editBlockForm.rows" min="1" />
                </div>
                <div class="field-group">
                  <label>Bays</label>
                  <input type="number" class="form-input" [(ngModel)]="editBlockForm.bays" min="1" />
                </div>
                <div class="field-group">
                  <label>Tiers</label>
                  <input type="number" class="form-input" [(ngModel)]="editBlockForm.tiers" min="1" />
                </div>
              </div>
              <div class="edit-row-2">
                <div class="field-group">
                  <label>Fill Color</label>
                  <input type="color" [(ngModel)]="editBlockForm.color" class="color-input" />
                </div>
                <div class="field-group">
                  <label>Border Color</label>
                  <input type="color" [(ngModel)]="editBlockForm.stroke" class="color-input" />
                </div>
              </div>
              <div class="edit-section-title">Position</div>
              <div class="edit-row-2">
                <div class="field-group">
                  <label>Lat Min</label>
                  <input type="number" class="form-input" [(ngModel)]="editBlockForm.lat_min" step="0.0001" />
                </div>
                <div class="field-group">
                  <label>Lat Max</label>
                  <input type="number" class="form-input" [(ngModel)]="editBlockForm.lat_max" step="0.0001" />
                </div>
              </div>
              <div class="edit-row-2">
                <div class="field-group">
                  <label>Lng Min</label>
                  <input type="number" class="form-input" [(ngModel)]="editBlockForm.lng_min" step="0.0001" />
                </div>
                <div class="field-group">
                  <label>Lng Max</label>
                  <input type="number" class="form-input" [(ngModel)]="editBlockForm.lng_max" step="0.0001" />
                </div>
              </div>
              <div class="field-group">
                <label>Rotation — {{ editBlockForm.rotation }}°</label>
                <input type="range" [(ngModel)]="editBlockForm.rotation"
                  min="0" max="359" step="1" class="rotation-slider" />
              </div>
            </div>
            <div class="edit-block-footer">
              <button class="btn btn-ghost btn-sm" (click)="showEditBlock.set(false)">Cancel</button>
              <button class="btn btn-primary btn-sm" (click)="saveEditBlock()" [disabled]="savingBlock()">
                {{ savingBlock() ? 'Saving…' : 'Save Changes' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Delete Confirmation Modal -->
        <div class="edit-block-overlay" *ngIf="showDeleteConfirm()"
          (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()">
          <div class="edit-block-card delete-card">
            <div class="edit-block-header">
              <h3>Delete Block {{ deletingBlock()?.block_id }}?</h3>
              <button class="bmp-close" (click)="showDeleteConfirm.set(false); blockDeleteError.set('')">✕</button>
            </div>
            <div class="edit-block-body">
              <p class="delete-warning">
                This will permanently remove <strong>{{ deletingBlock()?.name }}</strong>.
                All containers in this block must be reassigned first.
              </p>
              <div *ngIf="blockDeleteError()" class="bmp-error">{{ blockDeleteError() }}</div>
            </div>
            <div class="edit-block-footer">
              <button class="btn btn-ghost btn-sm" (click)="showDeleteConfirm.set(false); blockDeleteError.set('')">Cancel</button>
              <button class="btn btn-danger btn-sm" (click)="executeDeleteBlock()" [disabled]="deletingBlockLoading()">
                {{ deletingBlockLoading() ? 'Deleting…' : 'Delete Block' }}
              </button>
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
          <div *ngFor="let c of criticalContainers()" class="critical-item"
            [routerLink]="['/containers', c.container_id]">
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
          <div *ngFor="let a of recentAlerts()" class="alert-item"
            [class]="'sev-' + a.severity.toLowerCase()">
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
    .map-card { display: flex; flex-direction: column; overflow: hidden; padding: 0 !important; }
    .port-map { flex: 1; min-height: 400px; position: relative; }
    .live-panel { display: flex; flex-direction: column; gap: 16px; overflow: hidden; }

    /* Map controls — positioned over the satellite map */
    .map-controls {
      position: absolute; top: 12px; right: 12px; z-index: 1000;
      display: flex; flex-direction: column; gap: 4px;
      background: rgba(15,23,42,0.85); border-radius: 10px;
      padding: 6px; backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .m-btn {
      width: 36px; height: 36px; border-radius: 7px; border: none;
      background: transparent; color: rgba(255,255,255,0.7); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
      &:hover { background: rgba(255,255,255,0.12); color: #fff; }
      &.active { background: #3B82F6; color: #fff; }
    }
    .m-sep { height: 1px; background: rgba(255,255,255,0.1); margin: 2px 0; }

    /* Mode toast */
    .mode-toast {
      position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
      z-index: 1000; background: rgba(15,23,42,0.92); color: #fff;
      padding: 10px 18px; border-radius: 99px; font-size: 13px; font-weight: 500;
      display: flex; align-items: center; gap: 10px;
      border: 1px solid rgba(59,130,246,0.4); backdrop-filter: blur(8px);
      white-space: nowrap;
    }
    .pulse-dot {
      width: 8px; height: 8px; background: #3B82F6; border-radius: 50%;
      animation: pulse 1.2s infinite; flex-shrink: 0;
    }
    .btn-cancel {
      background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4);
      color: #FCA5A5; border-radius: 99px; padding: 3px 12px; font-size: 12px;
      cursor: pointer; transition: all 0.15s;
      &:hover { background: rgba(239,68,68,0.35); }
    }

    /* Bloc naming form */
    .bloc-form-overlay {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 1100;
    }
    .bloc-form-card {
      background: #0F172A; border: 1px solid rgba(59,130,246,0.3);
      border-radius: 14px; padding: 0; width: 300px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.6); overflow: hidden;
    }
    .bloc-form-header {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 20px 12px; border-bottom: 1px solid rgba(255,255,255,0.07);
      h3 { color: #F1F5F9; font-size: 14px; font-weight: 700; margin: 0; }
    }
    .bloc-form-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
    .field-group {
      display: flex; flex-direction: column; gap: 5px;
      label { color: #94A3B8; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
    }
    .form-input {
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 7px; padding: 8px 12px; color: #F1F5F9; font-size: 13px;
      outline: none; transition: border-color 0.15s;
      &:focus { border-color: #3B82F6; }
      &::placeholder { color: rgba(255,255,255,0.25); }
    }
    .bloc-form-actions {
      display: flex; gap: 8px; padding: 12px 20px 16px;
      button { flex: 1; }
    }

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

    /* Fullscreen map */
    .port-map.fullscreen {
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      z-index: 2000; border-radius: 0;
    }

    /* Block management panel */
    .block-mgmt-panel {
      position: absolute; top: 12px; left: 12px; z-index: 1100;
      background: rgba(15,23,42,0.92); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; width: 280px; max-height: calc(100% - 24px);
      display: flex; flex-direction: column; overflow: hidden;
      backdrop-filter: blur(10px);
    }
    .bmp-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .bmp-title { color: #F1F5F9; font-size: 13px; font-weight: 700; }
    .bmp-close {
      background: none; border: none; color: rgba(255,255,255,0.4);
      cursor: pointer; font-size: 15px; line-height: 1;
      &:hover { color: #fff; }
    }
    .bmp-list { overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
    .bmp-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.06);
      transition: background 0.12s;
      &:hover { background: rgba(255,255,255,0.05); }
    }
    .bmp-color-dot {
      width: 14px; height: 14px; border-radius: 4px; flex-shrink: 0;
      border: 2px solid;
    }
    .bmp-info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .bmp-id { color: #93C5FD; font-size: 11px; font-weight: 700; font-family: monospace; }
    .bmp-name { color: #E2E8F0; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bmp-dims { color: #64748B; font-size: 10px; }
    .bmp-btns { display: flex; gap: 4px; }
    .bmp-btn {
      width: 26px; height: 26px; border-radius: 6px; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; transition: all 0.12s;
    }
    .edit-btn { background: rgba(59,130,246,0.15); color: #60A5FA; &:hover { background: rgba(59,130,246,0.3); } }
    .del-btn  { background: rgba(239,68,68,0.15); color: #F87171; &:hover { background: rgba(239,68,68,0.3); } }
    .bmp-empty { text-align: center; padding: 20px; color: #475569; font-size: 12px; }
    .bmp-error {
      margin: 8px; padding: 8px 12px; border-radius: 7px;
      background: rgba(239,68,68,0.15); color: #FCA5A5; font-size: 12px;
    }

    /* Edit / Delete modal */
    .edit-block-overlay {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 1200;
    }
    .edit-block-card {
      background: #0F172A; border: 1px solid rgba(59,130,246,0.25);
      border-radius: 14px; width: 340px; overflow: hidden;
      box-shadow: 0 24px 64px rgba(0,0,0,0.7);
    }
    .delete-card { border-color: rgba(239,68,68,0.3); width: 300px; }
    .edit-block-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px 12px; border-bottom: 1px solid rgba(255,255,255,0.07);
      h3 { color: #F1F5F9; font-size: 14px; font-weight: 700; margin: 0; }
    }
    .edit-block-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
    .edit-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .edit-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .edit-section-title {
      font-size: 10px; font-weight: 700; color: #475569; letter-spacing: 0.07em;
      text-transform: uppercase; padding-top: 2px;
    }
    .color-input {
      width: 100%; height: 34px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.1);
      cursor: pointer; padding: 2px;
    }
    .rotation-slider { width: 100%; accent-color: #3B82F6; }
    .edit-block-footer {
      display: flex; gap: 8px; padding: 12px 18px 16px;
      border-top: 1px solid rgba(255,255,255,0.07);
      button { flex: 1; }
    }
    .delete-warning { color: #CBD5E1; font-size: 13px; line-height: 1.5; margin: 0; }
    .btn-danger {
      background: rgba(239,68,68,0.9); color: #fff; border: none; border-radius: 8px;
      padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.15s;
      &:hover { background: #EF4444; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    /* Block label divicon */
    :global(.bloc-label-icon) {
      background: rgba(0,0,0,0.72) !important;
      border: 1px solid rgba(255,255,255,0.2) !important;
      border-radius: 5px !important; padding: 3px 8px !important;
      color: #fff !important; font-size: 11px !important;
      font-weight: 700 !important; white-space: nowrap !important;
      pointer-events: none !important; backdrop-filter: blur(4px);
    }
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

  newBlockData: { block_id: string; name: string; lat_min: number; lat_max: number; lng_min: number; lng_max: number; coordinates?: number[][] } =
    { block_id: '', name: '', lat_min: 0, lat_max: 0, lng_min: 0, lng_max: 0 };

  // Block management
  showBlockMgmt = signal(false);
  showEditBlock = signal(false);
  showDeleteConfirm = signal(false);
  editingBlock = signal<any>(null);
  deletingBlock = signal<any>(null);
  blockList = signal<any[]>([]);
  blockDeleteError = signal('');
  savingBlock = signal(false);
  deletingBlockLoading = signal(false);
  editBlockForm = {
    name: '', rows: 10, bays: 20, tiers: 4,
    color: '#E6F1FB', stroke: '#0369A1',
    lat_min: 0, lat_max: 0, lng_min: 0, lng_max: 0, rotation: 0,
  };

  private map: any;
  private markers = new Map<string, any>();
  private blocksArr: any[] = [];
  private blockLabels: any[] = [];
  private drawnLayer: any = null;
  private subs: Subscription[] = [];

  constructor(
    private analytics: AnalyticsService,
    private alertService: AlertService,
    private containerService: ContainerService,
    private ws: WebSocketService,
  ) {}

  toggleFullscreen() {
    this.isFullscreen.update(v => !v);
    setTimeout(() => this.map?.invalidateSize(), 300);
  }

  setMapMode(mode: 'default' | 'add_block' | 'add_container') {
    if (this.map?.pm) {
      this.map.pm.disableDraw();
    }
    this.mapMode.set(mode);

    if (mode === 'add_block' && this.map?.pm) {
      // Delay prevents the button click from being registered as the first polygon point
      setTimeout(() => {
        this.map.pm.enableDraw('Polygon', {
          snappable: true,
          snapDistance: 15,
          allowSelfIntersection: false,
          templineStyle: { color: '#3B82F6', weight: 2 },
          hintlineStyle: { color: '#3B82F6', weight: 2, dashArray: '5 5' },
          pathOptions: {
            color: '#3B82F6',
            fillColor: '#3B82F6',
            fillOpacity: 0.2,
            weight: 2,
          },
        });
      }, 50);
    }
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
      this.criticalContainers.set(data.filter((d) => d.status === 'critical').slice(0, 5));
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
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.markers.clear();
      this.blocksArr = [];
      this.blockLabels = [];
    }

    this.map = L.map('port-map', {
      center: [36.8025, 10.2425],
      zoom: 17,
      zoomControl: false,
    });

    // Satellite imagery (ESRI World Imagery — same photos as Google Earth)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics',
        maxZoom: 20,
      }
    ).addTo(this.map);

    // Translucent labels overlay (street/place names on top of satellite)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { opacity: 0.6, maxZoom: 20 }
    ).addTo(this.map);

    // Custom zoom control (bottom-right)
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Listen for drawn polygons (geoman)
    this.map.on('pm:create', (e: any) => this.onShapeDrawn(e));

    // Listen for map clicks (container placement)
    this.map.on('click', (e: any) => this.onMapClick(e));

    // Load blocs and containers
    this.analytics.getMapLayout().subscribe((layout) => this.drawBlocks(layout));
    this.analytics.getMapContainers().subscribe((fc) => this.drawContainers(fc));
  }

  private onShapeDrawn(e: any) {
    if (this.mapMode() !== 'add_block') {
      if (this.map) this.map.removeLayer(e.layer);
      return;
    }

    this.map.pm.disableDraw();

    const layer = e.layer;
    const latlngs: any[] = layer.getLatLngs()[0];
    const lats = latlngs.map((p: any) => p.lat);
    const lngs = latlngs.map((p: any) => p.lng);

    // Build GeoJSON coordinate ring [lng, lat] and close it
    const coordinates: number[][] = latlngs.map((p: any) => [p.lng, p.lat]);
    coordinates.push([...coordinates[0]]); // close the ring

    this.newBlockData = {
      block_id: '',
      name: '',
      lat_min: Math.min(...lats),
      lat_max: Math.max(...lats),
      lng_min: Math.min(...lngs),
      lng_max: Math.max(...lngs),
      coordinates,
    };

    this.drawnLayer = layer;
    this.showBlockForm.set(true);
    this.mapMode.set('default');
  }

  private onMapClick(e: any) {
    if (this.mapMode() !== 'add_container') return;
    const latlng = e.latlng;
    const block = this.blocksArr.find(b => b.polygon.getBounds().contains(latlng));
    this.containerService.setPrefill({
      block: block ? block.props.block_id : 'A',
      slot_lat: latlng.lat,
      slot_lng: latlng.lng,
    });
    this.showRegister.set(true);
    this.setMapMode('default');
  }

  saveBlock() {
    this.analytics.createBlock(this.newBlockData).subscribe(() => {
      this.showBlockForm.set(false);
      // Remove the draft drawn polygon
      if (this.drawnLayer) {
        this.map.removeLayer(this.drawnLayer);
        this.drawnLayer = null;
      }
      // Reload only the blocs layer
      this.clearBlocks();
      this.analytics.getMapLayout().subscribe((layout) => this.drawBlocks(layout));
    });
  }

  cancelBlockForm() {
    this.showBlockForm.set(false);
    if (this.drawnLayer) {
      this.map.removeLayer(this.drawnLayer);
      this.drawnLayer = null;
    }
    this.setMapMode('default');
  }

  onContainerCreated(_c: any) {
    this.showRegister.set(false);
    // Refresh container markers
    this.markers.forEach(entry => this.map.removeLayer(entry.marker));
    this.markers.clear();
    this.analytics.getMapContainers().subscribe((fc) => this.drawContainers(fc));
  }

  private clearBlocks() {
    this.blocksArr.forEach(b => {
      this.map.removeLayer(b.polygon);
    });
    this.blockLabels.forEach(l => this.map.removeLayer(l));
    this.blocksArr = [];
    this.blockLabels = [];
  }

  private drawBlocks(layout: any) {
    if (!this.map) return;
    layout.features.forEach((f: any) => {
      const coords = f.geometry.coordinates[0].map((c: any) => [c[1], c[0]]);
      const polygon = L.polygon(coords, {
        color: f.properties.stroke || '#60A5FA',
        fillColor: f.properties.color || '#3B82F6',
        fillOpacity: 0.18,
        weight: 2,
        dashArray: '6 3',
        opacity: 0.9,
        interactive: false,
      }).addTo(this.map);

      this.blocksArr.push({ polygon, props: f.properties });

      // Permanent label at bloc center
      const center = polygon.getBounds().getCenter();
      const labelIcon = L.divIcon({
        html: `<div style="
          background:rgba(0,0,0,0.72);
          border:1px solid rgba(255,255,255,0.25);
          border-radius:5px;padding:3px 9px;
          color:#fff;font-size:11px;font-weight:700;
          white-space:nowrap;pointer-events:none;
          backdrop-filter:blur(4px);
          box-shadow:0 2px 8px rgba(0,0,0,0.4);
        ">${f.properties.name}</div>`,
        className: '',
        iconAnchor: [60, 12],
      });
      const label = L.marker(center, { icon: labelIcon, interactive: false }).addTo(this.map);
      this.blockLabels.push(label);
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
      radius: isCritical ? 11 : 8,
      color: '#FFFFFF',       // White border for satellite contrast
      fillColor: props.color,
      fillOpacity: 0.9,
      weight: 2,
    });

    marker.bindTooltip(`
      <b>${props.container_number}</b><br>
      ${props.commodity}<br>
      Risk: <b>${props.risk_level}</b>
      ${props.failure_hours ? `<br>Failure in ~${props.failure_hours}h` : ''}
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
    entry.marker.setStyle({ fillColor: color });
    entry.props.risk_level = msg.data.risk_level;
  }

  toggleBlockMgmt() {
    const next = !this.showBlockMgmt();
    this.showBlockMgmt.set(next);
    if (next) this.analytics.getBlockList().subscribe(b => this.blockList.set(b));
  }

  openEditBlock(block: any) {
    this.editingBlock.set(block);
    this.editBlockForm = {
      name: block.name, rows: block.rows, bays: block.bays, tiers: block.tiers,
      color: block.color, stroke: block.stroke,
      lat_min: block.lat_min, lat_max: block.lat_max,
      lng_min: block.lng_min, lng_max: block.lng_max,
      rotation: block.rotation ?? 0,
    };
    this.showEditBlock.set(true);
  }

  saveEditBlock() {
    const block = this.editingBlock();
    if (!block) return;
    this.savingBlock.set(true);
    this.analytics.updateBlock(block.block_id, this.editBlockForm).subscribe({
      next: () => {
        this.savingBlock.set(false);
        this.showEditBlock.set(false);
        this.clearBlocks();
        this.analytics.getMapLayout().subscribe(l => this.drawBlocks(l));
        this.analytics.getBlockList().subscribe(b => this.blockList.set(b));
      },
      error: () => this.savingBlock.set(false),
    });
  }

  confirmDeleteBlock(block: any) {
    this.deletingBlock.set(block);
    this.blockDeleteError.set('');
    this.showDeleteConfirm.set(true);
  }

  executeDeleteBlock() {
    const block = this.deletingBlock();
    if (!block) return;
    this.deletingBlockLoading.set(true);
    this.blockDeleteError.set('');
    this.analytics.deleteBlock(block.block_id).subscribe({
      next: () => {
        this.deletingBlockLoading.set(false);
        this.showDeleteConfirm.set(false);
        this.clearBlocks();
        this.analytics.getMapLayout().subscribe(l => this.drawBlocks(l));
        this.analytics.getBlockList().subscribe(b => this.blockList.set(b));
      },
      error: (err: any) => {
        this.deletingBlockLoading.set(false);
        this.blockDeleteError.set(err.error?.detail ?? 'Failed to delete block');
      },
    });
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    this.map?.remove();
  }
}
