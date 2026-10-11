import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { FEAR_GREED_API } from '../config';
import { DEMO_MODE } from '../data-mode';

export interface FearGreedPoint {
  value: number;          // 0 (peur extrême) → 100 (avidité extrême)
  label: string;          // libellé français
  date: number;           // ms
}

const LABELS: [number, string][] = [
  [25, 'Peur extrême'], [45, 'Peur'], [55, 'Neutre'], [75, 'Avidité'], [101, 'Avidité extrême'],
];
export const fearGreedLabel = (v: number) => LABELS.find(([max]) => v < max)![1];

/** Indice Fear & Greed crypto (alternative.me) : sentiment global du marché. */
@Injectable({ providedIn: 'root' })
export class FearGreedService {
  private readonly http = inject(HttpClient);

  /** Historique quotidien, du plus ancien au plus récent. */
  history(days = 30): Observable<FearGreedPoint[]> {
    if (DEMO_MODE) return of(demoHistory(days));
    return this.http
      .get<{ data: { value: string; timestamp: string }[] }>(FEAR_GREED_API, {
        params: new HttpParams().set('limit', days),
      })
      .pipe(map((r) => r.data
        .map((d) => ({ value: +d.value, label: fearGreedLabel(+d.value), date: +d.timestamp * 1000 }))
        .reverse()));
  }
}

function demoHistory(days: number): FearGreedPoint[] {
  const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  return Array.from({ length: days }, (_, i) => {
    const v = Math.round(52 + 14 * Math.sin(i / 4) + 6 * Math.cos(i / 1.7));
    return { value: v, label: fearGreedLabel(v), date: today - (days - 1 - i) * 86_400_000 };
  });
}
