import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Container, SensorReading, RiskScore, Alert, ContainerEvent } from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class ContainerService {
  private base = `${environment.apiUrl}/containers`;
  private prefillSubject = new BehaviorSubject<any>(null);
  prefill$ = this.prefillSubject.asObservable();

  constructor(private http: HttpClient) {}

  setPrefill(data: any) {
    this.prefillSubject.next(data);
  }

  getAll(status?: string, block?: string): Observable<Container[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (block) params = params.set('block', block);
    return this.http.get<Container[]>(this.base, { params });
  }

  getById(id: string): Observable<Container> {
    return this.http.get<Container>(`${this.base}/${id}`);
  }

  getHistory(id: string, hours = 24): Observable<SensorReading[]> {
    return this.http.get<SensorReading[]>(`${this.base}/${id}/history`, {
      params: new HttpParams().set('hours', hours),
    });
  }

  getRisk(id: string): Observable<RiskScore> {
    return this.http.get<RiskScore>(`${this.base}/${id}/risk`);
  }

  updateStatus(id: string, status: string): Observable<Container> {
    return this.http.put<Container>(`${this.base}/${id}/status`, { status });
  }

  create(container: any): Observable<Container> {
    return this.http.post<Container>(this.base, container);
  }

  update(id: string, data: any): Observable<Container> {
    return this.http.put<Container>(`${this.base}/${id}`, data);
  }

  reportIncident(id: string, description: string): Observable<Alert> {
    return this.http.post<Alert>(`${this.base}/${id}/report-incident`, { description });
  }

  bulkStatus(ids: string[], status: string): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>(`${this.base}/bulk-status`, { container_ids: ids, status });
  }

  getTimeline(id: string): Observable<ContainerEvent[]> {
    return this.http.get<ContainerEvent[]>(`${this.base}/${id}/timeline`);
  }
}
