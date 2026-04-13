import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private ws: WebSocket | null = null;
  private messageSubject = new Subject<any>();
  private reconnectDelay = 3000;
  private reconnectTimer: any;
  private destroyed = false;

  messages$: Observable<any> = this.messageSubject.asObservable();

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.ws = new WebSocket(environment.wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      clearTimeout(this.reconnectTimer);
      // Send keep-alive pings
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data !== 'pong') {
          this.messageSubject.next(data);
        }
      } catch {}
    };

    this.ws.onclose = () => {
      console.warn('⚠️ WebSocket closed, reconnecting...');
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
      }
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error', err);
      this.ws?.close();
    };
  }

  private pingInterval: any;
  private startPing() {
    clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 30000);
  }

  disconnect(): void {
    this.destroyed = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingInterval);
    this.ws?.close();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
