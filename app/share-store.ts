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

const LOCAL_SHARE_DIR = join(process.cwd(), ".local", "shared-decks");

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

export async function saveSharedDeck(id: string, deck: SharedDeckState) {
  assertShareStoreConfigured();

  if (!hasBlobCredentials()) {
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

  if (!hasBlobCredentials()) {
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
