import { Component, EventEmitter, Input, OnInit, OnDestroy, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ContainerService } from '../../core/api/container.service';
import { Container } from '../../shared/models/models';

@Component({
  selector: 'app-register-container',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="drawer" (click)="$event.stopPropagation()">
        <div class="drawer-header">
          <div>
            <h2 class="drawer-title">{{ editContainer ? 'Edit Container' : 'Register New Container' }}</h2>
            <p class="drawer-subtitle">{{ editContainer ? 'Update container and cargo specifications' : 'Enter container and cargo specifications' }}</p>
          </div>
          <button class="btn-close" (click)="close.emit()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form class="drawer-body" (submit)="onSubmit($event)">
          <div class="form-section">
            <h3 class="section-title">Identity & Owner</h3>
            <div class="form-group">
              <label>Container Number</label>
              <input type="text" [(ngModel)]="form.container_number" name="cn"
                     placeholder="e.g. CMAU7821697" required
                     maxlength="11"
                     [class.input-error]="cnTouched() && !isValidCN()"
                     [class.input-ok]="cnTouched() && isValidCN()"
                     (input)="onCNInput($event)"
                     (blur)="cnTouched.set(true)" />
              <div class="cn-hint" [class.cn-hint-error]="cnTouched() && !isValidCN()" [class.cn-hint-ok]="isValidCN()">
                <span *ngIf="!isValidCN()">4 letters + 7 digits &nbsp;·&nbsp; e.g. CMAU7821697</span>
                <span *ngIf="isValidCN()">✓ Valid format</span>
              </div>
            </div>
            <div class="form-group">
              <label>Shipping Line / Owner</label>
              <input type="text" [(ngModel)]="form.owner" name="owner" placeholder="e.g. CMA CGM" />
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">Cargo Details</h3>
            <div class="form-group">
              <label>Commodity Type</label>
              <select [(ngModel)]="form.commodity" name="commodity" (change)="onCommodityChange()" required>
                <option value="" disabled>Select a profile...</option>
                <option *ngFor="let p of profiles" [value]="p.name">{{ p.name }}</option>
              </select>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label>Target Temp (°C)</label>
                <input type="number" [(ngModel)]="form.target_temp" name="tt" step="0.5" required />
              </div>
              <div class="form-group">
                <label>Tolerance (°C)</label>
                <input type="number" [(ngModel)]="form.tolerance" name="tol" step="0.1" />
              </div>
            </div>
          </div>

          <div class="form-section" *ngIf="editContainer">
            <h3 class="section-title">Container Status</h3>
            <div class="form-group">
              <label>Status</label>
              <select [(ngModel)]="form.status" name="status">
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="critical">Critical</option>
                <option value="departed">Departed</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">Terminal Location</h3>
            <div class="form-group">
              <label>Storage Block</label>
              <select [(ngModel)]="form.block" name="block">
                <option value="A">Block A</option>
                <option value="B">Block B</option>
                <option value="C">Block C</option>
              </select>
            </div>
            <div class="grid-3">
              <div class="form-group">
                <label>Row</label>
                <input type="number" [(ngModel)]="form.row_num" name="rn" />
              </div>
              <div class="form-group">
                <label>Bay</label>
                <input type="number" [(ngModel)]="form.bay" name="bay" />
              </div>
              <div class="form-group">
                <label>Tier</label>
                <input type="number" [(ngModel)]="form.tier" name="tier" />
              </div>
            </div>
          </div>

          <div class="error-msg" *ngIf="error()">{{ error() }}</div>

          <div class="drawer-footer">
            <button type="button" class="btn btn-ghost" (click)="close.emit()" [disabled]="saving()">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving() || !isValidCN()">
              {{ saving() ? (editContainer ? 'Saving...' : 'Registering...') : (editContainer ? 'Save Changes' : 'Register Container') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(4px); z-index: 1000;
      display: flex; justify-content: flex-end;
    }
    .drawer {
      width: 100%; max-width: 480px; background: white; height: 100%;
      box-shadow: -10px 0 40px rgba(0,0,0,0.1);
      display: flex; flex-direction: column;
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

    .drawer-header {
      padding: 24px; border-bottom: 1px solid #E2E8F0;
      display: flex; justify-content: space-between; align-items: flex-start;
    }
    .drawer-title { font-size: 20px; font-weight: 700; color: #003B72; }
    .drawer-subtitle { font-size: 13px; color: #64748B; margin-top: 4px; }
    .btn-close { background: none; border: none; color: #94A3B8; cursor: pointer; &:hover { color: #0F172A; } }

    .drawer-body { flex: 1; overflow-y: auto; padding: 24px; }
    .form-section { margin-bottom: 28px; }
    .section-title { font-size: 12px; font-weight: 700; color: #003B72; text-transform: uppercase; 
                     letter-spacing: 0.05em; margin-bottom: 16px; border-bottom: 1px solid #F1F5F9; padding-bottom: 8px; }

    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    input, select {
      width: 100%; padding: 10px 12px; border: 1.5px solid #E2E8F0; border-radius: 8px;
      font-size: 14px; outline: none; transition: border-color 0.2s;
      &:focus { border-color: #003B72; }
    }

    .drawer-footer {
      padding: 24px; border-top: 1px solid #E2E8F0; background: #F8FAFC;
      display: flex; gap: 12px; justify-content: flex-end;
    }
    .error-msg { background: #FEF2F2; color: #DC2626; padding: 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }

    input.input-error { border-color: #EF4444 !important; background: #FFF5F5; }
    input.input-ok    { border-color: #22C55E !important; }

    .cn-hint {
      font-size: 11px; margin-top: 5px; color: #94A3B8;
      min-height: 16px;
    }
    .cn-hint-error { color: #EF4444; }
    .cn-hint-ok    { color: #22C55E; font-weight: 600; }
  `]
})
export class RegisterContainerComponent implements OnInit, OnDestroy {
  @Input() editContainer: Container | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<any>();

  saving = signal(false);
  error = signal<string | null>(null);
  cnTouched = signal(false);
  private subs: Subscription[] = [];

  private readonly CN_PATTERN = /^[A-Z]{4}\d{7}$/;

  isValidCN(): boolean {
    return this.CN_PATTERN.test(this.form.container_number);
  }

  onCNInput(e: Event) {
    const input = e.target as HTMLInputElement;
    // Force uppercase and strip invalid characters as the user types
    const upper = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.form.container_number = upper;
    input.value = upper;
    this.cnTouched.set(true);
  }

  form = {
    container_number: '',
    owner: '',
    commodity: '',
    target_temp: 4.0,
    tolerance: 1.5,
    status: 'active',
    block: 'A',
    row_num: 1,
    bay: 1,
    tier: 1,
    slot_lat: undefined as number | undefined,
    slot_lng: undefined as number | undefined
  };

  profiles = [
    { name: 'Frozen Fish', temp: -18, tol: 2.0 },
    { name: 'Fresh Vegetables', temp: 4, tol: 1.5 },
    { name: 'Dairy Products', temp: 2, tol: 1.0 },
    { name: 'Meat Products', temp: -15, tol: 2.0 },
    { name: 'Pharmaceutical', temp: 8, tol: 0.5 },
    { name: 'Tropical Fruits', temp: 13, tol: 2.0 },
    { name: 'Ice Cream', temp: -22, tol: 1.0 }
  ];

  constructor(private containerService: ContainerService) {}

  ngOnInit() {
    if (this.editContainer) {
      this.setData(this.editContainer);
      // Restore actual values — setData's onCommodityChange overwrites them with profile defaults
      this.form.target_temp = this.editContainer.target_temp;
      this.form.tolerance = this.editContainer.tolerance;
      this.cnTouched.set(true);
    }
    this.subs.push(
      this.containerService.prefill$.subscribe(data => {
        if (data) {
          this.setData(data);
          this.containerService.setPrefill(null);
        }
      })
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s: Subscription) => s.unsubscribe());
  }

  public setData(data: any) {
    this.form = { ...this.form, ...data };
    if (data['commodity']) this.onCommodityChange();
  }

  onCommodityChange() {
    const p = this.profiles.find(x => x.name === this.form.commodity);
    if (p) {
      this.form.target_temp = p.temp;
      this.form.tolerance = p.tol;
    }
  }

  onSubmit(e: Event) {
    e.preventDefault();
    this.saving.set(true);
    this.error.set(null);

    const obs = this.editContainer
      ? this.containerService.update(this.editContainer.id, this.form)
      : this.containerService.create(this.form);

    obs.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.created.emit(res);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err.error?.detail || 'Failed to save container. Please check fields.');
      }
    });
  }
}
