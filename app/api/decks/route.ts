import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { sanitizeSharedDeck } from "../../deck-share-schema";
import { saveSharedDeck } from "../../share-store";

export const runtime = "nodejs";

const MAX_SHARE_BODY_BYTES = 64 * 1024;

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
