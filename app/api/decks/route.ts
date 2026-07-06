import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { sanitizeSharedDeck } from "../../deck-share-schema";
import { saveSharedDeck } from "../../share-store";

export const runtime = "nodejs";

function randomShareId() {
  return randomBytes(8).toString("base64url");
}

export async function POST(request: Request) {
  let body: unknown;

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
