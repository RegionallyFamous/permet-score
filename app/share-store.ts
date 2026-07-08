import { del, get, list, put } from "@vercel/blob";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  sanitizeSharedDeck,
  type SharedDeckState,
} from "./deck-share-schema.ts";

type SharedDeckRecord = {
  version: 1;
  id: string;
  createdAt: string;
  deck: SharedDeckState;
};

type ShareRateLimitRecord = {
  version: 1;
  keyHash: string;
  day: string;
  count: number;
  updatedAt: string;
};

type PruneSharedDeckOptions = {
  maxAgeDays?: number;
  qaOnly?: boolean;
  dryRun?: boolean;
  includeBlob?: boolean;
};

type PruneSharedDeckStoreResult = {
  scanned: number;
  pruned: number;
};

type PruneSharedDeckResult = {
  status: "ok";
  dryRun: boolean;
  qaOnly: boolean;
  maxAgeDays: number;
  local: PruneSharedDeckStoreResult;
  blob: PruneSharedDeckStoreResult;
};

const LOCAL_SHARE_DIR = join(process.cwd(), ".local", "shared-decks");
const LOCAL_RATE_LIMIT_DIR = join(process.cwd(), ".local", "share-rate-limits");
const QA_SHARE_NAME_PATTERN = /^(Deployed QA|Workflow QA|Permet Link QA)\b/i;

function hasBlobCredentials() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN),
  );
}

function shouldUseLocalShareStore() {
  return !process.env.VERCEL;
}

function assertShareStoreConfigured() {
  if (hasBlobCredentials() || shouldUseLocalShareStore()) return;
  throw new Error("Vercel Blob credentials are required for shared decks in production.");
}

function blobPath(id: string) {
  return `decks/${id}.json`;
}

function rateLimitBlobPath(keyHash: string, day: string) {
  return `rate-limits/share/${day}/${keyHash}.json`;
}

function recordForDeck(id: string, deck: SharedDeckState): SharedDeckRecord {
  return {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    deck,
  };
}

async function saveLocalDeck(id: string, deck: SharedDeckState) {
  await mkdir(LOCAL_SHARE_DIR, { recursive: true });
  await writeFile(
    join(LOCAL_SHARE_DIR, `${id}.json`),
    JSON.stringify(recordForDeck(id, deck), null, 2),
    "utf8",
  );
}

async function loadLocalDeck(id: string) {
  try {
    const text = await readFile(join(LOCAL_SHARE_DIR, `${id}.json`), "utf8");
    const parsed = parseSharedDeckRecord(text);
    return sanitizeSharedDeck(parsed.deck);
  } catch {
    return null;
  }
}

function parseSharedDeckRecord(text: string) {
  return JSON.parse(text) as Partial<SharedDeckRecord>;
}

function shouldPruneSharedDeckRecord(
  record: Partial<SharedDeckRecord> | null,
  cutoff: number,
  qaOnly: boolean,
) {
  const createdAt = Date.parse(record?.createdAt ?? "");
  if (!Number.isFinite(createdAt) || createdAt > cutoff) return false;
  if (!qaOnly) return true;
  return QA_SHARE_NAME_PATTERN.test(record?.deck?.name ?? "");
}

async function pruneLocalSharedDeckRecords(
  cutoff: number,
  qaOnly: boolean,
  dryRun: boolean,
) {
  let files: string[] = [];
  try {
    files = await readdir(LOCAL_SHARE_DIR);
  } catch {
    return { scanned: 0, pruned: 0 };
  }

  let scanned = 0;
  let pruned = 0;

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const pathname = join(LOCAL_SHARE_DIR, file);
    let record: Partial<SharedDeckRecord> | null = null;
    try {
      record = parseSharedDeckRecord(await readFile(pathname, "utf8"));
    } catch {
      record = null;
    }

    scanned += 1;
    if (!shouldPruneSharedDeckRecord(record, cutoff, qaOnly)) continue;
    pruned += 1;
    if (!dryRun) await rm(pathname, { force: true });
  }

  return { scanned, pruned };
}

async function readBlobSharedDeckRecord(pathname: string) {
  try {
    const result = await get(pathname, { access: "private" });
    if (result?.statusCode !== 200) return null;
    return parseSharedDeckRecord(await new Response(result.stream).text());
  } catch {
    return null;
  }
}

