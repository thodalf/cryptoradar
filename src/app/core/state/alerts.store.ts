import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { readLocal, writeLocal } from '../storage';
import { MarketStore } from './market.store';

export type AlertKind = 'above' | 'below' | 'up24h' | 'down24h' | 'rsiBelow' | 'rsiAbove';

export interface PriceAlert {
  id: string;
  asset: string;
  kind: AlertKind;
  value: number;
  note?: string;
  createdAt: number;
  triggeredAt: number | null;
  triggeredPrice: number | null;
}

export const ALERT_KINDS: { kind: AlertKind; label: string; unit: string }[] = [
  { kind: 'above', label: 'Le prix passe au-dessus de', unit: '€' },
  { kind: 'below', label: 'Le prix passe en dessous de', unit: '€' },
  { kind: 'up24h', label: 'La hausse sur 24h dépasse', unit: '%' },
  { kind: 'down24h', label: 'La baisse sur 24h dépasse', unit: '%' },
  { kind: 'rsiBelow', label: 'Le RSI 1h descend sous', unit: '' },
  { kind: 'rsiAbove', label: 'Le RSI 1h monte au-dessus de', unit: '' },
];

const KEY = 'cr.alerts';

/**
 * Alertes de prix : évaluées à chaque mise à jour du marché tant que l'app est
 * ouverte (pas de serveur). Une alerte déclenchée se désactive ; on peut la réarmer.
 */
@Injectable({ providedIn: 'root' })
export class AlertsStore {
  private readonly market = inject(MarketStore);
  private readonly snack = inject(MatSnackBar);

  readonly alerts = signal<PriceAlert[]>(readLocal<PriceAlert[]>(KEY, []));
  readonly active = computed(() => this.alerts().filter((a) => a.triggeredAt === null));
  readonly triggered = computed(() =>
    this.alerts().filter((a) => a.triggeredAt !== null).sort((a, b) => b.triggeredAt! - a.triggeredAt!));
  /** Alertes déclenchées non encore vues (pastille du menu). */
  readonly unseen = signal(0);

  readonly notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;
  readonly notificationPermission = signal<NotificationPermission | 'unsupported'>(
    this.notificationsSupported ? Notification.permission : 'unsupported',
  );

  constructor() {
    effect(() => writeLocal(KEY, this.alerts()));

    effect(() => {
      const rows = this.market.rows();
      const pending = untracked(() => this.active());
      if (!rows.length || !pending.length) return;
      const byAsset = new Map(rows.map((r) => [r.asset, r]));
      const hits: { id: string; price: number }[] = [];
      for (const a of pending) {
        const r = byAsset.get(a.asset);
        if (!r) continue;
        const ok =
          (a.kind === 'above' && r.price >= a.value) ||
          (a.kind === 'below' && r.price <= a.value) ||
          (a.kind === 'up24h' && r.change24h >= a.value) ||
          (a.kind === 'down24h' && r.change24h <= -a.value) ||
          (a.kind === 'rsiBelow' && r.rsi !== null && r.rsi <= a.value) ||
          (a.kind === 'rsiAbove' && r.rsi !== null && r.rsi >= a.value);
        if (ok) hits.push({ id: a.id, price: r.price });
      }
      if (hits.length) untracked(() => this.fire(hits));
    });
  }

  add(a: Pick<PriceAlert, 'asset' | 'kind' | 'value' | 'note'>): void {
    this.alerts.update((list) => [
      ...list,
      { ...a, id: crypto.randomUUID(), createdAt: Date.now(), triggeredAt: null, triggeredPrice: null },
    ]);
  }

  remove(id: string): void {
    this.alerts.update((list) => list.filter((a) => a.id !== id));
  }

  rearm(id: string): void {
    this.alerts.update((list) => list.map((a) => (a.id === id ? { ...a, triggeredAt: null, triggeredPrice: null } : a)));
  }

  clearTriggered(): void {
    this.alerts.update((list) => list.filter((a) => a.triggeredAt === null));
  }

  async requestNotifications(): Promise<void> {
    if (!this.notificationsSupported) return;
    try {
      this.notificationPermission.set(await Notification.requestPermission());
    } catch {
      this.notificationPermission.set('denied');
    }
  }

  describe(a: PriceAlert): string {
    const k = ALERT_KINDS.find((x) => x.kind === a.kind)!;
    const v = k.unit === '€'
      ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumSignificantDigits: 6 }).format(a.value)
      : `${a.value}${k.unit ? ' ' + k.unit : ''}`;
    return `${a.asset} : ${k.label.toLowerCase()} ${v}`;
  }

  private fire(hits: { id: string; price: number }[]): void {
    const now = Date.now();
    const ids = new Map(hits.map((h) => [h.id, h.price]));
    this.alerts.update((list) => list.map((a) =>
      ids.has(a.id) ? { ...a, triggeredAt: now, triggeredPrice: ids.get(a.id)! } : a));
    this.unseen.update((n) => n + hits.length);

    const fired = this.alerts().filter((a) => ids.has(a.id));
    const text = fired.map((a) => this.describe(a)).join(' · ');
    this.snack.open(`Alerte : ${text}`, 'OK', { duration: 10_000 });
    if (this.notificationPermission() === 'granted') {
      for (const a of fired) {
        try { new Notification('Crypto Radar', { body: this.describe(a), tag: a.id }); } catch { /* ignoré */ }
      }
    }
  }
}
