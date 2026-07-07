import { DeckBuilder } from "../../page";
import { loadSharedDeck } from "../../share-store";

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
  const deck = isValidShareId(id) ? await loadSharedDeck(id) : null;
  return <DeckBuilder sharedDeckId={id} initialSharedDeck={deck} />;
}
