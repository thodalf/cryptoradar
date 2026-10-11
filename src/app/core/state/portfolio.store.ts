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
  readonly isEmpty = computed(() => this.transactions().length === 0);

  constructor() {
    effect(() => writeLocal(KEY, this.transactions()));
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
