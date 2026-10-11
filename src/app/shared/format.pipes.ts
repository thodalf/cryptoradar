import { Pipe, PipeTransform } from '@angular/core';

const eurCache = new Map<number, Intl.NumberFormat>();
function eurFormatter(decimals: number): Intl.NumberFormat {
  let f = eurCache.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'EUR',
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    });
    eurCache.set(decimals, f);
  }
  return f;
}

/** Prix en euros avec une précision adaptée à l'ordre de grandeur (0,000012 € comme 64 230 €). */
@Pipe({ name: 'eur' })
export class EurPipe implements PipeTransform {
  transform(v: number | null | undefined, mode: 'price' | 'amount' = 'price'): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    if (mode === 'amount') return eurFormatter(2).format(v);
    const abs = Math.abs(v);
    const decimals = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
    return eurFormatter(decimals).format(v);
  }
}

const compactEur = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1,
});

@Pipe({ name: 'eurCompact' })
export class EurCompactPipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return v === null || v === undefined || !Number.isFinite(v) ? '—' : compactEur.format(v);
  }
}

const pctFmt = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero',
});

@Pipe({ name: 'pct' })
export class PctPipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return v === null || v === undefined || !Number.isFinite(v) ? '—' : `${pctFmt.format(v)} %`;
  }
}

const qtyFmt = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 8 });

@Pipe({ name: 'qty' })
export class QtyPipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return v === null || v === undefined ? '—' : qtyFmt.format(v);
  }
}
