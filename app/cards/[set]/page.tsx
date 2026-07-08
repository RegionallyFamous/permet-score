import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cardsForSetSlug,
  groupedCards,
  setSlug,
} from "../card-reference";

const siteUrl = "https://permetlink.com";

type SetPageProps = {
  params: Promise<{
    set: string;
  }>;
};

export function generateStaticParams() {
  return groupedCards().map(([set]) => ({
    set: setSlug(set),
  }));
}

export async function generateMetadata({
  params,
}: SetPageProps): Promise<Metadata> {
  const { set } = await params;
  const group = cardsForSetSlug(set);
  if (!group) return {};

  const title = `${group.set} Gundam Card Game Cards`;
  const description = `Browse ${group.cards.length} ${group.set} Gundam Card Game cards in Permet Link, including numbers, names, colors, types, costs, AP, HP, traits, and rules text.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/cards/${setSlug(group.set)}`,
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/cards/${setSlug(group.set)}`,
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
      title,
      description,
      images: ["/permet-link-logo.png"],
    },
  };
}

export default async function CardSetPage({ params }: SetPageProps) {
  const { set } = await params;
  const group = cardsForSetSlug(set);
  if (!group) notFound();

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${group.set} Gundam Card Game Cards`,
    url: `${siteUrl}/cards/${setSlug(group.set)}`,
    isPartOf: {
      "@type": "CollectionPage",
      name: "Gundam Card Game Card Library",
      url: `${siteUrl}/cards`,
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: group.cards.length,
      itemListElement: group.cards.map((card, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${card.number} ${card.name}`,
      })),
    },
  };

  return (
    <main className="min-h-screen bg-[#05060a] text-[#f7f7f2]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <nav
          aria-label="Permet Link reference"
          className="flex flex-wrap items-center gap-3 font-display text-sm font-black uppercase text-[#d9ecff]"
        >
          <Link href="/" className="text-[#f6c542] hover:text-[#fff2bd]">
            Open Builder
          </Link>
          <Link href="/cards" className="hover:text-[#8bdcff]">
            Card Library
          </Link>
          <Link href="/guide" className="hover:text-[#8bdcff]">
            Guide
          </Link>
        </nav>

        <header className="grid gap-4 border-b border-[#8bdcff]/20 pb-8">
          <p className="font-display text-sm font-black uppercase tracking-[0.18em] text-[#8bdcff]">
            Set Card Reference
          </p>
          <h1 className="font-display text-4xl font-black uppercase leading-none text-[#f7f7f2] sm:text-6xl">
            {group.set} Gundam Card Game cards
          </h1>
          <p className="max-w-4xl text-xl font-semibold leading-8 text-[#d9ecff]/84">
            {group.cards.length} cards from {group.set}, including card numbers,
            names, rules text, colors, types, costs, AP, HP, traits, sources, and
            set names.
          </p>
        </header>

        <div className="overflow-x-auto rounded-sm border border-[#8bdcff]/18 bg-[#080d13]">
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <thead className="bg-[#111923] font-display text-xs font-black uppercase text-[#8bdcff]">
              <tr>
                <th className="px-3 py-3">Number</th>
                <th className="px-3 py-3">Card</th>
                <th className="px-3 py-3">Color</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Lv</th>
                <th className="px-3 py-3">Cost</th>
                <th className="px-3 py-3">AP</th>
                <th className="px-3 py-3">HP</th>
                <th className="px-3 py-3">Trait / Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#a7b5c9]/12">
              {group.cards.map((card) => (
                <tr key={card.number} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 font-display text-base font-black text-[#f7f7f2]">
                    {card.number}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-display text-lg font-black uppercase text-[#f7f7f2]">
                      {card.name}
                    </div>
                    {card.text && card.text !== "-" && (
                      <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-[#d9ecff]/70">
                        {card.text}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.color}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.type}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.level}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.cost}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.ap}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.hp}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold leading-6 text-[#d9ecff]/70">
                    {[card.trait, card.source, card.set].filter(Boolean).join(" - ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
