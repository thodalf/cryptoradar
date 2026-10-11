import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DEMO_MODE } from '../../core/data-mode';
import { NewsStore } from '../../core/state/news.store';
import { PortfolioStore } from '../../core/state/portfolio.store';
import { AgoPipe } from '../../shared/format.pipes';
import { NewsItemView } from '../../shared/news-item';

type Scope = 'all' | 'mine' | 'fr';

@Component({
  selector: 'app-news',
  imports: [MatButtonToggleModule, MatChipsModule, MatIconModule, MatProgressBarModule, AgoPipe, NewsItemView],
  templateUrl: './news.html',
  styleUrl: './news.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class News implements OnInit {
  protected readonly store = inject(NewsStore);
  private readonly portfolio = inject(PortfolioStore);
  protected readonly demo = DEMO_MODE;

  /** Filtre d'actif passé dans l'URL : /actualite?actif=BTC */
  readonly actif = input<string | undefined>();

  protected readonly scope = signal<Scope>('all');
  protected readonly asset = signal<string | null>(null);
  protected readonly topic = signal<string | null>(null);

  protected readonly held = computed(() => this.portfolio.summary().holdings.map((h) => h.asset));

  /** Actifs et thèmes présents dans l'actualité, du plus cité au moins cité. */
  protected readonly assetCounts = computed(() => countBy(this.store.items().flatMap((i) => i.assets)));
  protected readonly topicCounts = computed(() => countBy(this.store.items().flatMap((i) => i.topics)));

  protected readonly filtered = computed(() => {
    const held = new Set(this.held());
    const a = this.asset();
    const t = this.topic();
    return this.store.items().filter((i) =>
      (this.scope() !== 'mine' || i.assets.some((x) => held.has(x))) &&
      (this.scope() !== 'fr' || i.lang === 'fr') &&
      (!a || i.assets.includes(a)) &&
      (!t || i.topics.includes(t)));
  });

  ngOnInit(): void {
    this.store.start();
    const a = this.actif();
    if (a) this.asset.set(a.toUpperCase());
  }

  protected toggleAsset(a: string): void {
    this.asset.update((cur) => (cur === a ? null : a));
  }

  protected toggleTopic(t: string): void {
    this.topic.update((cur) => (cur === t ? null : t));
  }
}

function countBy(list: string[]): { key: string; n: number }[] {
  const m = new Map<string, number>();
  for (const k of list) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}
