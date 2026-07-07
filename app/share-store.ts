import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  sanitizeSharedDeck,
  type SharedDeckState,
} from "./deck-share-schema";

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

const LOCAL_SHARE_DIR = join(process.cwd(), ".local", "shared-decks");
const LOCAL_RATE_LIMIT_DIR = join(process.cwd(), ".local", "share-rate-limits");

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
    const parsed = JSON.parse(text) as Partial<SharedDeckRecord>;
    return sanitizeSharedDeck(parsed.deck);
  } catch {
    return null;
  }
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
    const parsed = JSON.parse(text) as Partial<SharedDeckRecord>;
    return sanitizeSharedDeck(parsed.deck);
  } catch {
    return null;
  }
}
