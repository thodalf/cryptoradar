import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ASSET_NAMES } from '../../core/config';
import { MarketRow } from '../../core/models';
import { MarketStore } from '../../core/state/market.store';
import { FearGreedService } from '../../core/api/fear-greed.service';
import { NewsStore } from '../../core/state/news.store';
import { NewsItemView } from '../../shared/news-item';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { EurCompactPipe, EurPipe, PctPipe } from '../../shared/format.pipes';
import { Sparkline } from '../../shared/sparkline';

@Component({
  selector: 'app-dashboard',
  imports: [
    FormsModule, MatTableModule, MatSortModule, MatFormFieldModule, MatInputModule,
    MatIconModule, MatProgressBarModule, MatTooltipModule,
    EurPipe, EurCompactPipe, PctPipe, Sparkline, NewsItemView, RouterLink,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly market = inject(MarketStore);
  protected readonly news = inject(NewsStore);
  protected readonly names = ASSET_NAMES;
  protected readonly columns = ['asset', 'price', 'change24h', 'range', 'volume24h', 'rsi', 'spark'];

  protected readonly query = signal('');

  /** Sentiment global du marché sur 30 jours (null si l'API ne répond pas). */
  protected readonly fearGreed = toSignal(
    inject(FearGreedService).history(30).pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  protected readonly fgNow = computed(() => this.fearGreed()?.at(-1) ?? null);
  protected readonly fgSpark = computed(() => this.fearGreed()?.map((p) => p.value) ?? []);
  protected readonly dataSource = new MatTableDataSource<MarketRow>([]);
  private readonly sort = viewChild(MatSort);

  /** Sens du dernier mouvement de prix par actif, pour l'effet de « flash ». */
  protected readonly flash = signal<Record<string, 'up' | 'down'>>({});
  private previous = new Map<string, number>();

  protected readonly kpis = computed(() => {
    const rows = this.market.rows();
    if (!rows.length) return null;
    const byChange = [...rows].sort((a, b) => b.change24h - a.change24h);
    const avg = rows.reduce((s, r) => s + r.change24h, 0) / rows.length;
    return {
      best: byChange[0],
      worst: byChange.at(-1)!,
      avgChange: avg,
      volume: rows.reduce((s, r) => s + r.volume24h, 0),
      breadth: rows.filter((r) => r.change24h > 0).length,
      total: rows.length,
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    let timer: ReturnType<typeof setTimeout> | undefined;
    destroyRef.onDestroy(() => clearTimeout(timer));

    this.dataSource.filterPredicate = (row, q) =>
      row.asset.toLowerCase().includes(q) || (this.names[row.asset] ?? '').toLowerCase().includes(q);

    effect(() => {
      const rows = this.market.rows();
      this.dataSource.data = rows;

      const moved: Record<string, 'up' | 'down'> = {};
      for (const r of rows) {
        const before = this.previous.get(r.asset);
        if (before !== undefined && before !== r.price) moved[r.asset] = r.price > before ? 'up' : 'down';
        this.previous.set(r.asset, r.price);
      }
      if (Object.keys(moved).length) {
        this.flash.set(moved);
        clearTimeout(timer);
        timer = setTimeout(() => this.flash.set({}), 700);
      }
    });

    effect(() => {
      const sort = this.sort();
      if (sort) this.dataSource.sort = sort;
    });

    effect(() => {
      this.dataSource.filter = this.query().trim().toLowerCase();
    });
  }

  /** Position du prix courant dans la fourchette 24h (0 = plus bas, 100 = plus haut). */
  protected rangePos(r: MarketRow): number {
    const span = r.high24h - r.low24h;
    return span > 0 ? ((r.price - r.low24h) / span) * 100 : 50;
  }

  protected rsiClass(v: number | null): string {
    if (v === null) return '';
    return v <= 30 ? 'rsi rsi--low' : v >= 70 ? 'rsi rsi--high' : 'rsi';
  }
}
