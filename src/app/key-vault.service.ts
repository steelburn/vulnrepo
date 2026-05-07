import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
  'mousemove', 'keydown', 'click', 'touchstart', 'scroll'
];

@Injectable({ providedIn: 'root' })
export class KeyVaultService implements OnDestroy {

  private keys = new Map<string, string>();
  private apiVault: string | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private changeSubject = new Subject<string | null>();
  public readonly change$: Observable<string | null> = this.changeSubject.asObservable();

  private idleResetAtSubject = new BehaviorSubject<number | null>(null);
  public readonly idleResetAt$: Observable<number | null> = this.idleResetAtSubject.asObservable();

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.clearAll);
    window.addEventListener('beforeunload', this.clearAll);
    for (const evt of IDLE_EVENTS) {
      window.addEventListener(evt, this.resetIdle, { passive: true } as AddEventListenerOptions);
    }
    this.resetIdle();
  }

  set(reportId: string, password: string): void {
    this.keys.set(reportId, password);
    this.resetIdle();
    this.changeSubject.next(reportId);
  }

  get(reportId: string): string | null {
    const v = this.keys.get(reportId);
    if (v !== undefined) {
      this.resetIdle();
      return v;
    }
    return null;
  }

  has(reportId: string): boolean {
    return this.keys.has(reportId);
  }

  remove(reportId: string): void {
    if (this.keys.delete(reportId)) {
      this.changeSubject.next(reportId);
      if (this.keys.size === 0 && this.apiVault === null) {
        this.idleResetAtSubject.next(null);
      }
    }
  }

  setApiVault(json: string): void {
    this.apiVault = json;
    this.resetIdle();
    this.changeSubject.next('VULNREPO-API');
  }

  getApiVault(): string | null {
    if (this.apiVault !== null) this.resetIdle();
    return this.apiVault;
  }

  removeApiVault(): void {
    if (this.apiVault !== null) {
      this.apiVault = null;
      this.changeSubject.next('VULNREPO-API');
      if (this.keys.size === 0) {
        this.idleResetAtSubject.next(null);
      }
    }
  }

  openReportIds(): string[] {
    return Array.from(this.keys.keys());
  }

  private clearAll = (): void => {
    if (this.keys.size === 0 && this.apiVault === null) return;
    this.keys.clear();
    this.apiVault = null;
    this.changeSubject.next(null);
    this.idleResetAtSubject.next(null);
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.clearAll();
  };

  private resetIdle = (): void => {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(this.clearAll, IDLE_TIMEOUT_MS);
    if (this.keys.size > 0 || this.apiVault !== null) {
      const newAt = Date.now() + IDLE_TIMEOUT_MS;
      const prev = this.idleResetAtSubject.value;
      // Throttle: only re-emit if the reset point shifted by more than 5s
      // (avoids spamming switchMap on every mousemove event)
      if (prev === null || newAt - prev > 5000) {
        this.idleResetAtSubject.next(newAt);
      }
    }
  };

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.clearAll);
    window.removeEventListener('beforeunload', this.clearAll);
    for (const evt of IDLE_EVENTS) {
      window.removeEventListener(evt, this.resetIdle);
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.clearAll();
  }
}
