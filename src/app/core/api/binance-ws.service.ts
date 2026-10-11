import { Injectable, signal } from '@angular/core';
import { Observable, defer, filter, map, retry, share, timer } from 'rxjs';
import { webSocket } from 'rxjs/webSocket';
import { BINANCE_WS, KLINE_INTERVAL } from '../config';
import { Candle, ConnectionState } from '../models';

interface RawMiniTicker {
  e: '24hrMiniTicker';
  E: number; s: string;
  c: string; o: string; h: string; l: string; v: string; q: string;
}

interface RawKlineEvent {
  e: 'kline';
  s: string;
  k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean };
}

interface CombinedMessage { stream: string; data: RawMiniTicker | RawKlineEvent }

export type MarketEvent =
  | { type: 'ticker'; symbol: string; last: number; open: number; high: number; low: number; baseVolume: number; quoteVolume: number; time: number }
  | { type: 'kline'; symbol: string; candle: Candle };

/**
 * Flux temps réel Binance : un seul WebSocket multiplexé (miniTicker + kline 1h
 * de chaque symbole). Reconnexion automatique avec backoff exponentiel.
 */
@Injectable({ providedIn: 'root' })
export class BinanceWsService {
  readonly state = signal<ConnectionState>('offline');

  stream(symbols: string[]): Observable<MarketEvent> {
    const streams = symbols.flatMap((s) => {
      const l = s.toLowerCase();
      return [`${l}@miniTicker`, `${l}@kline_${KLINE_INTERVAL}`];
    });
    const url = `${BINANCE_WS}?streams=${streams.join('/')}`;

    return defer(() => {
      this.state.set(this.state() === 'offline' ? 'connecting' : 'reconnecting');
      return webSocket<CombinedMessage>({
        url,
        openObserver: { next: () => this.state.set('live') },
        closeObserver: { next: () => this.state.set('reconnecting') },
      });
    }).pipe(
      retry({
        // 1s, 2s, 4s… plafonné à 30s ; le compteur repart à zéro après un succès
        delay: (_err, attempt) => timer(Math.min(30_000, 1000 * 2 ** (attempt - 1))),
        resetOnSuccess: true,
      }),
      map((msg) => toEvent(msg.data)),
      filter((e): e is MarketEvent => e !== null),
      // Plusieurs abonnés partagent la même connexion ; fermeture quand plus personne n'écoute
      share({ resetOnRefCountZero: () => { this.state.set('offline'); return timer(0); } }),
    );
  }
}

function toEvent(d: RawMiniTicker | RawKlineEvent): MarketEvent | null {
  if (d.e === '24hrMiniTicker') {
    return {
      type: 'ticker', symbol: d.s, time: d.E,
      last: +d.c, open: +d.o, high: +d.h, low: +d.l, baseVolume: +d.v, quoteVolume: +d.q,
    };
  }
  if (d.e === 'kline') {
    const k = d.k;
    return {
      type: 'kline', symbol: d.s,
      candle: { openTime: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, closed: k.x },
    };
  }
  return null;
}
