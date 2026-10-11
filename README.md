# Crypto Radar

Application Angular personnelle : suivi du marché crypto en temps réel, détection d'opportunités et suivi du portefeuille Wigl.

- **Angular 22** (standalone, signals, zoneless) + **Angular Material 3** (thème sombre)
- **Données de marché** : endpoints publics Binance (`data-api.binance.vision` / `data-stream.binance.vision`), sans clé et compatibles CORS
- **Portefeuille** : import CSV (Wigl n'a pas d'API publique), stocké dans le navigateur

## Démarrer

```bash
npm install
npm start            # http://localhost:4200
npm run build        # build de production dans dist/
```

Node ≥ 22.22.3 ou ≥ 24.15 requis par Angular CLI 22.

## Architecture

```
src/app/
├─ core/
│  ├─ config.ts                 ← liste WIGL_ASSETS à ajuster, endpoints
│  ├─ models.ts                 ← types partagés
│  ├─ storage.ts                ← localStorage avec try/catch
│  ├─ api/
│  │  ├─ binance-rest.service.ts   amorçage : tickers 24h + 200 bougies 1h
│  │  └─ binance-ws.service.ts     WebSocket multiplexé, reconnexion avec backoff
│  ├─ analysis/                 ← fonctions pures (testables, déplaçables en Worker)
│  │  ├─ indicators.ts             RSI Wilder, ratio de volume, z-score des rendements
│  │  └─ opportunity-detector.ts   règles → signaux + score achat/vente
│  ├─ portfolio/
│  │  ├─ csv-import.ts             parseur CSV FR/EN tolérant
│  │  └─ holdings.ts               positions au PRU moyen pondéré, P&L latent/réalisé
│  └─ state/                    ← stores à base de signals
│     ├─ market.store.ts           REST → WebSocket, ticks regroupés par seconde
│     ├─ opportunities.store.ts    computed() sur le marché + seuils persistés
│     └─ portfolio.store.ts        transactions persistées + résumé computed()
├─ features/                    ← routes chargées en lazy-loading
│  ├─ dashboard/                   tableau marché triable, flash de prix, sparklines
│  ├─ opportunities/               cartes de signaux, filtres, réglage des seuils
│  └─ portfolio/                   KPIs, donut de répartition, positions, historique
└─ shared/                      ← pipes de format (€, %, quantités), sparkline SVG
```

**Flux de données** : `BinanceRestService` amorce l'état → `BinanceWsService` pousse les ticks → `MarketStore` les applique par lots d'une seconde → les `computed()` des autres stores (opportunités, portefeuille) se recalculent seuls → les composants OnPush lisent les signals.

## Détecteur d'opportunités

| Signal | Règle par défaut | Lecture |
|---|---|---|
| Survente RSI | RSI(14, 1h) ≤ 30 | achat potentiel |
| Surachat RSI | RSI(14, 1h) ≥ 70 | vente potentielle |
| Pic de volume | volume de l'heure (extrapolé) ≥ 2,5 × moyenne 24h | dans le sens de la bougie |
| Mouvement atypique | rendement 1h ≥ 2,5 écarts-types (fenêtre 48h) | retour à la moyenne |
| Forte variation 24h | ± 10 % | à surveiller |

Les seuils se règlent dans l'interface et sont mémorisés. Ce sont des indicateurs statistiques, pas des conseils d'investissement.

## Portefeuille : format CSV

Modèle : `public/modele-transactions.csv` (téléchargeable depuis l'app).

```
date;type;actif;quantite;prix_eur;frais_eur;note
15/01/2026 10:12;achat;BTC;0,0025;38500;1,50;Premier achat
```

- Séparateur `;` ou `,`, nombres `1 234,56` ou `1234.56`, dates `jj/mm/aaaa hh:mm` ou ISO
- En-têtes reconnus en français ou en anglais (`date`, `type/operation`, `actif/asset/crypto`, `quantite/amount`, `prix/price`, `total/montant eur`, `frais/fees`)
- Types : achat, vente, dépôt, retrait, récompense/cashback/staking
- Les lignes en `EUR` sont ignorées (seul le portefeuille crypto est suivi)
- Les cryptos absentes de `WIGL_ASSETS` apparaissent sans cotation : ajoute-les à la liste

## Sécurité

L'application n'utilise **aucun secret** : les données de marché sont publiques et le portefeuille est importé à la main. Il n'y a donc rien à cacher côté client.

Si une API Wigl (ou celle d'un exchange) est branchée un jour :

1. **Jamais de clé dans le bundle Angular** : tout ce qui est dans `environment.ts` ou `localStorage` est lisible par n'importe quel script de la page.
2. **Proxy léger (BFF)** : une petite fonction serveur (Supabase Edge Function, Cloudflare Worker…) garde la clé en variable d'environnement, signe les requêtes et n'expose que les routes utiles (`GET /portfolio`, `POST /order`).
3. **Accès au proxy protégé** par ta propre authentification (cookie `httpOnly` + `SameSite=Strict`) et une liste blanche de ton origine CORS.
4. **Clé à droits minimaux** : lecture seule si possible, sans droit de retrait, avec restriction d'IP sur le proxy.
5. **Ordres** : confirmation explicite, montant plafonné côté proxy, journalisation.

Point d'extension : `PortfolioStore.transactions` peut être alimenté par un service HTTP vers ce proxy, et tout le reste suit.

## Données stockées localement

`localStorage` contient uniquement : les seuils du détecteur (`cr.thresholds`) et l'historique importé (`cr.transactions`). Il est propre à ce navigateur ; utilise « Exporter l'historique » pour sauvegarder ou changer de machine.
