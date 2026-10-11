import { Injectable, signal } from '@angular/core';
import { Observable, defer, finalize, interval, map, of, share } from 'rxjs';
import { EUR_PAIR, KLINE_HISTORY } from '../config';
import { Candle, ConnectionState, Ticker } from '../models';
import { MarketEvent } from './binance-ws.service';

/**
 * Source de marché simulée, utilisée par la version de démonstration
 * (build « artifact ») là où Binance n'est pas joignable.
 * Expose la même interface que BinanceRestService + BinanceWsService,
 * et injecte volontairement quelques situations remarquables pour que
 * le détecteur d'opportunités ait de quoi réagir.
 */

const HOUR = 3_600_000;
const EUR_USDT = 1.16;

/** Prix de départ fictifs en USDT, ordre de grandeur réaliste. */
const START: Record<string, number> = {
  BTC: 78000, ETH: 3400, SOL: 172, XRP: 0.64, BNB: 610, ADA: 0.47, DOGE: 0.16, AVAX: 31,
  LINK: 15.2, DOT: 5.6, LTC: 86, TRX: 0.17, POL: 0.42, UNI: 8.6, ATOM: 6.3, NEAR: 5.4,
};

/** Scénarios injectés : dérive horaire, choc final, multiplicateur de volume final. */
const SCENARIO: Record<string, { drift?: number; lastMove?: number; lastVolume?: number }> = {
  DOGE: { drift: -0.006 },                        // longue baisse → survente RSI
  SOL: { drift: 0.0045 },                         // hausse régulière → surachat RSI
  AVAX: { lastMove: 0.055, lastVolume: 3.2 },     // choc + volume → mouvement atypique
  LINK: { lastVolume: 5 },                        // pic de volume isolé
  NEAR: { drift: -0.0025, lastMove: -0.04 },      // décrochage brutal
};

@Injectable({ providedIn: 'root' })
export class DemoMarketService {
  readonly state = signal<ConnectionState>('offline');

  private rng = mulberry32(20261011);
  private readonly candles: Record<string, Candle[]> = {};
  private readonly tickers: Record<string, Ticker> = {};

  constructor() {
    const now = Date.now();
    const currentOpen = Math.floor(now / HOUR) * HOUR;
    for (const [asset, start] of Object.entries(START)) {
      const sc = SCENARIO[asset] ?? {};
      const list: Candle[] = [];
      let p = start * (0.94 + this.rng() * 0.12);
      for (let i = KLINE_HISTORY - 1; i >= 0; i--) {
        const open = p;
        const isLast = i === 0;
        const vol = 0.012 + this.rng() * 0.006;
        // la tendance du scénario ne joue que sur les 36 dernières heures
        p = open * (1 + (i < 36 ? sc.drift ?? 0 : 0) + (this.rng() - 0.5) * vol * 2);
        if (isLast && sc.lastMove) p = open * (1 + sc.lastMove);
        const t = currentOpen - i * HOUR;
        const baseVol = (2e6 / start) * (0.7 + this.rng() * 0.6);
        // la bougie en cours n'a « vécu » qu'une partie de l'heure
        const elapsed = isLast ? Math.max(0.15, (now - t) / HOUR) : 1;
        list.push({
          openTime: t, open,
          high: Math.max(open, p) * (1 + this.rng() * 0.004),
          low: Math.min(open, p) * (1 - this.rng() * 0.004),
          close: p,
          volume: baseVol * elapsed * (isLast ? sc.lastVolume ?? 1 : 1),
          closed: !isLast,
        });
      }
      const symbol = asset + 'USDT';
      this.candles[symbol] = list;
      const open24 = list[list.length - 25].close;
      const last24 = list.slice(-24);
      this.tickers[symbol] = {
        symbol, asset,
        lastUsdt: p, openUsdt: open24,
        highUsdt: Math.max(...last24.map((c) => c.high)),
        lowUsdt: Math.min(...last24.map((c) => c.low)),
        baseVolume: last24.reduce((s, c) => s + c.volume, 0),
        quoteVolume: last24.reduce((s, c) => s + c.volume * c.close, 0),
        updatedAt: now,
      };
    }
    this.tickers[EUR_PAIR] = {
      symbol: EUR_PAIR, asset: 'EUR', lastUsdt: EUR_USDT, openUsdt: EUR_USDT,
      highUsdt: EUR_USDT, lowUsdt: EUR_USDT, baseVolume: 0, quoteVolume: 0, updatedAt: now,
    };
  }

  // ── interface « REST » ──────────────────────────────────────────────────
  validSymbols(candidates: string[]): Observable<string[]> {
    return of(candidates.filter((s) => s in this.tickers));
  }

  tickers24h(symbols: string[]): Observable<Ticker[]> {
    return of(symbols.map((s) => ({ ...this.tickers[s] })));
  }

  klinesFor(symbols: string[]): Observable<Record<string, Candle[]>> {
    return of(Object.fromEntries(symbols.map((s) => [s, this.candles[s].map((c) => ({ ...c }))])));
  }

  // ── interface « WebSocket » ─────────────────────────────────────────────
  stream(symbols: string[]): Observable<MarketEvent> {
    const tradable = symbols.filter((s) => s !== EUR_PAIR);
    return defer(() => {
      this.state.set('live');
      return interval(250);
    }).pipe(
      map(() => this.tick(tradable[Math.floor(this.rng() * tradable.length)])),
      finalize(() => this.state.set('offline')),
      share(),
    );
  }

  private tick(symbol: string): MarketEvent {
    const t = this.tickers[symbol];
    const list = this.candles[symbol];
    const c = list[list.length - 1];
    const next = t.lastUsdt * (1 + (this.rng() - 0.5) * 0.0016);
    const addVol = (2e6 / START[t.asset]) * 0.004 * this.rng();
    c.close = next;
    c.high = Math.max(c.high, next);
    c.low = Math.min(c.low, next);
    c.volume += addVol;
    t.lastUsdt = next;
    t.highUsdt = Math.max(t.highUsdt, next);
    t.lowUsdt = Math.min(t.lowUsdt, next);
    t.quoteVolume += addVol * next;
    t.updatedAt = Date.now();
    // alterne ticker et bougie pour alimenter les deux chemins du store
    return this.rng() < 0.5
      ? { type: 'ticker', symbol, last: t.lastUsdt, open: t.openUsdt, high: t.highUsdt, low: t.lowUsdt,
          baseVolume: t.baseVolume, quoteVolume: t.quoteVolume, time: t.updatedAt }
      : { type: 'kline', symbol, candle: { ...c } };
  }
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
