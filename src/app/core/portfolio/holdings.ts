import { Holding, Transaction } from '../models';

export interface PortfolioSummary {
  holdings: Holding[];
  totalValue: number;
  totalInvested: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalFees: number;
  unpriced: string[]; // actifs détenus sans cotation disponible
}

/**
 * Calcule les positions par la méthode du prix de revient moyen pondéré
 * (méthode retenue par l'administration fiscale française pour les crypto,
 * à l'échelle du portefeuille global — ici simplifiée par actif).
 * Les lignes en EUR sont ignorées : seul le portefeuille crypto est suivi.
 */
export function computePortfolio(
  txs: Transaction[],
  prices: Record<string, number>,
): PortfolioSummary {
  const pos = new Map<string, { qty: number; cost: number }>();
  let realizedPnl = 0;
  let totalFees = 0;

  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    if (t.asset === 'EUR') continue;
    const p = pos.get(t.asset) ?? { qty: 0, cost: 0 };
    totalFees += t.feeEur;

    switch (t.type) {
      case 'buy':
        p.qty += t.quantity;
        p.cost += t.quantity * (t.priceEur ?? 0) + t.feeEur;
        break;
      case 'deposit':
      case 'reward':
        // coût = valeur déclarée si un prix est fourni, sinon 0
        p.qty += t.quantity;
        p.cost += t.quantity * (t.priceEur ?? 0);
        break;
      case 'sell':
      case 'withdraw': {
        const q = Math.min(t.quantity, p.qty);
        const avg = p.qty > 0 ? p.cost / p.qty : 0;
        if (t.type === 'sell') realizedPnl += q * (t.priceEur ?? 0) - t.feeEur - avg * q;
        p.cost -= avg * q;
        p.qty -= q;
        break;
      }
    }
    pos.set(t.asset, p);
  }

  const raw = [...pos.entries()]
    .filter(([, p]) => p.qty > 1e-12)
    .map(([asset, p]) => {
      const price = prices[asset] ?? null;
      const value = price !== null ? p.qty * price : null;
      const pnl = value !== null ? value - p.cost : null;
      return {
        asset,
        quantity: p.qty,
        avgCost: p.qty > 0 ? p.cost / p.qty : null,
        invested: p.cost,
        price, value, pnl,
        pnlPct: pnl !== null && p.cost > 0 ? (pnl / p.cost) * 100 : null,
        weight: 0,
      } satisfies Holding;
    });

  const totalValue = raw.reduce((s, h) => s + (h.value ?? 0), 0);
  const holdings = raw
    .map((h) => ({ ...h, weight: totalValue > 0 && h.value ? h.value / totalValue : 0 }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return {
    holdings,
    totalValue,
    totalInvested: raw.filter((h) => h.value !== null).reduce((s, h) => s + h.invested, 0),
    unrealizedPnl: raw.reduce((s, h) => s + (h.pnl ?? 0), 0),
    realizedPnl,
    totalFees,
    unpriced: raw.filter((h) => h.price === null).map((h) => h.asset),
  };
}
