import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ALERT_KINDS, AlertKind, AlertsStore, PriceAlert } from '../../core/state/alerts.store';
import { MarketStore } from '../../core/state/market.store';
import { EurPipe, PctPipe } from '../../shared/format.pipes';

@Component({
  selector: 'app-alerts',
  imports: [
    DatePipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatSelectModule, MatTooltipModule, EurPipe, PctPipe,
  ],
  templateUrl: './alerts.html',
  styleUrl: './alerts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Alerts implements OnInit {
  protected readonly store = inject(AlertsStore);
  protected readonly market = inject(MarketStore);
  protected readonly kinds = ALERT_KINDS;

  protected readonly assets = computed(() => this.market.rows().map((r) => r.asset).sort());

  protected readonly form = inject(FormBuilder).nonNullable.group({
    asset: ['BTC', Validators.required],
    kind: ['above' as AlertKind, Validators.required],
    value: [0, [Validators.required, Validators.min(0)]],
    note: [''],
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Ligne de marché de l'actif choisi, pour pré-remplir et contextualiser. */
  protected readonly current = computed(() => {
    const a = this.formValue().asset;
    return this.market.rows().find((r) => r.asset === a) ?? null;
  });

  protected readonly unit = computed(() => ALERT_KINDS.find((k) => k.kind === this.formValue().kind)?.unit ?? '');

  ngOnInit(): void {
    this.store.unseen.set(0);
    this.suggest();
  }

  /** Propose une valeur de départ raisonnable selon le type d'alerte. */
  protected suggest(): void {
    const { kind } = this.form.getRawValue();
    const r = this.current();
    const value =
      kind === 'above' ? round(r ? r.price * 1.05 : 0)
      : kind === 'below' ? round(r ? r.price * 0.95 : 0)
      : kind === 'up24h' || kind === 'down24h' ? 8
      : kind === 'rsiBelow' ? 30 : 70;
    this.form.patchValue({ value });
  }

  protected add(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.store.add({ asset: v.asset, kind: v.kind, value: v.value, note: v.note.trim() || undefined });
  }

  protected distance(a: PriceAlert): string | null {
    const r = this.market.rows().find((x) => x.asset === a.asset);
    if (!r) return null;
    if (a.kind === 'above' || a.kind === 'below') {
      const d = ((a.value - r.price) / r.price) * 100;
      return `${d > 0 ? '+' : ''}${d.toFixed(1)} % du cours`;
    }
    if (a.kind === 'up24h' || a.kind === 'down24h') return `24h actuel : ${r.change24h.toFixed(1)} %`;
    return r.rsi === null ? null : `RSI actuel : ${r.rsi.toFixed(0)}`;
  }
}

function round(x: number): number {
  if (!x) return 0;
  const digits = Math.max(0, 3 - Math.floor(Math.log10(x)));
  return +x.toFixed(Math.min(digits, 8));
}
