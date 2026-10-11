import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Holding } from '../../core/models';
import { EurCompactPipe } from '../../shared/format.pipes';

export const PALETTE = ['#4cc9f0', '#f5b84b', '#3ddc97', '#c77dff', '#ff8fab', '#80ed99', '#ffd166', '#90a4ae'];

/** Donut de répartition en SVG pur (cercles + stroke-dasharray). */
@Component({
  selector: 'app-allocation-donut',
  imports: [EurCompactPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <svg viewBox="0 0 120 120" role="img" aria-label="Répartition du portefeuille">
        <circle cx="60" cy="60" [attr.r]="r" fill="none" stroke="var(--mat-sys-surface-container-highest)" stroke-width="14" />
        @for (s of slices(); track s.asset) {
          <circle cx="60" cy="60" [attr.r]="r" fill="none" [attr.stroke]="s.color" stroke-width="14"
                  [attr.stroke-dasharray]="s.len + ' ' + (circ - s.len)"
                  [attr.stroke-dashoffset]="-s.offset" transform="rotate(-90 60 60)">
            <title>{{ s.asset }} · {{ (s.weight * 100).toFixed(1) }} %</title>
          </circle>
        }
        <text x="60" y="56" text-anchor="middle" class="t-label">Total</text>
        <text x="60" y="72" text-anchor="middle" class="t-value">{{ total() | eurCompact }}</text>
      </svg>
      <ul class="legend">
        @for (s of slices(); track s.asset) {
          <li><span class="sw" [style.background]="s.color"></span>{{ s.asset }}
            <span class="pct">{{ (s.weight * 100).toFixed(1) }} %</span></li>
        }
      </ul>
    </div>
  `,
  styles: `
    .wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; justify-content: center; }
    svg { width: 180px; height: 180px; }
    .t-label { font: 10px Inter, sans-serif; fill: var(--mat-sys-on-surface-variant); }
    .t-value { font: 600 14px 'JetBrains Mono', monospace; fill: var(--mat-sys-on-surface); }
    .legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; min-width: 140px; }
    li { display: flex; align-items: center; gap: 8px; font: var(--mat-sys-body-medium); }
    .sw { width: 10px; height: 10px; border-radius: 3px; flex: none; }
    .pct { margin-left: auto; font-family: var(--cr-mono); color: var(--mat-sys-on-surface-variant); }
  `,
})
export class AllocationDonut {
  readonly holdings = input.required<Holding[]>();
  readonly total = input.required<number>();

  protected readonly r = 46;
  protected readonly circ = 2 * Math.PI * this.r;

  /** Les 7 premières lignes + « Autres » regroupé. */
  protected readonly slices = computed(() => {
    const priced = this.holdings().filter((h) => h.weight > 0);
    const top = priced.slice(0, 7);
    const rest = priced.slice(7).reduce((s, h) => s + h.weight, 0);
    const items = [...top.map((h) => ({ asset: h.asset, weight: h.weight }))];
    if (rest > 0) items.push({ asset: 'Autres', weight: rest });

    let offset = 0;
    return items.map((it, i) => {
      const len = it.weight * this.circ;
      const slice = { ...it, color: PALETTE[i % PALETTE.length], len: Math.max(len - 1, 0), offset };
      offset += len;
      return slice;
    });
  });
}
