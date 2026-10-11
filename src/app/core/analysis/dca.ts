import { Candle } from '../models';

export interface DcaParams {
  amount: number;          // € par achat
  everyDays: number;       // 7 = hebdomadaire, 30 = mensuel
  months: number;          // durée simulée
  feePct: number;          // frais par achat, en %
}

export interface DcaPoint { t: number; invested: number; value: number }

export interface DcaResult {
  points: DcaPoint[];
  buys: number;
  invested: number;
  quantity: number;
  value: number;
  gainPct: number;
  avgPrice: number;
  /** Même budget total investi en une fois au premier achat. */
  lumpSumValue: number;
  lumpSumGainPct: number;
  maxDrawdownPct: number;  // pire recul de la valeur sous le montant investi
}

/**
 * Rejoue un investissement programmé sur l'historique journalier.
 * `closesEur` : clôtures journalières déjà converties en euros.
 */
export function simulateDca(candles: Candle[], closesEur: number[], p: DcaParams): DcaResult | null {
  const days = Math.round(p.months * 30.44);
  const start = Math.max(0, closesEur.length - days);
  if (closesEur.length - start < 2 || p.amount <= 0) return null;

  const fee = 1 - p.feePct / 100;
  let qty = 0;
  let invested = 0;
  let buys = 0;
  let worst = 0;
  const points: DcaPoint[] = [];

  for (let i = start; i < closesEur.length; i++) {
    const price = closesEur[i];
    if ((i - start) % p.everyDays === 0) {
      qty += (p.amount * fee) / price;
      invested += p.amount;
      buys++;
    }
    const value = qty * price;
    worst = Math.min(worst, invested ? (value - invested) / invested : 0);
    points.push({ t: candles[i].openTime, invested, value });
  }

  const last = closesEur[closesEur.length - 1];
  const value = qty * last;
  const lumpQty = (invested * fee) / closesEur[start];
  const lumpSumValue = lumpQty * last;
  return {
    points, buys, invested, quantity: qty, value,
    gainPct: ((value - invested) / invested) * 100,
    avgPrice: invested / (qty / fee),
    lumpSumValue,
    lumpSumGainPct: ((lumpSumValue - invested) / invested) * 100,
    maxDrawdownPct: worst * 100,
  };
}
