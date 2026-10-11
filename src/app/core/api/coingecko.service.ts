import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';
import { COINGECKO_API } from '../config';
import { Candle } from '../models';

/** Cotation CoinGecko, en euros (pas de conversion nécessaire). */
export interface GeckoQuote {
  asset: string;
  priceEur: number;
  change24h: number;   // %
  volume24hEur: number;
  updatedAt: number;
  candles: Candle[];   // points horaires des 8 derniers jours
}

interface SimplePrice {
  [id: string]: { eur: number; eur_24h_vol: number; eur_24h_change: number; last_updated_at: number };
}
interface MarketChart {
  prices: [number, number][];
  total_volumes: [number, number][];
}

/**
 * Actifs non listés sur Binance (WIGL…). CoinGecko ne fournit que des points
 * de prix horaires et un volume 24h glissant : les bougies sont reconstruites
 * point à point et le volume horaire est réparti uniformément, si bien qu'aucun
 * « pic de volume » n'est détecté sur ces actifs (donnée trop peu fiable).
 */
@Injectable({ providedIn: 'root' })
export class CoinGeckoService {
  private readonly http = inject(HttpClient);

  quotes(ids: Record<string, string>): Observable<GeckoQuote[]> {
    const entries = Object.entries(ids);
    if (!entries.length) return of([]);
    const params = new HttpParams()
      .set('ids', entries.map(([, id]) => id).join(','))
      .set('vs_currencies', 'eur')
      .set('include_24hr_change', 'true')
      .set('include_24hr_vol', 'true')
      .set('include_last_updated_at', 'true');

    const simple$ = this.http.get<SimplePrice>(`${COINGECKO_API}/simple/price`, { params });
    const charts$ = forkJoin(Object.fromEntries(entries.map(([asset, id]) => [
      asset,
      this.http.get<MarketChart>(`${COINGECKO_API}/coins/${id}/market_chart`, {
        params: new HttpParams().set('vs_currency', 'eur').set('days', 8),
      }),
    ])));

    return forkJoin({ simple: simple$, charts: charts$ }).pipe(
      map(({ simple, charts }) => entries
        .filter(([, id]) => simple[id])
        .map(([asset, id]) => {
          const s = simple[id];
          const chart = charts[asset];
          return {
            asset,
            priceEur: s.eur,
            change24h: s.eur_24h_change ?? 0,
            volume24hEur: s.eur_24h_vol ?? 0,
            updatedAt: (s.last_updated_at ?? Date.now() / 1000) * 1000,
            candles: toCandles(chart, s.eur_24h_vol ?? 0),
          };
        })),
    );
  }

  /** Cours de clôture journalier en EUR à une date donnée (pour la fiscalité). */
  dailyClose(id: string, date: Date): Observable<number | null> {
    const d = `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
    return this.http
      .get<{ market_data?: { current_price?: { eur?: number } } }>(`${COINGECKO_API}/coins/${id}/history`, {
        params: new HttpParams().set('date', d).set('localization', 'false'),
      })
      .pipe(map((r) => r.market_data?.current_price?.eur ?? null));
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

function toCandles(chart: MarketChart, vol24h: number): Candle[] {
  const pts = chart.prices;
  const hourlyVol = vol24h / 24;
  const now = Date.now();
  return pts.slice(1).map(([t, price], i) => {
    const open = pts[i][1];
    return {
      openTime: t,
      open,
      high: Math.max(open, price),
      low: Math.min(open, price),
      close: price,
      volume: hourlyVol,
      closed: t + 3_600_000 < now,
    };
  });
}
