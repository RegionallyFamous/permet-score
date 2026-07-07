import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { sanitizeSharedDeck } from "../../deck-share-schema";
import { saveSharedDeck } from "../../share-store";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  let body: unknown;

  if (!hasJsonContentType(request)) {
    return NextResponse.json(
      { error: "Content-Type must be application/json." },
      { status: 415 },
    );
  }

  try {
    body = await request.json();
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
  } catch {
    return NextResponse.json(
      { error: "Could not save this deck right now." },
      { status: 500 },
    );
  }
}
