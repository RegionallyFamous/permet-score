# Permet Score

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

## TCGplayer Source Of Truth

TCGplayer product/catalog data is synced into generated files so the app stays
fast on Vercel:

```bash
TCGPLAYER_PUBLIC_KEY=... TCGPLAYER_PRIVATE_KEY=... npm run data:sync:tcgplayer
```

The sync writes:

- `app/tcgplayer-data.ts`: product IDs, product URLs, image URLs, and market prices.
- `app/tcgplayer-card-data.ts`: new cards discovered from TCGplayer that are not in the curated rules file yet.
- `data/tcgplayer-unmatched.json`: products that need manual cleanup or matching.

In GitHub, add repository secrets `TCGPLAYER_PUBLIC_KEY` and
`TCGPLAYER_PRIVATE_KEY`. If category discovery ever misses Gundam, add
`TCGPLAYER_CATEGORY_ID` as a repository secret. The scheduled workflow
`.github/workflows/sync-tcgplayer.yml` runs daily and commits generated updates
back to `main` when TCGplayer changes.

## Share Links

Use the Share button in the app to save the deck through the backend and copy a
clean URL like `/decks/abc123`. Shared links include the deck name, card counts,
and chosen printings, but they do not include private collection ownership
counts.

On Vercel, connect a private Vercel Blob store to the project so the API can
persist shared deck records. For local development without Blob credentials, the
API writes throwaway records to `.local/shared-decks/`.

## Vercel

The app is tailored for Vercel with Next.js scripts:

```bash
npm run build
npm run start
```

The canonical domain is `https://permetscore.com`. Vercel should point
`permetscore.com` at the project and redirect `www.permetscore.com`,
`permetlink.com`, `www.permetlink.com`, and `permet-score.vercel.app` to the
canonical host after DNS is configured.
