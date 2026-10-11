import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Transaction } from '../models';
import { ImportResult, parseTransactionsCsv, toCsv } from '../portfolio/csv-import';
import { computePortfolio } from '../portfolio/holdings';
import { readLocal, writeLocal } from '../storage';
import { MarketStore } from './market.store';

const KEY = 'cr.transactions';

/**
 * Portefeuille alimenté par import CSV (Wigl n'ayant pas d'API publique).
 * Pour brancher une vraie API plus tard, il suffit d'alimenter `transactions`
 * depuis un service HTTP : tout le reste (positions, P&L, graphiques) suit.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioStore {
  private readonly market = inject(MarketStore);

  readonly transactions = signal<Transaction[]>(readLocal<Transaction[]>(KEY, []));

  readonly summary = computed(() => computePortfolio(this.transactions(), this.market.priceEur()));

  /** Allocation cible en % par actif (somme idéalement = 100). */
  readonly targets = signal<Record<string, number>>(readLocal<Record<string, number>>('cr.targets', {}));
  readonly targetsTotal = computed(() => Object.values(this.targets()).reduce((a, b) => a + b, 0));

  /** Écarts à l'allocation cible et montants pour rééquilibrer. */
  readonly rebalance = computed(() => {
    const s = this.summary();
    const t = this.targets();
    const assets = new Set([...s.holdings.filter((h) => h.value).map((h) => h.asset), ...Object.keys(t)]);
    return [...assets].map((asset) => {
      const h = s.holdings.find((x) => x.asset === asset);
      const current = h?.weight ?? 0;
      const target = (t[asset] ?? 0) / 100;
      const amount = (target - current) * s.totalValue; // >0 acheter, <0 vendre
      return { asset, current, target, drift: current - target, amount, price: h?.price ?? null };
    }).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  });
  readonly isEmpty = computed(() => this.transactions().length === 0);

  constructor() {
    effect(() => writeLocal(KEY, this.transactions()));
    effect(() => writeLocal('cr.targets', this.targets()));
  }

  /** Importe un CSV ; `replace` remplace l'historique, sinon fusionne sans doublons. */
  importCsv(text: string, replace: boolean): ImportResult {
    const result = parseTransactionsCsv(text);
    if (result.transactions.length) {
      this.transactions.update((prev) => {
        if (replace) return result.transactions;
        const seen = new Set(prev.map(signature));
        return [...prev, ...result.transactions.filter((t) => !seen.has(signature(t)))];
      });
    }
    return result;
  }

  setTarget(asset: string, pct: number | null): void {
    this.targets.update((t) => {
      const next = { ...t };
      if (pct === null || !Number.isFinite(pct) || pct <= 0) delete next[asset];
      else next[asset] = Math.min(100, pct);
      return next;
    });
  }

  /** Cible = répartition actuelle (point de départ pratique). */
  targetsFromCurrent(): void {
    this.targets.set(Object.fromEntries(this.summary().holdings
      .filter((h) => h.weight > 0.001).map((h) => [h.asset, Math.round(h.weight * 1000) / 10])));
  }

  add(tx: Omit<Transaction, 'id'>): void {
    this.transactions.update((prev) => [...prev, { ...tx, id: crypto.randomUUID() }]);
  }

  remove(id: string): void {
    this.transactions.update((prev) => prev.filter((t) => t.id !== id));
  }

  clear(): void {
    this.transactions.set([]);
  }

  exportCsv(): string {
    return toCsv(this.transactions());
  }
}

const signature = (t: Transaction) => `${t.date}|${t.type}|${t.asset}|${t.quantity}|${t.priceEur}`;