async function pruneBlobSharedDeckRecords(
  cutoff: number,
  qaOnly: boolean,
  dryRun: boolean,
) {
  if (!hasBlobCredentials()) return { scanned: 0, pruned: 0 };

  let cursor: string | undefined;
  let scanned = 0;
  let pruned = 0;

  do {
    const result = await list({
      prefix: "decks/",
      cursor,
      limit: 1000,
    });
    cursor = result.cursor;

    for (const blob of result.blobs) {
      const record = await readBlobSharedDeckRecord(blob.pathname);
      scanned += 1;
      if (!shouldPruneSharedDeckRecord(record, cutoff, qaOnly)) continue;
      pruned += 1;
      if (!dryRun) await del(blob.pathname);
    }
  } while (cursor);

  return { scanned, pruned };
}

async function readLocalDailyCounter(keyHash: string, day: string) {
  try {
    const text = await readFile(join(LOCAL_RATE_LIMIT_DIR, day, `${keyHash}.json`), "utf8");
    return JSON.parse(text) as Partial<ShareRateLimitRecord>;
  } catch {
    return null;
  }
}

async function writeLocalDailyCounter(record: ShareRateLimitRecord) {
  await mkdir(join(LOCAL_RATE_LIMIT_DIR, record.day), { recursive: true });
  await writeFile(
    join(LOCAL_RATE_LIMIT_DIR, record.day, `${record.keyHash}.json`),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

async function readBlobDailyCounter(keyHash: string, day: string) {
  const result = await get(rateLimitBlobPath(keyHash, day), { access: "private" });
  if (result?.statusCode !== 200) return null;

  try {
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as Partial<ShareRateLimitRecord>;
  } catch {
    return null;
  }
}

async function writeBlobDailyCounter(record: ShareRateLimitRecord) {
  await put(rateLimitBlobPath(record.keyHash, record.day), JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function incrementSharedDeckDailyCounter(
  keyHash: string,
  day: string,
  limit: number,
) {
  assertShareStoreConfigured();

  const current = shouldUseLocalShareStore()
    ? await readLocalDailyCounter(keyHash, day)
    : await readBlobDailyCounter(keyHash, day);
  const count = current?.day === day && current.keyHash === keyHash ? current.count ?? 0 : 0;

  if (count >= limit) {
    return {
      allowed: false,
      count,
    };
  }

  const next: ShareRateLimitRecord = {
    version: 1,
    keyHash,
    day,
    count: count + 1,
    updatedAt: new Date().toISOString(),
  };

  if (shouldUseLocalShareStore()) {
    await writeLocalDailyCounter(next);
  } else {
    await writeBlobDailyCounter(next);
  }

  return {
    allowed: true,
    count: next.count,
  };
}

export async function checkSharedDeckDailyCounter(
  keyHash: string,
  day: string,
  limit: number,
) {
  assertShareStoreConfigured();

  const current = shouldUseLocalShareStore()
    ? await readLocalDailyCounter(keyHash, day)
    : await readBlobDailyCounter(keyHash, day);
  const count = current?.day === day && current.keyHash === keyHash ? current.count ?? 0 : 0;

  return {
    allowed: count < limit,
    count,
  };
}

export async function saveSharedDeck(id: string, deck: SharedDeckState) {
  assertShareStoreConfigured();

  if (shouldUseLocalShareStore() || !hasBlobCredentials()) {
    await saveLocalDeck(id, deck);
    return;
  }

  await put(blobPath(id), JSON.stringify(recordForDeck(id, deck)), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
  });
}

export async function loadSharedDeck(id: string) {
  assertShareStoreConfigured();

  if (shouldUseLocalShareStore() || !hasBlobCredentials()) {
    return loadLocalDeck(id);
  }

  const result = await get(blobPath(id), { access: "private" });
  if (result?.statusCode !== 200) return null;

  try {
    const text = await new Response(result.stream).text();
    const parsed = parseSharedDeckRecord(text);
    return sanitizeSharedDeck(parsed.deck);
  } catch {
    return null;
  }
}

export async function pruneSharedDeckRecords(
  options: PruneSharedDeckOptions = {},
): Promise<PruneSharedDeckResult> {
  const maxAgeDays = Math.max(1, Math.floor(options.maxAgeDays ?? 7));
  const qaOnly = options.qaOnly ?? true;
  const dryRun = options.dryRun ?? false;
  const includeBlob = options.includeBlob ?? !shouldUseLocalShareStore();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const [local, blob] = await Promise.all([
    pruneLocalSharedDeckRecords(cutoff, qaOnly, dryRun),
    includeBlob
      ? pruneBlobSharedDeckRecords(cutoff, qaOnly, dryRun)
      : Promise.resolve({ scanned: 0, pruned: 0 }),
  ]);

  return {
    status: "ok",
    dryRun,
    qaOnly,
    maxAgeDays,
    local,
    blob,
  };
}
