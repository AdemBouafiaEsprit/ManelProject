import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Alert } from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class AlertService {
  private base = `${environment.apiUrl}/alerts`;

  constructor(private http: HttpClient) {}

  getAll(filters?: { severity?: string; is_active?: boolean; limit?: number }): Observable<Alert[]> {
    let params = new HttpParams();
    if (filters?.severity) params = params.set('severity', filters.severity);
    if (filters?.is_active !== undefined) params = params.set('is_active', String(filters.is_active));
    if (filters?.limit) params = params.set('limit', filters.limit);
    return this.http.get<Alert[]>(this.base, { params });
  }

  getById(id: string): Observable<Alert> {
    return this.http.get<Alert>(`${this.base}/${id}`);
  }

  acknowledge(id: string): Observable<Alert> {
    return this.http.put<Alert>(`${this.base}/${id}/acknowledge`, {});
  }

  resolve(id: string): Observable<Alert> {
    return this.http.put<Alert>(`${this.base}/${id}/resolve`, {});
  }

  bulkAcknowledge(ids: string[]): Observable<any> {
    return this.http.post(`${this.base}/bulk-acknowledge`, ids);
  }
}
