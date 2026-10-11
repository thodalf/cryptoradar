import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DEFAULT_THRESHOLDS, detect } from '../analysis/opportunity-detector';
import { QUOTE } from '../config';
import { Opportunity, Thresholds } from '../models';
import { readLocal, writeLocal } from '../storage';
import { MarketStore } from './market.store';

const KEY = 'cr.thresholds';

@Injectable({ providedIn: 'root' })
export class OpportunitiesStore {
  private readonly market = inject(MarketStore);

  readonly thresholds = signal<Thresholds>({ ...DEFAULT_THRESHOLDS, ...readLocal<Partial<Thresholds>>(KEY, {}) });

  /** Tous les actifs analysés, triés par intensité du signal. */
  readonly all = computed<Opportunity[]>(() => {
    const t = this.thresholds();
    const candles = this.market.candles();
    return this.market
      .rows()
      .map((row) => detect(row.asset, candles[row.asset + QUOTE] ?? [], row.price, row.change24h, t))
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || b.signals.length - a.signals.length);
  });

  /** Uniquement les actifs qui déclenchent au moins un signal. */
  readonly active = computed(() => this.all().filter((o) => o.signals.length > 0));

  readonly counts = computed(() => {
    const a = this.active();
    return {
      buy: a.filter((o) => o.side === 'buy').length,
      sell: a.filter((o) => o.side === 'sell').length,
      watch: a.filter((o) => o.side === 'watch').length,
    };
  });

  constructor() {
    effect(() => writeLocal(KEY, this.thresholds()));
  }

  reset(): void {
    this.thresholds.set({ ...DEFAULT_THRESHOLDS });
  }
}
