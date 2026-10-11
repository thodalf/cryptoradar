import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';
import { BINANCE_REST, KLINE_HISTORY, KLINE_INTERVAL } from '../config';
import { Candle, Ticker } from '../models';

interface RawTicker24h {
  symbol: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  closeTime: number;
}

type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

/** Appels REST publics Binance (amorçage des données avant le flux WebSocket). */
@Injectable({ providedIn: 'root' })
export class BinanceRestService {
  private readonly http = inject(HttpClient);

  /** Retourne uniquement les symboles qui existent réellement sur Binance. */
  validSymbols(candidates: string[]): Observable<string[]> {
    return this.http
      .get<{ symbol: string }[]>(`${BINANCE_REST}/ticker/price`)
      .pipe(
        map((all) => {
          const known = new Set(all.map((t) => t.symbol));
          return candidates.filter((s) => known.has(s));
        }),
      );
  }

  tickers24h(symbols: string[]): Observable<Ticker[]> {
    if (!symbols.length) return of([]);
    const params = new HttpParams().set('symbols', JSON.stringify(symbols));
    return this.http
      .get<RawTicker24h[]>(`${BINANCE_REST}/ticker/24hr`, { params })
      .pipe(map((rows) => rows.map(toTicker)));
  }

  klines(symbol: string, interval = KLINE_INTERVAL, limit = KLINE_HISTORY): Observable<Candle[]> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('interval', interval)
      .set('limit', limit);
    return this.http
      .get<RawKline[]>(`${BINANCE_REST}/klines`, { params })
      .pipe(map((rows) => rows.map(toCandle)));
  }

  /** Charge l'historique 1h de plusieurs symboles en parallèle. */
  klinesFor(symbols: string[]): Observable<Record<string, Candle[]>> {
    if (!symbols.length) return of({});
    const calls = Object.fromEntries(symbols.map((s) => [s, this.klines(s)]));
    return forkJoin(calls);
  }
}

function toTicker(r: RawTicker24h): Ticker {
  return {
    symbol: r.symbol,
    asset: r.symbol.replace(/USDT$/, ''),
    lastUsdt: +r.lastPrice,
    openUsdt: +r.openPrice,
    highUsdt: +r.highPrice,
    lowUsdt: +r.lowPrice,
    baseVolume: +r.volume,
    quoteVolume: +r.quoteVolume,
    updatedAt: r.closeTime,
  };
}

function toCandle(k: RawKline): Candle {
  return {
    openTime: k[0],
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
    closed: k[6] < Date.now(),
  };
}
