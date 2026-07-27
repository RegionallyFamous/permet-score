import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CARD_BY_NUMBER } from "../../card-pool";
import type { CardColor } from "../../card-data";
import type { SharedDeckState } from "../../deck-share-schema";
import { DeckBuilder } from "../../page";
import { loadSharedDeck } from "../../share-store";

type SharedDeckPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const revalidate = 300;

const MAIN_TARGET = 50;
const RESOURCE_TARGET = 10;

function isValidShareId(id: string) {
  return /^[A-Za-z0-9_-]{8,48}$/.test(id);
}

function totalCards(quantities: Record<string, number>) {
  return Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
}

function sharedDeckColors(deck: SharedDeckState) {
  return Array.from(
    new Set(
      Object.keys(deck.main)
        .map((number) => CARD_BY_NUMBER.get(number)?.color)
        .filter((color): color is CardColor => Boolean(color && color !== "-")),
    ),
  );
}

function sharedDeckDescription(deck: SharedDeckState) {
  const mainTotal = totalCards(deck.main);
  const resourceTotal = totalCards(deck.resource);
  const colors = sharedDeckColors(deck);
  const colorText = colors.length ? colors.join(" / ") : "colorless";
  return `${mainTotal}/${MAIN_TARGET} main, ${resourceTotal}/${RESOURCE_TARGET} resource, ${colorText} Gundam Card Game decklist with selected printings and TCGplayer links.`;
}

const loadValidSharedDeck = cache(async (id: string) => {
  if (!isValidShareId(id)) notFound();
  const deck = await loadSharedDeck(id);
  if (!deck) notFound();
  return deck;
});

export async function generateMetadata({
  params,
}: SharedDeckPageProps): Promise<Metadata> {
  const { id } = await params;
  const deck = await loadValidSharedDeck(id);
  const path = `/decks/${id}`;
  const title = `${deck.name} Decklist`;
  const description = sharedDeckDescription(deck);

  return {
    title,
    description,
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: `${title} | Permet Link`,
      description,
      url: path,
      siteName: "Permet Link",
      type: "website",
      images: [
        {
          url: "/permet-link-logo.png",
          width: 1983,
          height: 793,
          alt: "Permet Link",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Permet Link`,
      description,
      images: ["/permet-link-logo.png"],
    },
  };
}

export default async function SharedDeckPage({ params }: SharedDeckPageProps) {
  const { id } = await params;
  const deck = await loadValidSharedDeck(id);

  return <DeckBuilder sharedDeckId={id} initialSharedDeck={deck} />;
}
