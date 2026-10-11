import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { EXEMPTION_THRESHOLD, TaxYear } from '../../core/portfolio/tax';
import { PortfolioStore } from '../../core/state/portfolio.store';
import { DEFAULT_TAX_RATE, TaxStore } from '../../core/state/tax.store';
import { saveTextFile } from '../../core/save-file';
import { EurPipe, QtyPipe } from '../../shared/format.pipes';

@Component({
  selector: 'app-tax',
  imports: [
    DatePipe, RouterLink, MatButtonModule, MatExpansionModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatProgressBarModule, MatTooltipModule, EurPipe, QtyPipe,
  ],
  templateUrl: './tax.html',
  styleUrl: './tax.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tax implements OnInit {
  protected readonly store = inject(TaxStore);
  protected readonly portfolio = inject(PortfolioStore);
  protected readonly threshold = EXEMPTION_THRESHOLD;
  protected readonly defaultRate = DEFAULT_TAX_RATE;

  ngOnInit(): void {
    if (this.store.status() === 'idle') this.store.valuate();
  }

  protected setRate(raw: string): void {
    const pct = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) this.store.rate.set(pct / 100);
  }

  protected setOverride(txId: string, raw: string): void {
    const v = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
    this.store.setOverride(txId, raw.trim() ? v : null);
  }

  /** Récapitulatif au format du formulaire 2086 (une ligne par cession). */
  protected export2086(y: TaxYear): void {
    const fmt = (n: number | null) => (n === null ? '' : n.toFixed(2).replace('.', ','));
    const head = 'date;actif;valeur globale du portefeuille;prix de cession;frais de cession;' +
      'prix de cession net;prix total d\'acquisition;fraction imputée;plus ou moins-value';
    const lines = y.lines.map((l) => [
      l.tx.date.slice(0, 10), l.tx.asset, fmt(l.portfolioValue), fmt(l.grossPrice), fmt(l.fees),
      fmt(l.netPrice), fmt(l.acquisitionTotal), fmt(l.acquisitionShare), fmt(l.gain),
    ].join(';'));
    void saveTextFile(`2086-${y.year}.csv`, [head, ...lines].join('\n'));
  }
}
