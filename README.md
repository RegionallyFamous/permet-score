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

## TCGplayer Market Source

Permet Link uses a private bridge to TCGplayer product/catalog data, so the app
does not need its own public TCGplayer credentials. The sync writes generated
market files so the app stays fast on Vercel:

```bash
TCGPLAYER_BRIDGE_TOKEN=... npm run data:sync:tcgplayer
```

The sync writes:

- `app/tcgplayer-data.ts`: TCGplayer product IDs, buy links, image URLs when available, and market prices.
- `app/tcgplayer-card-data.ts`: new market rows that are not in the curated rules file yet.
- `data/tcgplayer-gundam-sync.json`: release coverage, search coverage, warnings, and unmatched products.

In GitHub, add repository secret `TCGPLAYER_BRIDGE_TOKEN`. The optional
repository variables are `TCGPLAYER_BRIDGE_ORIGIN` and
`TCGPLAYER_BRIDGE_GAME_NAME`; by default they point at the hosted bridge and
`Gundam Card Game`. The scheduled workflow `.github/workflows/sync-tcgplayer.yml`
runs daily and commits generated updates back to `main` when new Gundam
products or prices are available.

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
