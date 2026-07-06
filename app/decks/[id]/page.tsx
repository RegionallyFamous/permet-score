import { DeckBuilder } from "../../page";

type SharedDeckPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SharedDeckPage({ params }: SharedDeckPageProps) {
  const { id } = await params;
  return <DeckBuilder sharedDeckId={id} />;
}
