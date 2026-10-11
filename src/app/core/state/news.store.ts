import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, timer } from 'rxjs';
import { DEMO_NEWS } from '../api/demo-news';
import { DEMO_MODE } from '../data-mode';
import { NewsItem } from '../models';

const REFRESH_MS = 10 * 60_000;

/**
 * Actualité crypto agrégée par la fonction Netlify /api/news (flux RSS
 * Cryptoast, Journal du Coin, Cointribune, CoinDesk, Cointelegraph, Google
 * Actualités pour Wigl). Rafraîchie toutes les 10 minutes.
 */
@Injectable({ providedIn: 'root' })
export class NewsStore {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<NewsItem[]>([]);
  readonly status = signal<'idle' | 'loading' | 'ok' | 'error'>('idle');
  readonly updatedAt = signal<number | null>(null);
  readonly failedSources = signal<string[]>([]);

  readonly latest = computed(() => this.items().slice(0, 6));

  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    if (DEMO_MODE) {
      this.items.set(DEMO_NEWS);
      this.status.set('ok');
      this.updatedAt.set(Date.now());
      return;
    }
    timer(0, REFRESH_MS).pipe(
      switchMap(() => {
        if (!this.items().length) this.status.set('loading');
        return this.http.get<{ generatedAt: number; failed: string[]; items: NewsItem[] }>('/api/news').pipe(
          catchError(() => of(null)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((r) => {
      if (!r) {
        if (!this.items().length) this.status.set('error');
        return;
      }
      this.items.set(r.items);
      this.failedSources.set(r.failed);
      this.updatedAt.set(r.generatedAt);
      this.status.set('ok');
    });
  }
}
