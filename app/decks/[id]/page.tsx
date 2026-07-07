import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DeckBuilder } from "../../page";
import { loadSharedDeck } from "../../share-store";

type SharedDeckPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const revalidate = 300;

function isValidShareId(id: string) {
  return /^[A-Za-z0-9_-]{8,48}$/.test(id);
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
  const title = deck.name;
  const description =
    "Shared Gundam Card Game decklist with selected printings and TCGplayer links.";

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
