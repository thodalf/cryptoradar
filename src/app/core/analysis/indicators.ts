/**
 * Indicateurs techniques — fonctions pures, sans dépendance Angular,
 * donc faciles à tester et à déplacer dans un Web Worker si besoin.
 */

/** RSI de Wilder. Retourne null si l'historique est trop court. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Ratio entre le volume de la dernière bougie et la moyenne des `lookback`
 * bougies précédentes (ex. dernière heure vs moyenne des 24h d'avant).
 * La bougie en cours est extrapolée au prorata du temps écoulé.
 */
export function volumeRatio(
  volumes: number[],
  lookback = 24,
  elapsedFraction = 1,
): number | null {
  if (volumes.length < lookback + 1) return null;
  const last = volumes[volumes.length - 1] / Math.max(elapsedFraction, 0.1);
  const prev = volumes.slice(-lookback - 1, -1);
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  return avg > 0 ? last / avg : null;
}

/** Variation en % entre deux prix. */
export function pctChange(from: number, to: number): number {
  return from ? ((to - from) / from) * 100 : 0;
}

/**
 * Z-score du dernier rendement : de combien d'écarts-types le mouvement de la
 * dernière heure s'écarte de la normale des `window` heures précédentes.
 */
export function returnZScore(closes: number[], window = 48): number | null {
  if (closes.length < window + 2) return null;
  const rets: number[] = [];
  for (let i = closes.length - window - 1; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const last = rets.pop()!;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(variance);
  return sd > 0 ? (last - mean) / sd : null;
}
