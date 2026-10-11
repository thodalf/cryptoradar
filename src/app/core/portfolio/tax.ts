import { Transaction } from '../models';

/**
 * Plus-values sur actifs numériques des particuliers — article 150 VH bis du CGI
 * (formulaire 2086). Pour chaque cession contre euros :
 *
 *   PV = prix de cession net − prix total d'acquisition × (prix de cession / valeur globale du portefeuille)
 *
 * La valeur globale est celle de TOUS les actifs numériques détenus juste avant
 * la cession. Après chaque cession, le prix total d'acquisition est diminué de
 * la fraction imputée. Les échanges crypto ↔ crypto ne sont pas imposables.
 *
 * Simplifications assumées (à valider avec un conseiller / Waltio, etc.) :
 * - récompenses, cashback et dépôts sans prix entrent avec un coût nul ;
 * - les retraits (transferts) ne réduisent pas le prix d'acquisition ;
 * - aucun abattement ni report de moins-value d'une année sur l'autre (règle légale).
 */

export const EXEMPTION_THRESHOLD = 305; // € de cessions annuelles en dessous desquelles tout est exonéré

export interface TaxLine {
  tx: Transaction;
  year: number;
  grossPrice: number;        // prix de cession brut (quantité × prix)
  fees: number;
  netPrice: number;          // prix de cession net de frais
  portfolioValue: number | null;
  acquisitionTotal: number;  // avant cession
  acquisitionShare: number | null; // fraction imputée
  gain: number | null;       // plus ou moins-value
}

export interface TaxYear {
  year: number;
  totalSales: number;
  netGain: number;
  exempt: boolean;
  tax: number;
  lines: TaxLine[];
  complete: boolean;         // toutes les valeurs de portefeuille sont connues
}

export interface SaleSnapshot {
  tx: Transaction;
  /** Quantités détenues par actif juste avant la cession. */
  holdings: Record<string, number>;
}

/** Rejoue l'historique et capture les quantités détenues avant chaque vente. */
export function saleSnapshots(txs: Transaction[]): SaleSnapshot[] {
  const qty: Record<string, number> = {};
  const out: SaleSnapshot[] = [];
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (t.asset === 'EUR') continue;
    if (t.type === 'sell') out.push({ tx: t, holdings: { ...qty } });
    const sign = t.type === 'sell' || t.type === 'withdraw' ? -1 : 1;
    qty[t.asset] = Math.max(0, (qty[t.asset] ?? 0) + sign * t.quantity);
  }
  return out;
}

/**
 * Calcule les plus-values ligne à ligne. `values` donne la valeur globale du
 * portefeuille avant chaque vente (clé : id de transaction).
 */
export function computeTax(
  txs: Transaction[],
  values: Record<string, number | null>,
  rate: number,
): TaxYear[] {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  let acquisition = 0;
  let broken = false; // une valeur manquante rend la suite approximative
  const lines: TaxLine[] = [];

  for (const t of sorted) {
    if (t.asset === 'EUR') continue;
    if (t.type === 'buy') acquisition += t.quantity * (t.priceEur ?? 0) + t.feeEur;
    else if (t.type === 'deposit' || t.type === 'reward') acquisition += t.quantity * (t.priceEur ?? 0);
    else if (t.type === 'sell') {
      const gross = t.quantity * (t.priceEur ?? 0);
      const net = gross - t.feeEur;
      const v = values[t.id] ?? null;
      const usable = v !== null && v > 0 && !broken;
      const share = usable ? acquisition * Math.min(1, gross / v) : null;
      lines.push({
        tx: t,
        year: new Date(t.date).getFullYear(),
        grossPrice: gross,
        fees: t.feeEur,
        netPrice: net,
        portfolioValue: v,
        acquisitionTotal: acquisition,
        acquisitionShare: share,
        gain: share !== null ? net - share : null,
      });
      if (share !== null) acquisition -= share;
      else broken = true;
    }
  }

  const years = new Map<number, TaxLine[]>();
  for (const l of lines) years.set(l.year, [...(years.get(l.year) ?? []), l]);

  return [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, ls]) => {
      const totalSales = ls.reduce((s, l) => s + l.grossPrice, 0);
      const netGain = ls.reduce((s, l) => s + (l.gain ?? 0), 0);
      const exempt = totalSales <= EXEMPTION_THRESHOLD;
      return {
        year, totalSales, netGain, exempt,
        tax: exempt ? 0 : Math.max(0, netGain) * rate,
        lines: ls,
        complete: ls.every((l) => l.gain !== null),
      };
    });
}
