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

## Janie Market Source

Janie is the bridge to TCGplayer product/catalog data. Permet Link does not
need its own TCGplayer credentials; it consumes Janie Firehose output into
generated files so the app stays fast on Vercel:

```bash
JANIE_API_TOKEN=... npm run data:sync:janie
```

The sync writes:

- `app/tcgplayer-data.ts`: Janie/TCGplayer product IDs, buy links, image URLs when Janie has them, and market prices.
- `app/tcgplayer-card-data.ts`: new market rows discovered by Janie that are not in the curated rules file yet.
- `data/janie-gundam-sync.json`: Janie release coverage, search coverage, warnings, and unmatched products.

In GitHub, add repository secret `JANIE_API_TOKEN`. The optional repository
variables are `JANIE_API_ORIGIN` and `JANIE_GUNDAM_GAME_NAME`; by default they
point at the hosted Janie Firehose and `Gundam Card Game`. The scheduled
workflow `.github/workflows/sync-janie.yml` runs daily and commits generated
updates back to `main` when Janie has new Gundam products or prices.

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

The canonical domain is `https://permetlink.com`. Vercel should point
`permetlink.com` at the project and redirect `www.permetlink.com` to the
canonical host after DNS is configured. Legacy hosts can also be redirected to
the canonical host in `next.config.ts`.
