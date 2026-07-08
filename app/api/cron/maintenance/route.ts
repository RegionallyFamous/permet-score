import { NextResponse } from "next/server";
import {
  CARD_POOL,
  OFFICIAL_CARD_POOL,
  OFFICIAL_RULES_LAST_SYNC,
  TCGPLAYER_CARD_POOL,
} from "../../../card-pool";
import { pruneSharedDeckRecords } from "../../../share-store";
import { TCGPLAYER_CARD_PRINTS } from "../../../tcgplayer-data";
import { TCGPLAYER_LAST_SYNC } from "../../../tcgplayer-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_USER_AGENT = "vercel-cron/1.0";
const DEFAULT_QA_PRUNE_DAYS = 7;
const DEFAULT_OFFICIAL_FRESH_HOURS = 72;
const DEFAULT_TCGPLAYER_FRESH_HOURS = 48;

function numericEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function authorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }

  if (!process.env.VERCEL) return true;

  return (
    request.headers.get("user-agent") === CRON_USER_AGENT &&
    Boolean(request.headers.get("x-vercel-cron-schedule"))
  );
}

function syncHealth(lastSync: string | null, maxAgeHours: number) {
  if (!lastSync) {
    return {
      lastSync: null,
      ageHours: null,
      fresh: false,
      maxAgeHours,
    };
  }

  const syncedAt = new Date(lastSync).getTime();
  const ageHours = Number.isFinite(syncedAt)
    ? Math.max(0, (Date.now() - syncedAt) / 3_600_000)
    : null;

  return {
    lastSync,
    ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    fresh: ageHours !== null && ageHours <= maxAgeHours,
    maxAgeHours,
  };
}

function tcgplayerPrintCount() {
  return Object.values(TCGPLAYER_CARD_PRINTS).reduce(
    (sum, prints) => sum + prints.length,
    0,
  );
}

export async function GET(request: Request) {
  if (!authorizedCronRequest(request)) {
    return json({ error: "Unauthorized cron request." }, 401);
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxAgeDays = numericEnv("SHARED_DECK_QA_PRUNE_DAYS", DEFAULT_QA_PRUNE_DAYS);
  const officialMaxAgeHours = numericEnv(
    "OFFICIAL_RULES_MAX_SYNC_HOURS",
    DEFAULT_OFFICIAL_FRESH_HOURS,
  );
  const tcgplayerMaxAgeHours = numericEnv(
    "TCGPLAYER_MAX_SYNC_HOURS",
    DEFAULT_TCGPLAYER_FRESH_HOURS,
  );

  const sharedDeckPrune = await pruneSharedDeckRecords({
    dryRun,
    includeBlob: Boolean(process.env.VERCEL),
    maxAgeDays,
    qaOnly: true,
  });

  return json({
    status: "ok",
    checkedAt: new Date().toISOString(),
    dryRun,
    schedule: request.headers.get("x-vercel-cron-schedule"),
    data: {
      totalCards: CARD_POOL.length,
      officialCards: OFFICIAL_CARD_POOL.length,
      tcgplayerCatalogCards: TCGPLAYER_CARD_POOL.length,
      tcgplayerPrints: tcgplayerPrintCount(),
      officialRules: syncHealth(OFFICIAL_RULES_LAST_SYNC, officialMaxAgeHours),
      tcgplayer: syncHealth(TCGPLAYER_LAST_SYNC, tcgplayerMaxAgeHours),
    },
    maintenance: {
      sharedDeckPrune,
    },
  });
}
