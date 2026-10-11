import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, bufferTime, catchError, filter, forkJoin, of, retry, switchMap, tap, timer } from 'rxjs';
import { CoinGeckoService, GeckoQuote } from '../api/coingecko.service';
import { BinanceRestService } from '../api/binance-rest.service';
import { BinanceWsService, MarketEvent } from '../api/binance-ws.service';
import {
  COINGECKO_ASSETS, COINGECKO_POLL_MS, EUR_PAIR, KLINE_HISTORY, QUOTE, STABLECOINS, WIGL_ASSETS,
} from '../config';
import { Candle, MarketRow, Ticker } from '../models';
import { rsi } from '../analysis/indicators';

/**
 * État du marché (signals). Amorçage REST puis mises à jour WebSocket
 * regroupées par paquets d'une seconde pour limiter les recalculs.
 */
@Injectable({ providedIn: 'root' })
export class MarketStore {
  private readonly rest = inject(BinanceRestService);
  private readonly ws = inject(BinanceWsService);
  private readonly gecko = inject(CoinGeckoService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly tickers = signal<Record<string, Ticker>>({});
  /** Bougies 1h par symbole (clé « XXXUSDT », y compris pour les actifs CoinGecko). */
  readonly candles = signal<Record<string, Candle[]>>({});
  /** Actifs cotés hors Binance (WIGL…), en euros. */
  private readonly geckoQuotes = signal<Record<string, GeckoQuote>>({});
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly lastUpdate = signal<number | null>(null);
  readonly connection = this.ws.state;

  /** Prix d'1 EUR en USDT (pour convertir toutes les cotations). */
  readonly eurUsdt = computed(() => this.tickers()[EUR_PAIR]?.lastUsdt ?? null);

  readonly rows = computed<MarketRow[]>(() => {
    const fx = this.eurUsdt();
    if (!fx) return [];
    const candles = this.candles();
    const binance = Object.values(this.tickers())
      .filter((t) => t.symbol !== EUR_PAIR)
      .map((t) => {
        const closes = (candles[t.symbol] ?? []).map((c) => c.close);
        return {
          asset: t.asset,
          price: t.lastUsdt / fx,
          change24h: t.openUsdt ? ((t.lastUsdt - t.openUsdt) / t.openUsdt) * 100 : 0,
          volume24h: t.quoteVolume / fx,
          high24h: t.highUsdt / fx,
          low24h: t.lowUsdt / fx,
          rsi: rsi(closes),
          spark: closes.slice(-48),
          source: 'binance' as const,
        };
      });
    const extra = Object.values(this.geckoQuotes()).map((q) => {
      const c = candles[q.asset + QUOTE] ?? [];
      const last24 = c.slice(-24);
      return {
        asset: q.asset,
        price: q.priceEur,
        change24h: q.change24h,
        volume24h: q.volume24hEur,
        high24h: last24.length ? Math.max(...last24.map((k) => k.high), q.priceEur) : q.priceEur,
        low24h: last24.length ? Math.min(...last24.map((k) => k.low), q.priceEur) : q.priceEur,
        rsi: rsi(c.map((k) => k.close)),
        spark: c.slice(-48).map((k) => k.close),
        source: 'coingecko' as const,
      };
    });
    return [...binance, ...extra].sort((a, b) => b.volume24h - a.volume24h);
  });

  /** Prix EUR par actif, stablecoins inclus — utilisé par le portefeuille. */
  readonly priceEur = computed<Record<string, number>>(() => {
    const fx = this.eurUsdt();
    const out: Record<string, number> = { ...STABLECOINS };
    if (fx) {
      out['USDT'] = 1 / fx;
      out['USDC'] = 1 / fx;
    }
    for (const r of this.rows()) out[r.asset] = r.price;
    return out;
  });

  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    const wanted = [...WIGL_ASSETS.map((a) => a + QUOTE), EUR_PAIR];

    this.rest.validSymbols(wanted).pipe(
      switchMap((symbols) => {
        const missing = wanted.filter((s) => !symbols.includes(s));
        if (missing.length) console.warn('[market] symboles introuvables sur Binance :', missing);
        const analysed = symbols.filter((s) => s !== EUR_PAIR);
        return forkJoin({
          tickers: this.rest.tickers24h(symbols),
          candles: this.rest.klinesFor(analysed),
        }).pipe(
          tap(({ tickers, candles }) => {
            this.tickers.set(Object.fromEntries(tickers.map((t) => [t.symbol, t])));
            this.candles.set(candles);
            this.loading.set(false);
            this.lastUpdate.set(Date.now());
          }),
          switchMap(() => this.ws.stream(symbols)),
        );
      }),
      retry({ count: 5, delay: 3000 }), // amorçage REST en échec : on réessaie
      bufferTime(1000),
      filter((batch) => batch.length > 0),
      catchError((err) => {
        console.error(err);
        this.error.set('Impossible de joindre les données de marché Binance.');
        this.loading.set(false);
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((batch) => this.apply(batch));

    // Actifs hors Binance : interrogation périodique de CoinGecko
    timer(0, COINGECKO_POLL_MS).pipe(
      switchMap(() => this.gecko.quotes(COINGECKO_ASSETS).pipe(catchError(() => of(null)))),
      filter((q): q is GeckoQuote[] => q !== null),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((quotes) => {
      this.geckoQuotes.set(Object.fromEntries(quotes.map((q) => [q.asset, q])));
      this.candles.update((prev) => ({
        ...prev,
        ...Object.fromEntries(quotes.map((q) => [q.asset + QUOTE, q.candles])),
      }));
    });
  }

  private apply(batch: MarketEvent[]): void {
    const tickerEvents = batch.filter((e) => e.type === 'ticker');
    const klineEvents = batch.filter((e) => e.type === 'kline');

    if (tickerEvents.length) {
      this.tickers.update((prev) => {
        const next = { ...prev };
        for (const e of tickerEvents) {
          const asset = e.symbol.replace(new RegExp(`${QUOTE}$`), '');
          next[e.symbol] = {
            symbol: e.symbol, asset,
            lastUsdt: e.last, openUsdt: e.open, highUsdt: e.high, lowUsdt: e.low,
            baseVolume: e.baseVolume, quoteVolume: e.quoteVolume, updatedAt: e.time,
          };
        }
        return next;
      });
    }

    if (klineEvents.length) {
      this.candles.update((prev) => {
        const next = { ...prev };
        for (const e of klineEvents) {
          const list = [...(next[e.symbol] ?? [])];
          const last = list.at(-1);
          if (last && last.openTime === e.candle.openTime) list[list.length - 1] = e.candle;
          else list.push(e.candle);
          next[e.symbol] = list.slice(-KLINE_HISTORY);
        }
        return next;
      });
    }

    this.lastUpdate.set(Date.now());
  }
}
