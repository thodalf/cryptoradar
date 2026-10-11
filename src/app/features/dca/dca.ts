import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { BinanceRestService } from '../../core/api/binance-rest.service';
import { simulateDca } from '../../core/analysis/dca';
import { EUR_PAIR, QUOTE } from '../../core/config';
import { Candle } from '../../core/models';
import { MarketStore } from '../../core/state/market.store';
import { EurPipe, PctPipe, QtyPipe } from '../../shared/format.pipes';

interface Series { candles: Candle[]; eur: number[] }

@Component({
  selector: 'app-dca',
  imports: [
    DatePipe, FormsModule, MatButtonToggleModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressBarModule, MatSelectModule, MatSliderModule, EurPipe, PctPipe, QtyPipe,
  ],
  templateUrl: './dca.html',
  styleUrl: './dca.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dca {
  private readonly rest = inject(BinanceRestService);
  protected readonly market = inject(MarketStore);

  protected readonly asset = signal('BTC');
  protected readonly amount = signal(100);
  protected readonly everyDays = signal(30);
  protected readonly months = signal(24);
  protected readonly feePct = signal(1);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Seuls les actifs Binance ont un historique journalier long. */
  protected readonly assets = computed(() =>
    this.market.rows().filter((r) => r.source === 'binance').map((r) => r.asset).sort());

  /** Historique journalier converti en euros, rechargé quand l'actif change. */
  private readonly series = toSignal(
    toObservable(this.asset).pipe(
      tap(() => { this.loading.set(true); this.error.set(null); }),
      switchMap((a) => forkJoin({
        coin: this.rest.dailyKlines(a + QUOTE),
        fx: this.rest.dailyKlines(EUR_PAIR),
      }).pipe(
        map(({ coin, fx }): Series => {
          const fxByDay = new Map(fx.map((k) => [k.openTime, k.close]));
          const lastFx = fx.at(-1)?.close ?? 1.16;
          return { candles: coin, eur: coin.map((k) => k.close / (fxByDay.get(k.openTime) ?? lastFx)) };
        }),
        catchError(() => { this.error.set('Historique indisponible pour cet actif.'); return of(null); }),
      )),
      tap(() => this.loading.set(false)),
    ),
    { initialValue: null },
  );

  protected readonly maxMonths = computed(() => Math.max(1, Math.floor((this.series()?.eur.length ?? 1000) / 30.44)));

  protected readonly result = computed(() => {
    const s = this.series();
    if (!s) return null;
    return simulateDca(s.candles, s.eur, {
      amount: this.amount(), everyDays: this.everyDays(),
      months: Math.min(this.months(), this.maxMonths()), feePct: this.feePct(),
    });
  });

  /** Tracé SVG : valeur du portefeuille vs montant investi. */
  protected readonly chart = computed(() => {
    const r = this.result();
    if (!r || r.points.length < 2) return null;
    const W = 720, H = 240, P = 8;
    const max = Math.max(...r.points.map((p) => Math.max(p.value, p.invested))) * 1.05;
    const n = r.points.length - 1;
    const x = (i: number) => P + (i / n) * (W - 2 * P);
    const y = (v: number) => H - P - (v / max) * (H - 2 * P);
    const line = (key: 'value' | 'invested') =>
      r.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    const valueLine = line('value');
    const area = `${valueLine} L${x(n).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
    const ticks = [0.25, 0.5, 0.75, 1].map((f) => ({ y: y(max * f / 1.05), label: max * f / 1.05 }));
    return {
      W, H, valueLine, area, investedLine: line('invested'), ticks,
      start: r.points[0].t, end: r.points[n].t,
      endX: x(n), endY: y(r.points[n].value),
    };
  });
}
