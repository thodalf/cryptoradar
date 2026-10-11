/**
 * Configuration centrale.
 *
 * WIGL_ASSETS : liste des cryptos proposées dans l'app Wigl que tu veux suivre.
 * Wigl n'expose pas d'API publique : ajuste cette liste à la main selon ce que
 * l'app te propose. Chaque actif doit exister en paire USDT sur Binance
 * (les données de marché viennent de Binance, converties en EUR).
 */
export const WIGL_ASSETS: readonly string[] = [
  'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'ADA', 'DOGE', 'AVAX',
  'LINK', 'DOT', 'LTC', 'TRX', 'POL', 'UNI', 'ATOM', 'NEAR',
];

/**
 * Actifs absents de Binance, cotés via CoinGecko (id CoinGecko → ticker).
 * WIGL, le jeton de Wigl, ne s'échange que sur Uniswap (Ethereum).
 */
export const COINGECKO_ASSETS: Readonly<Record<string, string>> = {
  WIGL: 'wigl',
};
export const COINGECKO_API = 'https://api.coingecko.com/api/v3';
/** L'API publique CoinGecko limite le débit : une mise à jour par minute suffit. */
export const COINGECKO_POLL_MS = 60_000;

/** Indice Fear & Greed crypto (alternative.me), public et sans clé. */
export const FEAR_GREED_API = 'https://api.alternative.me/fng/';

/** Actifs considérés comme des stablecoins (valorisés sans flux de marché). */
export const STABLECOINS: Readonly<Record<string, number>> = {
  EUR: 1,
  EURC: 1,
  EURCV: 1,
  // USDC / USDT sont convertis via le taux EUR/USDT en direct
};

export const QUOTE = 'USDT';
/** Paire utilisée pour convertir USDT → EUR (prix d'1 EUR en USDT). */
export const EUR_PAIR = 'EURUSDT';

/**
 * Endpoints publics « market data only » de Binance : aucune clé requise,
 * CORS autorisé, utilisables directement depuis le navigateur.
 */
export const BINANCE_REST = 'https://data-api.binance.vision/api/v3';
export const BINANCE_WS = 'wss://data-stream.binance.vision/stream';

export const KLINE_INTERVAL = '1h';
export const KLINE_HISTORY = 200; // bougies 1h conservées par actif (~8 jours)

export const ASSET_NAMES: Readonly<Record<string, string>> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', BNB: 'BNB', ADA: 'Cardano',
  DOGE: 'Dogecoin', AVAX: 'Avalanche', LINK: 'Chainlink', DOT: 'Polkadot', LTC: 'Litecoin',
  TRX: 'Tron', POL: 'Polygon', UNI: 'Uniswap', ATOM: 'Cosmos', NEAR: 'NEAR',
  USDC: 'USD Coin', USDT: 'Tether', EURC: 'Euro Coin', WIGL: 'Wigl',
};
