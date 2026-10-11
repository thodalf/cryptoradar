import { NewsItem } from '../models';

/**
 * Titres réels de la semaine du 5 au 11 octobre 2026, figés pour la version de
 * démonstration (qui ne peut pas joindre les flux RSS). La version en ligne
 * charge l'actualité en direct via /api/news.
 */
const H = 3_600_000;
const BASE = Date.parse('2026-10-11T08:00:00Z');

export const DEMO_NEWS: NewsItem[] = [
  {
    id: 'd1', source: 'Journal du Coin', lang: 'fr', publishedAt: BASE + 2 * H,
    title: 'Nasdaq : la tokenisation pourrait libérer des dizaines de milliards de dollars de collatéral',
    summary: 'Le Nasdaq estime que la tokenisation des titres pourrait libérer d’importants volumes de collatéral sur les marchés.',
    url: 'https://journalducoin.com/economie/nasdaq-tokenisation-milliards-dollars-collateral/',
    assets: [], topics: ['Tokenisation'],
  },
  {
    id: 'd2', source: 'Cryptoast', lang: 'fr', publishedAt: BASE - 1 * H,
    title: 'Quand le XRP battra-t-il son record ? ChatGPT et 5 autres IA donnent une date',
    summary: 'Six intelligences artificielles livrent leur estimation sur un nouveau record du XRP.',
    url: 'https://cryptoast.fr/xrp-record-prediction-ia-chatgpt/',
    assets: ['XRP'], topics: [],
  },
  {
    id: 'd3', source: 'Journal du Coin', lang: 'fr', publishedAt: BASE - 1 * H,
    title: 'Chine : Pékin veut un réseau blockchain national, toujours sans Bitcoin',
    summary: 'La Chine prépare une infrastructure blockchain nationale, sans ouvrir la porte aux cryptomonnaies.',
    url: 'https://journalducoin.com/economie/chine-pekin-reseau-blockchain-national/',
    assets: ['BTC'], topics: ['Régulation'],
  },
  {
    id: 'd4', source: 'CoinDesk', lang: 'en', publishedAt: BASE - 20 * H,
    title: 'One year after 10/10 flash crash, bitcoin and ether liquidity have rebuilt, but altcoins still face risks',
    summary: 'Liquidity on BTC and ETH order books has recovered since last year’s crash; smaller tokens remain fragile.',
    url: 'https://www.coindesk.com/markets/2026/10/10/one-year-after-10-10-bitcoin-and-ether-liquidity-have-rebuilt-but-other-altcoins-still-face-risks',
    assets: ['BTC', 'ETH'], topics: [],
  },
  {
    id: 'd5', source: 'Cryptoast', lang: 'fr', publishedAt: BASE - 20 * H,
    title: 'Agressions et enlèvements crypto : comment se protéger ?',
    summary: 'Conseils pratiques face à la hausse des agressions visant les détenteurs de cryptomonnaies.',
    url: 'https://cryptoast.fr/agressions-enlevements-crypto-comment-proteger-conseils/',
    assets: [], topics: ['Sécurité'],
  },
  {
    id: 'd6', source: 'Cryptoast', lang: 'fr', publishedAt: BASE - 21 * H,
    title: 'Cardano (ADA) : quel est le prochain objectif de prix ? Analyse technique',
    summary: 'Supports, résistances et scénarios pour ADA à court terme.',
    url: 'https://cryptoast.fr/cardano-ada-quel-est-le-prochain-objectif-de-prix-analyse-technique/',
    assets: ['ADA'], topics: [],
  },
  {
    id: 'd7', source: 'CoinDesk', lang: 'en', publishedAt: BASE - 6 * 24 * H,
    title: 'Live updates: Bitcoin under pressure as rates continue to rise',
    summary: 'BTC near $86,000 as the 10-year Treasury yield nears a 22-year high and traders weigh an October Fed hike.',
    url: 'https://www.coindesk.com/business/2026/10/05/live-updates-bitcoin-above-usd86-000-as-traders-price-out-an-october-fed-hike',
    assets: ['BTC'], topics: ['Macro'],
  },
];
