import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { KPISummary, LiveReading } from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(private http: HttpClient) {}

  getSummary(): Observable<KPISummary> {
    return this.http.get<KPISummary>(`${environment.apiUrl}/analytics/summary`);
  }

  getAlertsOverTime(days = 30): Observable<any> {
    return this.http.get(`${environment.apiUrl}/analytics/alerts-over-time`, {
      params: new HttpParams().set('days', days),
    });
  }

  getRiskDistribution(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/analytics/risk-distribution`);
  }

  getTopProblematic(limit = 5): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/analytics/top-problematic`, {
      params: new HttpParams().set('limit', limit),
    });
  }

  getCommodityPerformance(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/analytics/commodity-performance`);
  }

  getLossesPrevented(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/analytics/losses-prevented`);
  }

  getLiveSensors(): Observable<LiveReading[]> {
    return this.http.get<LiveReading[]>(`${environment.apiUrl}/sensors/live`);
  }

  getSensorChart(containerId: string, hours = 24): Observable<any> {
    return this.http.get(`${environment.apiUrl}/sensors/${containerId}/chart`, {
      params: new HttpParams().set('hours', hours),
    });
  }

  getAllPredictions(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/predictions`);
  }

  getMapLayout(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/map/layout`);
  }

  getMapContainers(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/map/containers`);
  }

  createBlock(block: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}/map`, block);
  }

  getBlockList(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/map/blocks`);
  }

  updateBlock(blockId: string, data: any): Observable<any> {
    return this.http.put(`${environment.apiUrl}/map/${blockId}`, data);
  }

  deleteBlock(blockId: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/map/${blockId}`);
  }

  triggerScoring(): Observable<any> {
    return this.http.post(`${environment.apiUrl}/predictions/trigger`, {});
  }
}
