import { Transaction, TxType } from '../models';

/**
 * Import CSV tolérant : reconnaît des en-têtes français ou anglais, le
 * séparateur « ; » ou « , » et les nombres au format « 1 234,56 ».
 * Wigl ne publiant pas de format d'export officiel, le parseur s'adapte aux
 * colonnes trouvées ; un modèle est fourni dans /public/modele-transactions.csv.
 */

const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  date: ['date', 'datetime', 'horodatage', 'date operation', 'date de l operation', 'created at'],
  type: ['type', 'operation', 'side', 'nature', 'sens'],
  asset: ['asset', 'actif', 'crypto', 'devise', 'currency', 'symbol', 'symbole', 'token'],
  quantity: ['quantity', 'quantite', 'qty', 'amount', 'montant crypto', 'volume'],
  price: ['price', 'prix', 'prix unitaire', 'price eur', 'prix eur', 'cours'],
  total: ['total', 'total eur', 'montant eur', 'montant', 'value', 'valeur'],
  fee: ['fee', 'fees', 'frais', 'frais eur', 'commission'],
  note: ['note', 'description', 'libelle', 'commentaire'],
};

interface ColumnMap {
  date: number; type: number; asset: number; quantity: number;
  price: number; total: number; fee: number; note: number;
}

const TYPE_ALIASES: [RegExp, TxType][] = [
  [/^(achat|buy|bought|purchase|investissement|coffre)/, 'buy'],
  [/^(vente|sell|sold)/, 'sell'],
  [/^(depot|deposit|reception|receive|received|virement entrant)/, 'deposit'],
  [/^(retrait|withdraw|envoi|send|sent|virement sortant)/, 'withdraw'],
  [/^(reward|recompense|cashback|staking|interet|interest|rendement|bonus|airdrop)/, 'reward'],
];

export interface ImportResult {
  transactions: Transaction[];
  errors: string[];
  detectedColumns: string[];
}

export function parseTransactionsCsv(text: string): ImportResult {
  const clean = text.replace(/^﻿/, '').trim();
  if (!clean) return { transactions: [], errors: ['Fichier vide.'], detectedColumns: [] };

  const firstLine = clean.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows = splitCsv(clean, delimiter);
  const header = rows.shift()!.map(normalize);

  const cols = mapColumns(header);
  const errors: string[] = [];
  const missing = (['date', 'type', 'asset', 'quantity'] as const).filter((k) => cols[k] < 0);
  if (missing.length) {
    return {
      transactions: [],
      errors: [`Colonnes obligatoires introuvables : ${missing.join(', ')}. En-têtes lus : ${header.join(' | ')}`],
      detectedColumns: [],
    };
  }

  const transactions: Transaction[] = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    if (row.every((c) => !c.trim())) return;

    const date = parseDate(row[cols.date]);
    const type = parseType(row[cols.type]);
    const asset = (row[cols.asset] ?? '').trim().toUpperCase();
    const quantity = Math.abs(parseNumber(row[cols.quantity]) ?? NaN);
    const total = cols.total >= 0 ? parseNumber(row[cols.total]) : null;
    let price = cols.price >= 0 ? parseNumber(row[cols.price]) : null;
    if (price === null && total !== null && quantity > 0) price = Math.abs(total) / quantity;
    const fee = cols.fee >= 0 ? Math.abs(parseNumber(row[cols.fee]) ?? 0) : 0;

    if (!date) return void errors.push(`Ligne ${line} : date illisible « ${row[cols.date]} »`);
    if (!type) return void errors.push(`Ligne ${line} : type inconnu « ${row[cols.type]} »`);
    if (!asset) return void errors.push(`Ligne ${line} : actif manquant`);
    if (!Number.isFinite(quantity) || quantity === 0) return void errors.push(`Ligne ${line} : quantité invalide`);

    transactions.push({
      id: `${date}-${asset}-${type}-${quantity}-${line}`,
      date, type, asset, quantity,
      priceEur: price !== null ? Math.abs(price) : null,
      feeEur: fee,
      note: cols.note >= 0 ? row[cols.note]?.trim() || undefined : undefined,
    });
  });

  const detectedColumns = (Object.keys(cols) as (keyof ColumnMap)[]).filter((k) => cols[k] >= 0);
  return { transactions, errors, detectedColumns };
}

/** Génère un CSV (séparateur ;) à partir des transactions — pour l'export/sauvegarde. */
export function toCsv(txs: Transaction[]): string {
  const head = 'date;type;actif;quantite;prix_eur;frais_eur;note';
  const lines = txs.map((t) =>
    [t.date, t.type, t.asset, t.quantity, t.priceEur ?? '', t.feeEur, (t.note ?? '').replace(/;/g, ',')].join(';'),
  );
  return [head, ...lines].join('\n');
}

// ─── utilitaires ────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[_'’()-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function mapColumns(header: string[]): ColumnMap {
  const find = (aliases: string[]) => {
    const exact = header.findIndex((h) => aliases.includes(h));
    if (exact >= 0) return exact;
    return header.findIndex((h) => aliases.some((a) => h.startsWith(a)));
  };
  const map = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as (keyof ColumnMap)[]).map((k) => [k, find(HEADER_ALIASES[k])]),
  ) as unknown as ColumnMap;
  // « montant » seul sert de total, pas de quantité, si une colonne quantité existe déjà
  if (map.total === map.quantity) map.total = -1;
  return map;
}

function parseType(raw: string | undefined): TxType | null {
  const v = normalize(raw ?? '');
  return TYPE_ALIASES.find(([re]) => re.test(v))?.[1] ?? null;
}

export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.replace(/[\s  €$]/g, '').replace(/[A-Za-z]+$/, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // le dernier séparateur est le séparateur décimal
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  // jj/mm/aaaa [hh:mm[:ss]]
  const fr = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (fr) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = fr;
    const year = y.length === 2 ? 2000 + +y : +y;
    const date = new Date(year, +m - 1, +d, +hh, +mm, +ss);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  const iso = new Date(v);
  return isNaN(iso.getTime()) ? null : iso.toISOString();
}

function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}
