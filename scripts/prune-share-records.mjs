import { del, get, list } from "@vercel/blob";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const maxAgeDays = Math.max(1, Number(daysArg?.split("=")[1] ?? 7));
const qaOnly = args.has("--qa-only");
const dryRun = args.has("--dry-run");
const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
const localShareDir = join(process.cwd(), ".local", "shared-decks");
const qaNamePattern = /^(Deployed QA|Workflow QA|Permet Link QA)\b/i;

function hasBlobCredentials() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN),
  );
}

function parseRecord(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function shouldPrune(record) {
  const createdAt = Date.parse(record?.createdAt ?? "");
  if (!Number.isFinite(createdAt) || createdAt > cutoff) return false;
  if (!qaOnly) return true;
  return qaNamePattern.test(record?.deck?.name ?? "");
}

async function pruneLocal() {
  let files = [];
  try {
    files = await readdir(localShareDir);
  } catch {
    return { scanned: 0, pruned: 0 };
  }

  let scanned = 0;
  let pruned = 0;

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const pathname = join(localShareDir, file);
    const record = parseRecord(await readFile(pathname, "utf8"));
    scanned += 1;
    if (!shouldPrune(record)) continue;
    pruned += 1;
    if (!dryRun) await rm(pathname, { force: true });
  }

  return { scanned, pruned };
}

async function readBlobRecord(pathname) {
  try {
    const result = await get(pathname, { access: "private" });
    if (result?.statusCode !== 200) return null;
    return parseRecord(await new Response(result.stream).text());
  } catch {
    return null;
  }
}

async function pruneBlob() {
  if (!hasBlobCredentials()) return { scanned: 0, pruned: 0 };

  let cursor;
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
      const record = await readBlobRecord(blob.pathname);
      scanned += 1;
      if (!shouldPrune(record)) continue;
      pruned += 1;
      if (!dryRun) await del(blob.pathname);
    }
  } while (cursor);

  return { scanned, pruned };
}

const [local, blob] = await Promise.all([pruneLocal(), pruneBlob()]);

console.log(
  JSON.stringify(
    {
      status: "ok",
      dryRun,
      qaOnly,
      maxAgeDays,
      local,
      blob,
    },
    null,
    2,
  ),
);
