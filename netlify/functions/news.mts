/**
 * GET /api/news — agrège plusieurs flux RSS d'actualité crypto en un JSON unique.
 *
 * Les navigateurs ne peuvent pas lire ces flux directement (pas d'en-tête CORS) :
 * cette fonction les récupère côté serveur, les fusionne, repère les actifs cités
 * et renvoie les articles les plus récents. Réponse mise en cache 10 min sur le CDN.
 */

interface Feed { source: string; url: string; lang: 'fr' | 'en' }

const FEEDS: Feed[] = [
  { source: 'Cryptoast', url: 'https://cryptoast.fr/feed/', lang: 'fr' },
  { source: 'Journal du Coin', url: 'https://journalducoin.com/feed/', lang: 'fr' },
  { source: 'Cointribune', url: 'https://www.cointribune.com/feed/', lang: 'fr' },
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', lang: 'en' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss', lang: 'en' },
  // Actualité spécifique à Wigl, via Google Actualités
  { source: 'Google Actualités', url: 'https://news.google.com/rss/search?q=Wigl%20crypto&hl=fr&gl=FR&ceid=FR:fr', lang: 'fr' },
];

/** Mots-clés → ticker, pour relier un article aux actifs suivis. */
const ASSET_KEYWORDS: [string, RegExp][] = [
  ['BTC', /\b(bitcoin|btc)\b/i],
  ['ETH', /\b(ethereum|ether|eth)\b/i],
  ['SOL', /\b(Solana|SOL)\b/],
  ['XRP', /\b(xrp|ripple)\b/i],
  ['BNB', /\b(bnb|binance coin)\b/i],
  ['ADA', /\b(Cardano|ADA)\b/],
  ['DOGE', /\b(dogecoin|DOGE)\b/i],
  ['AVAX', /\b(avalanche|avax)\b/i],
  ['LINK', /\b(chainlink)\b/i],
  ['DOT', /\b(polkadot)\b/i],
  ['LTC', /\b(litecoin|ltc)\b/i],
  ['TRX', /\b(Tron|TRON|TRX)\b/],
  ['POL', /\b(polygon|matic)\b/i],
  ['UNI', /\b(uniswap)\b/i],
  ['ATOM', /\b(Cosmos|ATOM)\b/],
  ['NEAR', /\bnear protocol\b/i],
  ['USDT', /\b(tether|usdt)\b/i],
  ['USDC', /\b(usdc|circle)\b/i],
  ['WIGL', /\bwigl\b/i],
];

/** Thèmes transverses utiles à un investisseur. */
const TOPICS: [string, RegExp][] = [
  ['Régulation', /\b(mica|amf|sec|cftc|régul|regulat|loi|law|esma|fincen|clarity act)/i],
  ['Fiscalité', /\b(impôt|fiscal|flat tax|taxe|tax)\b/i],
  ['ETF', /\betf\b/i],
  ['Stablecoins', /\b(stablecoin|usdt|usdc|eurc|tether)\b/i],
  ['Macro', /\b(fed|bce|ecb|taux|rates?|inflation|cpi|emploi|jobs|treasury|yield)\b/i],
  ['Sécurité', /\b(hack|piratage|exploit|faille|vol de|arnaque|scam|enlèvement)\b/i],
  ['Tokenisation', /\b(tokeni[sz])/i],
];

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  lang: 'fr' | 'en';
  publishedAt: number;
  assets: string[];
  topics: string[];
}

export default async (req: Request): Promise<Response> => {
  const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f)));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failed = FEEDS.filter((_, i) => results[i].status === 'rejected').map((f) => f.source);

  // dédoublonnage par titre normalisé, tri du plus récent au plus ancien
  const seen = new Set<string>();
  const unique = items
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((it) => {
      const key = it.title.toLowerCase().replace(/\W+/g, '').slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 120);

  return Response.json(
    { generatedAt: Date.now(), failed, items: unique },
    {
      headers: {
        'Cache-Control': 'public, max-age=120',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800',
      },
    },
  );
};

async function fetchFeed(feed: Feed): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'CryptoRadar/1.0 (+https://crypto-radar-thomas.netlify.app)', Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${feed.source}: HTTP ${res.status}`);
  return parseRss(await res.text(), feed);
}

/** Parseur RSS tolérant (flux parfois tronqués ou mal formés) : extraction par motifs. */
export function parseRss(xml: string, feed: Feed): NewsItem[] {
  const out: NewsItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && out.length < 40) {
    const block = m[1];
    let title = clean(tag(block, 'title'));
    let source = feed.source;
    // Google Actualités : « Titre - Média »
    if (feed.url.includes('news.google.com')) {
      const src = clean(tag(block, 'source'));
      if (src) { source = src; title = title.replace(new RegExp(`\\s+-\\s+${escapeRe(src)}$`), ''); }
    }
    const url = clean(tag(block, 'link')) || clean(tag(block, 'guid'));
    const date = Date.parse(clean(tag(block, 'pubDate')) || clean(tag(block, 'dc:date')));
    if (!title || !url.startsWith('http') || Number.isNaN(date)) continue;

    const rawSummary = feed.url.includes('news.google.com') ? '' : clean(tag(block, 'description'));
    const summary = truncate(rawSummary.replace(/(L'article|The post) .*? (est apparu|appeared) .*$/i, ''), 240);
    const categories = [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((c) => clean(c[1]));
    const haystack = `${title} ${summary} ${categories.join(' ')}`;

    out.push({
      id: hash(url),
      title,
      summary,
      url,
      source,
      lang: feed.lang,
      publishedAt: date,
      assets: ASSET_KEYWORDS.filter(([, re]) => re.test(haystack)).map(([a]) => a),
      topics: TOPICS.filter(([, re]) => re.test(haystack)).map(([t]) => t),
    });
  }
  return out;
}

function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i');
  return block.match(re)?.[1] ?? '';
}

function clean(s: string): string {
  // balises HTML brutes, puis entités, puis balises qui étaient échappées
  return decode(
    s.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decode(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, n) => named[n.toLowerCase()] ?? all);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
