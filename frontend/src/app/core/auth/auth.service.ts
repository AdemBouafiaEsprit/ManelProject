import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthToken, User } from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _currentUser = new BehaviorSubject<User | null>(null);
  currentUser$ = this._currentUser.asObservable();

  constructor(private http: HttpClient, private router: Router) {
    const token = this.getToken();
    if (token) {
      this.fetchMe().subscribe({
        next: (user) => this._currentUser.next(user),
        error: () => this.logout(),
      });
    }
  }

  login(username: string, password: string): Observable<AuthToken> {
    const body = new URLSearchParams();
    body.set('username', username);
    body.set('password', password);
    return this.http
      .post<AuthToken>(`${environment.apiUrl}/auth/login`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .pipe(
        tap((res) => {
          localStorage.setItem('access_token', res.access_token);
          this._currentUser.next(res.user);
        })
      );
  }

  fetchMe(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(
      tap((user) => this._currentUser.next(user))
    );
  }

  logout(): void {
    localStorage.removeItem('access_token');
    this._currentUser.next(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  get currentUser(): User | null {
    return this._currentUser.getValue();
  }

  hasRole(...roles: string[]): boolean {
    const user = this.currentUser;
    return !!user && roles.includes(user.role);
  }
}
