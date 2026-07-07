import { DeckBuilder } from "../../page";
import { loadSharedDeck } from "../../share-store";
import { notFound } from "next/navigation";

type SharedDeckPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function isValidShareId(id: string) {
  return /^[A-Za-z0-9_-]{8,48}$/.test(id);
}

export default async function SharedDeckPage({ params }: SharedDeckPageProps) {
  const { id } = await params;
  if (!isValidShareId(id)) notFound();

  const deck = await loadSharedDeck(id);
  if (!deck) notFound();

  return <DeckBuilder sharedDeckId={id} initialSharedDeck={deck} />;
}
