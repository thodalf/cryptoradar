import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Mini-graphique SVG sans dépendance (évite une librairie de charts). */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (path(); as p) {
      <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" [attr.width]="width()" [attr.height]="height()"
           role="img" [attr.aria-label]="'Tendance ' + (up() ? 'haussière' : 'baissière')">
        <path [attr.d]="p" fill="none" [attr.stroke]="up() ? 'var(--cr-up)' : 'var(--cr-down)'"
              stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    }
  `,
  styles: `:host { display: inline-flex; vertical-align: middle; }`,
})
export class Sparkline {
  readonly values = input.required<number[]>();
  readonly width = input(96);
  readonly height = input(28);

  protected readonly up = computed(() => {
    const v = this.values();
    return v.length < 2 || v[v.length - 1] >= v[0];
  });

  protected readonly path = computed(() => {
    const v = this.values();
    if (v.length < 2) return null;
    const w = this.width();
    const h = this.height();
    const min = Math.min(...v);
    const max = Math.max(...v);
    const span = max - min || 1;
    return v
      .map((y, i) => {
        const px = (i / (v.length - 1)) * (w - 2) + 1;
        const py = h - 2 - ((y - min) / span) * (h - 4);
        return `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');
  });
}
