import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';
import { BinanceRestService } from '../api/binance-rest.service';
import { CoinGeckoService } from '../api/coingecko.service';
import { COINGECKO_ASSETS, EUR_PAIR, QUOTE, STABLECOINS } from '../config';
import { computeTax, saleSnapshots } from '../portfolio/tax';
import { readLocal, writeLocal } from '../storage';
import { PortfolioStore } from './portfolio.store';

/** Flat tax 2026 : 12,8 % d'impôt + 18,6 % de prélèvements sociaux. */
export const DEFAULT_TAX_RATE = 0.314;

/**
 * Fiscalité : valorise le portefeuille à la date de chaque vente (clôtures
 * journalières Binance / CoinGecko) puis applique le 150 VH bis.
 * Chaque valeur peut être corrigée à la main (relevé Wigl faisant foi).
 */
@Injectable({ providedIn: 'root' })
export class TaxStore {
  private readonly portfolio = inject(PortfolioStore);
  private readonly binance = inject(BinanceRestService);
  private readonly gecko = inject(CoinGeckoService);

  readonly rate = signal<number>(readLocal('cr.taxRate', DEFAULT_TAX_RATE));
  readonly overrides = signal<Record<string, number>>(readLocal('cr.taxOverrides', {}));
  readonly fetched = signal<Record<string, number | null>>({});
  readonly status = signal<'idle' | 'loading' | 'done' | 'error'>('idle');
  readonly missing = signal<string[]>([]);

  readonly snapshots = computed(() => saleSnapshots(this.portfolio.transactions()));

  readonly values = computed(() => {
    const o = this.overrides();
    const f = this.fetched();
    return Object.fromEntries(this.snapshots().map((s) => [s.tx.id, o[s.tx.id] ?? f[s.tx.id] ?? null]));
  });

  readonly years = computed(() => computeTax(this.portfolio.transactions(), this.values(), this.rate()));

  private readonly cache = new Map<string, Observable<number | null>>();

  constructor() {
    effect(() => writeLocal('cr.taxRate', this.rate()));
    effect(() => writeLocal('cr.taxOverrides', this.overrides()));
  }

  setOverride(txId: string, value: number | null): void {
    this.overrides.update((o) => {
      const next = { ...o };
      if (value === null || !Number.isFinite(value) || value <= 0) delete next[txId];
      else next[txId] = value;
      return next;
    });
  }

  /** Récupère les cours historiques et calcule la valeur globale avant chaque vente. */
  valuate(): void {
    const snaps = this.snapshots();
    if (!snaps.length) return;
    this.status.set('loading');
    const missing = new Set<string>();

    const perSale = snaps.map((s) => {
      const date = new Date(s.tx.date);
      const entries = Object.entries(s.holdings).filter(([, q]) => q > 1e-12);
      if (!entries.length) return of([s.tx.id, null] as const);
      return forkJoin(entries.map(([asset, q]) =>
        this.priceEur(asset, date).pipe(map((p) => {
          if (p === null) missing.add(asset);
          return p === null ? 0 : p * q;
        })),
      )).pipe(map((vals) => [s.tx.id, vals.reduce((a, b) => a + b, 0) || null] as const));
    });

    forkJoin(perSale).subscribe({
      next: (pairs) => {
        this.fetched.set(Object.fromEntries(pairs));
        this.missing.set([...missing]);
        this.status.set('done');
      },
      error: () => this.status.set('error'),
    });
  }

  private priceEur(asset: string, date: Date): Observable<number | null> {
    if (asset in STABLECOINS) return of(STABLECOINS[asset]);
    const key = `${asset}@${date.toISOString().slice(0, 10)}`;
    let obs = this.cache.get(key);
    if (!obs) {
      const fx$ = this.usdtClose(EUR_PAIR, date);
      const id = COINGECKO_ASSETS[asset];
      obs = id
        ? this.gecko.dailyClose(id, date).pipe(catchError(() => of(null)))
        : asset === 'USDT' || asset === 'USDC'
          ? fx$.pipe(map((fx) => (fx ? 1 / fx : null)))
          : this.usdtClose(asset + QUOTE, date).pipe(
              switchMap((usdt) => fx$.pipe(map((fx) => (usdt !== null && fx ? usdt / fx : null)))),
            );
      obs = obs.pipe(shareReplay(1));
      this.cache.set(key, obs);
    }
    return obs;
  }

  private usdtClose(symbol: string, date: Date): Observable<number | null> {
    const key = `usdt:${symbol}@${date.toISOString().slice(0, 10)}`;
    let obs = this.cache.get(key);
    if (!obs) {
      obs = this.binance.dailyClose(symbol, date).pipe(catchError(() => of(null)), shareReplay(1));
      this.cache.set(key, obs);
    }
    return obs;
  }
}
