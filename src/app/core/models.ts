export interface Ticker {
  symbol: string;       // ex. BTCUSDT
  asset: string;        // ex. BTC
  lastUsdt: number;
  openUsdt: number;     // prix il y a 24h (glissant)
  highUsdt: number;
  lowUsdt: number;
  baseVolume: number;   // volume 24h en unités de l'actif
  quoteVolume: number;  // volume 24h en USDT
  updatedAt: number;
}

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;       // en unités de l'actif
  closed: boolean;
}

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

/** Ligne prête à afficher dans le tableau de bord (valeurs en EUR). */
export interface MarketRow {
  asset: string;
  price: number;
  change24h: number;    // en %
  volume24h: number;    // en EUR
  high24h: number;
  low24h: number;
  rsi: number | null;
  spark: number[];      // clôtures des 48 dernières heures
  source: 'binance' | 'coingecko';
}

export type SignalSide = 'buy' | 'sell' | 'watch';

export interface Signal {
  kind: 'rsi-oversold' | 'rsi-overbought' | 'volume-spike' | 'abnormal-move' | 'big-24h';
  side: SignalSide;
  label: string;
  detail: string;
  strength: number;     // 0..1
}

export interface Opportunity {
  asset: string;
  price: number;
  change1h: number;
  change24h: number;
  rsi: number | null;
  volumeRatio: number | null;
  zScore: number | null;
  signals: Signal[];
  score: number;        // >0 tendance achat, <0 tendance vente
  side: SignalSide;
}

export interface Thresholds {
  rsiLow: number;
  rsiHigh: number;
  volumeRatio: number;  // volume dernière heure / moyenne 24h
  zScore: number;       // écart-type du rendement 1h
  move24h: number;      // % de variation 24h
}

export type TxType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'reward';

export interface Transaction {
  id: string;
  date: string;         // ISO
  type: TxType;
  asset: string;
  quantity: number;     // toujours positive
  priceEur: number | null; // prix unitaire en EUR (achat/vente)
  feeEur: number;
  note?: string;
}

export interface Holding {
  asset: string;
  quantity: number;
  avgCost: number | null;   // prix de revient moyen en EUR
  invested: number;         // coût de la position restante
  price: number | null;     // prix courant EUR
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  weight: number;           // part du portefeuille (0..1)
}
