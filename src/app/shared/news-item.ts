import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NewsItem } from '../core/models';
import { AgoPipe } from './format.pipes';

/** Un article : source, date relative, titre (lien externe), résumé, actifs cités. */
@Component({
  selector: 'app-news-item',
  imports: [AgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="item" [class.compact]="compact()">
      <div class="meta">
        <span class="source">{{ item().source }}</span>
        <span class="dot">·</span>
        <time [attr.datetime]="iso()">{{ item().publishedAt | ago }}</time>
        @if (item().lang === 'en') { <span class="lang">EN</span> }
      </div>
      <a class="title" [href]="item().url" target="_blank" rel="noopener noreferrer">{{ item().title }}</a>
      @if (!compact() && item().summary) { <p class="summary">{{ item().summary }}</p> }
      @if (item().assets.length || (!compact() && item().topics.length)) {
        <div class="tags">
          @for (a of item().assets; track a) {
            <button type="button" class="tag asset" [class.held]="held().includes(a)"
                    (click)="assetClick.emit(a)">{{ a }}</button>
          }
          @if (!compact()) {
            @for (t of item().topics; track t) { <span class="tag topic">{{ t }}</span> }
          }
        </div>
      }
    </article>
  `,
  styles: `
    .item { display: flex; flex-direction: column; gap: 6px; padding: 14px 0; border-top: 1px solid var(--mat-sys-outline-variant); }
    .compact { padding: 10px 0; gap: 4px; }
    .meta { display: flex; align-items: center; gap: 6px; font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); }
    .source { color: var(--mat-sys-primary); }
    .lang { font-size: 10px; padding: 0 5px; border-radius: 4px; border: 1px solid var(--mat-sys-outline-variant); }
    .title {
      font: var(--mat-sys-title-small); color: var(--mat-sys-on-surface); text-decoration: none;
      text-wrap: pretty;
      &:hover { text-decoration: underline; text-underline-offset: 3px; }
      &:focus-visible { outline: 2px solid var(--mat-sys-primary); outline-offset: 2px; border-radius: 4px; }
    }
    .compact .title { font: var(--mat-sys-body-medium); }
    .summary { margin: 0; font: var(--mat-sys-body-medium); color: var(--mat-sys-on-surface-variant); max-width: 75ch; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag {
      font: var(--mat-sys-label-small); padding: 2px 8px; border-radius: 999px;
      border: 1px solid var(--mat-sys-outline-variant); background: transparent; color: var(--mat-sys-on-surface-variant);
    }
    .asset { cursor: pointer; font-family: var(--cr-mono); }
    .asset:hover { border-color: var(--mat-sys-primary); color: var(--mat-sys-primary); }
    .held { color: var(--mat-sys-primary); border-color: color-mix(in srgb, var(--mat-sys-primary) 50%, transparent); }
  `,
})
export class NewsItemView {
  readonly item = input.required<NewsItem>();
  readonly compact = input(false);
  /** Actifs détenus, mis en évidence. */
  readonly held = input<string[]>([]);
  readonly assetClick = output<string>();

  protected iso(): string {
    return new Date(this.item().publishedAt).toISOString();
  }
}
