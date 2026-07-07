import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  sanitizeSharedDeck,
  validateSharedDeckPayload,
} from "../../deck-share-schema";
import {
  incrementSharedDeckDailyCounter,
  saveSharedDeck,
} from "../../share-store";

export const runtime = "nodejs";

const MAX_SHARE_BODY_BYTES = 64 * 1024;
const SHARE_RATE_LIMIT_MAX = 180;
const SHARE_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const SHARE_DAILY_RATE_LIMIT_MAX = 600;
const shareRateBuckets = new Map<string, { count: number; resetAt: number }>();

function randomShareId() {
  return randomBytes(8).toString("base64url");
}

function hasJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    mediaType === "application/json" ||
    (mediaType.startsWith("application/") && mediaType.endsWith("+json"))
  );
}

function shareRateKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip") ??
    forwardedFor ??
    request.headers.get("x-real-ip") ??
    "anonymous"
  );
}

function shareRateKeyHash(request: Request) {
  return createHash("sha256").update(shareRateKey(request)).digest("hex");
}

function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(date = new Date()) {
  return Math.max(
    1,
    Math.ceil(
      (Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1,
      ) -
        date.getTime()) /
        1000,
    ),
  );
}

function checkShareRateLimit(request: Request) {
  const now = Date.now();
  const key = shareRateKey(request);
  const current = shareRateBuckets.get(key);

  if (!current || current.resetAt <= now) {
    shareRateBuckets.set(key, {
      count: 1,
      resetAt: now + SHARE_RATE_LIMIT_WINDOW_MS,
    });
    return null;
  }

  if (current.count >= SHARE_RATE_LIMIT_MAX) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }

  current.count += 1;
  return null;
}

async function readRequestTextWithinLimit(request: Request) {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_SHARE_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

export async function POST(request: Request) {
  let body: unknown;

  if (!hasJsonContentType(request)) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_SHARE_BODY_BYTES) {
    return NextResponse.json(
      { error: "Deck payload is too large." },
      { status: 413 },
    );
  }

  try {
    const bodyText = await readRequestTextWithinLimit(request);
    if (bodyText === null) {
      return NextResponse.json(
        { error: "Deck payload is too large." },
        { status: 413 },
      );
    }
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const validationError = validateSharedDeckPayload(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const retryAfter = checkShareRateLimit(request);
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: "Too many shared decks. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  try {
    const dailyLimit = await incrementSharedDeckDailyCounter(
      shareRateKeyHash(request),
      utcDayKey(),
      SHARE_DAILY_RATE_LIMIT_MAX,
    );
    if (!dailyLimit.allowed) {
      return NextResponse.json(
        { error: "Daily shared deck limit reached. Try again tomorrow." },
        {
          status: 429,
          headers: { "Retry-After": String(secondsUntilNextUtcDay()) },
        },
      );
    }
  } catch (error) {
    console.error("Shared deck rate limit check failed", error);
    return NextResponse.json(
      { error: "Could not save this deck right now." },
      { status: 503 },
    );
  }

  const deck = sanitizeSharedDeck(body);
  if (!deck) {
    return NextResponse.json({ error: "Deck is empty or invalid." }, { status: 400 });
  }

  try {
    const id = randomShareId();
    await saveSharedDeck(id, deck);

    return NextResponse.json(
      {
        id,
        shareUrl: `/decks/${id}`,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Shared deck save failed", error);
    return NextResponse.json(
      { error: "Could not save this deck right now." },
      { status: 500 },
    );
  }
}
