# Permet Link

A fast local-first Gundam Card Game deck builder, collection tracker, alt-art
planner, and opening-hand simulator.

## Run

```bash
npm install
npm run dev
```

## Build Check

```bash
npm run build
```

## Quality Checks

```bash
npm run lint
npm run qa:routes
npm run qa:visual
npm run perf:lighthouse
npm run analyze
```

`qa:visual` captures mobile, tablet, desktop, and wide screenshots and checks
for horizontal overflow. `qa:routes` times the home page, share API, shared deck
API, and shared deck page. `perf:lighthouse` expects the app to already be
running on `http://localhost:3000`, ideally with `npm run build && npm run start`.
`analyze` uses the Turbopack analyzer built into current Next.js.

## MCP Site Inspector

Permet Link includes a read-only MCP server for querying site health, card
readiness, market coverage, and individual card records from MCP-compatible
clients:

```bash
npm run mcp:site
```

For MCP client configuration, use the direct node command or npm's silent mode
so stdout stays reserved for MCP messages:

```bash
node scripts/mcp-site-inspector.mjs
npm run --silent mcp:site
```

Available tools:

- `get_site_summary`: launch, stack, route, readiness, and market summary.
- `get_card_readiness`: deck-ready versus catalog-only counts.
- `search_cards`: filter cards by query, type, color, set, or readiness.
- `get_card_detail`: inspect one card's rules, art variants, and TCGplayer prints.
- `get_market_coverage`: TCGplayer sync and price/product-link coverage.
- `check_live_site`: read-only smoke check for the public site, SEO files, and `llms.txt`.

## Card Data Sources

Permet Link uses the official Gundam Card Game card search for rules/build
fields and a private bridge to TCGplayer product/catalog data for market
enrichment. The app does not need public TCGplayer credentials in the browser,
and both syncs write generated files so the app stays fast on Vercel:

```bash
npm run data:sync:official
TCGPLAYER_BRIDGE_TOKEN=... npm run data:sync:tcgplayer
npm run data:audit:strict
```

The syncs write:

- `app/official-rules-card-data.ts`: official card numbers, names, rules text, build fields, and official art variants.
- `app/deck-validation-data.ts`: deck validation data generated from the official rules snapshot.
- `app/tcgplayer-data.ts`: TCGplayer product IDs, buy links, image URLs when available, and market prices.
- `app/tcgplayer-card-data.ts`: market-only catalog rows that are not in the official/curated rules pool yet.
- `data/official-gundam-rules-sync.json`: official sync counts and parser review status.
- `data/tcgplayer-gundam-sync.json`: release coverage, search coverage, warnings, and unmatched products.

In GitHub, add repository secret `TCGPLAYER_BRIDGE_TOKEN`. The optional
repository variables are `TCGPLAYER_BRIDGE_ORIGIN` and
`TCGPLAYER_BRIDGE_GAME_NAME`; by default they point at the hosted bridge and
`Gundam Card Game`. The scheduled workflow `.github/workflows/sync-tcgplayer.yml`
runs daily, refreshes official build data first, refreshes TCGplayer market data
second, audits the generated snapshot, and commits updates back to `main`.
When Vercel is connected to the GitHub repo, those commits trigger production
deploys automatically.

## Share Links

Use the Share button in the app to save the deck through the backend and copy a
clean URL like `/decks/abc123`. Shared links include the deck name, card counts,
and chosen printings, but they do not include private collection ownership
counts.

On Vercel, connect a private Vercel Blob store to the project so the API can
persist shared deck records. Local development always writes throwaway records to
`.local/shared-decks/`, even when Blob credentials are present in `.env.local`.

## Vercel

The app is tailored for Vercel with Next.js scripts:

```bash
npm run build
npm run start
```

The canonical domain is `https://permetlink.com`. Vercel should point
`permetlink.com` at the project and redirect `www.permetlink.com` to the
canonical host after DNS is configured. Legacy hosts can also be redirected to
the canonical host in `next.config.ts`.
