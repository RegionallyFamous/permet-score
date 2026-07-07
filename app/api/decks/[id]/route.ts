import { NextResponse } from "next/server";
import { loadSharedDeck } from "../../../share-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function validShareId(id: string) {
  return /^[A-Za-z0-9_-]{8,48}$/.test(id);
}

const sharedDeckCacheHeaders = {
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
  "Vercel-CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
};

const notFoundDeckCacheHeaders = {
  "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
  "Vercel-CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!validShareId(id)) {
    return NextResponse.json({ error: "Invalid share id." }, { status: 400 });
  }

  const deck = await loadSharedDeck(id);
  if (!deck) {
    return NextResponse.json(
      { error: "Deck not found." },
      { status: 404, headers: notFoundDeckCacheHeaders },
    );
  }

  return NextResponse.json(
    { id, deck },
    {
      headers: sharedDeckCacheHeaders,
    },
  );
}
