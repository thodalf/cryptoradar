import { Candle, Opportunity, Signal, SignalSide, Thresholds } from '../models';
import { pctChange, returnZScore, rsi, volumeRatio } from './indicators';

export const DEFAULT_THRESHOLDS: Thresholds = {
  rsiLow: 30,
  rsiHigh: 70,
  volumeRatio: 2.5,
  zScore: 2.5,
  move24h: 10,
};

const HOUR = 3_600_000;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Analyse un actif et retourne ses signaux. Fonction pure : mêmes entrées,
 * même sortie — c'est ce qui permet de la recalculer à chaque tick sans risque.
 */
export function detect(
  asset: string,
  candles: Candle[],
  priceEur: number,
  change24h: number,
  t: Thresholds,
  now = Date.now(),
): Opportunity {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const last = candles.at(-1);
  const elapsed = last && !last.closed ? clamp01((now - last.openTime) / HOUR) : 1;

  const r = rsi(closes);
  const vr = volumeRatio(volumes, 24, elapsed);
  const z = returnZScore(closes);
  const change1h = last ? pctChange(last.open, last.close) : 0;

  const signals: Signal[] = [];

  if (r !== null && r <= t.rsiLow) {
    signals.push({
      kind: 'rsi-oversold', side: 'buy', label: 'Survente RSI',
      detail: `RSI 1h à ${r.toFixed(0)} (seuil ${t.rsiLow})`,
      strength: clamp01((t.rsiLow - r) / 20 + 0.4),
    });
  } else if (r !== null && r >= t.rsiHigh) {
    signals.push({
      kind: 'rsi-overbought', side: 'sell', label: 'Surachat RSI',
      detail: `RSI 1h à ${r.toFixed(0)} (seuil ${t.rsiHigh})`,
      strength: clamp01((r - t.rsiHigh) / 20 + 0.4),
    });
  }

  if (vr !== null && vr >= t.volumeRatio) {
    // Un pic de volume confirme la direction de la bougie en cours
    const side: SignalSide = change1h > 0.3 ? 'buy' : change1h < -0.3 ? 'sell' : 'watch';
    signals.push({
      kind: 'volume-spike', side, label: 'Pic de volume',
      detail: `Volume 1h ×${vr.toFixed(1)} vs moyenne 24h`,
      strength: clamp01(vr / (t.volumeRatio * 3)),
    });
  }

  if (z !== null && Math.abs(z) >= t.zScore) {
    // Mouvement extrême : lecture « retour à la moyenne »
    signals.push({
      kind: 'abnormal-move', side: z < 0 ? 'buy' : 'sell', label: 'Mouvement atypique',
      detail: `Variation 1h à ${z.toFixed(1)} écarts-types de la normale`,
      strength: clamp01(Math.abs(z) / (t.zScore * 2)),
    });
  }

  if (Math.abs(change24h) >= t.move24h) {
    signals.push({
      kind: 'big-24h', side: 'watch', label: change24h > 0 ? 'Forte hausse 24h' : 'Forte baisse 24h',
      detail: `${change24h > 0 ? '+' : ''}${change24h.toFixed(1)} % sur 24h`,
      strength: clamp01(Math.abs(change24h) / (t.move24h * 3)),
    });
  }

  const score = signals.reduce(
    (s, sig) => s + (sig.side === 'buy' ? 1 : sig.side === 'sell' ? -1 : 0) * sig.strength,
    0,
  );
  const side: SignalSide = score > 0.15 ? 'buy' : score < -0.15 ? 'sell' : 'watch';

  return { asset, price: priceEur, change1h, change24h, rsi: r, volumeRatio: vr, zScore: z, signals, score, side };
}
