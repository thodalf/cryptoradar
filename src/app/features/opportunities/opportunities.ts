import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSliderModule } from '@angular/material/slider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ASSET_NAMES, QUOTE } from '../../core/config';
import { SignalSide, Thresholds } from '../../core/models';
import { MarketStore } from '../../core/state/market.store';
import { OpportunitiesStore } from '../../core/state/opportunities.store';
import { EurPipe, PctPipe } from '../../shared/format.pipes';
import { Sparkline } from '../../shared/sparkline';

type Filter = 'all' | SignalSide;

@Component({
  selector: 'app-opportunities',
  imports: [
    FormsModule, MatButtonModule, MatButtonToggleModule, MatExpansionModule, MatIconModule,
    MatProgressBarModule, MatSliderModule, MatSlideToggleModule, MatTooltipModule,
    EurPipe, PctPipe, Sparkline,
  ],
  templateUrl: './opportunities.html',
  styleUrl: './opportunities.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Opportunities {
  protected readonly store = inject(OpportunitiesStore);
  protected readonly market = inject(MarketStore);
  protected readonly names = ASSET_NAMES;

  protected readonly filter = signal<Filter>('all');
  protected readonly showQuiet = signal(false);

  protected readonly list = computed(() => {
    const f = this.filter();
    const source = this.showQuiet() ? this.store.all() : this.store.active();
    return f === 'all' ? source : source.filter((o) => o.side === f);
  });

  /** Clôtures 24h pour la mini-courbe de chaque carte. */
  protected readonly sparks = computed(() => {
    const c = this.market.candles();
    return (asset: string) => (c[asset + QUOTE] ?? []).slice(-24).map((k) => k.close);
  });

  protected readonly sideLabel: Record<SignalSide, string> = {
    buy: 'Achat potentiel',
    sell: 'Vente potentielle',
    watch: 'À surveiller',
  };
  protected readonly sideIcon: Record<SignalSide, string> = {
    buy: 'trending_up',
    sell: 'trending_down',
    watch: 'visibility',
  };

  protected setThreshold<K extends keyof Thresholds>(key: K, value: number): void {
    this.store.thresholds.update((t) => ({ ...t, [key]: value }));
  }
}
