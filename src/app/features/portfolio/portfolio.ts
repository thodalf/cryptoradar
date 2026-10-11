import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ASSET_NAMES, WIGL_ASSETS } from '../../core/config';
import { Transaction, TxType } from '../../core/models';
import { PortfolioStore } from '../../core/state/portfolio.store';
import { SAMPLE_CSV } from '../../core/portfolio/sample-csv';
import { saveTextFile } from '../../core/save-file';
import { EurPipe, PctPipe, QtyPipe } from '../../shared/format.pipes';
import { AllocationDonut, PALETTE } from './allocation-donut';

@Component({
  selector: 'app-portfolio',
  imports: [
    DatePipe, ReactiveFormsModule,
    MatButtonModule, MatButtonToggleModule, MatExpansionModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatMenuModule, MatPaginatorModule, MatSelectModule, MatSnackBarModule,
    MatSortModule, MatTableModule, MatTooltipModule,
    EurPipe, PctPipe, QtyPipe, AllocationDonut,
  ],
  templateUrl: './portfolio.html',
  styleUrl: './portfolio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Portfolio {
  protected readonly store = inject(PortfolioStore);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  protected readonly names = ASSET_NAMES;
  protected readonly assets = [...WIGL_ASSETS, 'USDC', 'USDT', 'EURC'];
  protected readonly palette = PALETTE;
  protected readonly summary = this.store.summary;
  protected readonly Math = Math;

  protected readonly holdingColumns = ['asset', 'quantity', 'avgCost', 'price', 'value', 'pnl', 'weight'];
  protected readonly txColumns = ['date', 'type', 'asset', 'quantity', 'priceEur', 'total', 'feeEur', 'actions'];

  protected readonly txSource = new MatTableDataSource<Transaction>([]);
  private readonly sort = viewChild(MatSort);
  private readonly paginator = viewChild(MatPaginator);

  protected readonly replaceOnImport = signal(false);
  protected readonly typeFilter = signal<TxType | 'all'>('all');

  protected readonly txTypes: TxType[] = ['buy', 'sell', 'deposit', 'withdraw', 'reward'];
  protected readonly typeLabel: Record<string, string> = {
    buy: 'Achat', sell: 'Vente', deposit: 'Dépôt', withdraw: 'Retrait', reward: 'Récompense',
  };

  protected readonly pnlPct = computed(() => {
    const s = this.summary();
    return s.totalInvested > 0 ? (s.unrealizedPnl / s.totalInvested) * 100 : null;
  });

  protected readonly form = this.fb.nonNullable.group({
    date: [new Date().toISOString().slice(0, 16), Validators.required],
    type: ['buy' as TxType, Validators.required],
    asset: ['BTC', Validators.required],
    quantity: [0, [Validators.required, Validators.min(0.000000001)]],
    priceEur: [0, Validators.min(0)],
    feeEur: [0, Validators.min(0)],
  });

  constructor() {
    this.txSource.sortingDataAccessor = (t, col) =>
      col === 'total' ? t.quantity * (t.priceEur ?? 0) : ((t as unknown as Record<string, string | number>)[col] ?? '');

    effect(() => {
      const f = this.typeFilter();
      const txs = this.store.transactions();
      this.txSource.data = f === 'all' ? txs : txs.filter((t) => t.type === f);
    });
    effect(() => {
      const sort = this.sort();
      const pag = this.paginator();
      if (sort) this.txSource.sort = sort;
      if (pag) this.txSource.paginator = pag;
    });
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5_000_000) {
      this.snack.open('Fichier trop volumineux (5 Mo max).', 'OK', { duration: 4000 });
      return;
    }
    const text = await file.text();
    const res = this.store.importCsv(text, this.replaceOnImport());
    const ok = res.transactions.length;
    const ko = res.errors.length;
    if (!ok && ko) console.warn('[import]', res.errors);
    this.snack.open(
      ok ? `${ok} transaction(s) importée(s)${ko ? ` · ${ko} ligne(s) ignorée(s) (détail en console)` : ''}`
         : res.errors[0] ?? 'Aucune transaction trouvée.',
      'OK',
      { duration: ko ? 8000 : 4000 },
    );
    if (ko) console.table(res.errors);
  }

  protected exportCsv(): void {
    void saveTextFile(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, this.store.exportCsv())
      .catch(() => this.snack.open('Téléchargement refusé.', undefined, { duration: 3000 }));
  }

  protected downloadTemplate(): void {
    void saveTextFile('modele-transactions.csv', SAMPLE_CSV)
      .catch(() => this.snack.open('Téléchargement refusé.', undefined, { duration: 3000 }));
  }

  protected loadSample(): void {
    const res = this.store.importCsv(SAMPLE_CSV, true);
    this.snack.open(`Exemple chargé : ${res.transactions.length} transactions fictives.`, undefined, { duration: 3000 });
  }

  protected addTransaction(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.store.add({
      date: new Date(v.date).toISOString(),
      type: v.type,
      asset: v.asset.toUpperCase(),
      quantity: v.quantity,
      priceEur: v.priceEur || null,
      feeEur: v.feeEur || 0,
    });
    this.form.patchValue({ quantity: 0, priceEur: 0, feeEur: 0 });
    this.snack.open('Transaction ajoutée.', undefined, { duration: 2000 });
  }

  protected remove(t: Transaction): void {
    this.store.remove(t.id);
    this.snack.open(`Transaction ${t.asset} supprimée.`, 'Annuler', { duration: 5000 })
      .onAction().subscribe(() => this.store.add({ ...t }));
  }

  protected clearAll(): void {
    const backup = this.store.transactions();
    this.store.clear();
    this.snack.open('Historique vidé.', 'Annuler', { duration: 8000 })
      .onAction().subscribe(() => this.store.transactions.set(backup));
  }
}
