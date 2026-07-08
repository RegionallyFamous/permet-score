import type { Metadata } from "next";
import Link from "next/link";
import { CARD_POOL } from "../card-pool";
import {
  groupedCards,
  setSlug,
} from "./card-reference";

const siteUrl = "https://permetlink.com";
const title = "Gundam Card Game Card Library";
const description =
  "Browse the crawlable Permet Link Gundam Card Game card library by set, with card numbers, names, colors, types, costs, and deck-building fields.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/cards",
  },
  openGraph: {
    title,
    description,
    url: `${siteUrl}/cards`,
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

const groups = groupedCards();
const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: title,
  url: `${siteUrl}/cards`,
  description,
  isPartOf: {
    "@type": "WebSite",
    name: "Permet Link",
    url: siteUrl,
  },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: groups.length,
    itemListElement: groups.map(([set, cards], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `${set} card library`,
      url: `${siteUrl}/cards/${setSlug(set)}`,
      numberOfItems: cards.length,
    })),
  },
};

export default function CardsPage() {
  return (
    <main className="min-h-screen bg-[#05060a] text-[#f7f7f2]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <nav
          aria-label="Permet Link reference"
          className="flex flex-wrap items-center gap-3 font-display text-sm font-black uppercase text-[#d9ecff]"
        >
          <Link href="/" className="text-[#f6c542] hover:text-[#fff2bd]">
            Open Builder
          </Link>
          <Link href="/guide" className="hover:text-[#8bdcff]">
            Guide
          </Link>
          <Link href="/llms.txt" className="hover:text-[#8bdcff]">
            AI Index
          </Link>
        </nav>

        <header className="grid gap-4 border-b border-[#8bdcff]/20 pb-8">
          <p className="font-display text-sm font-black uppercase tracking-[0.18em] text-[#8bdcff]">
            Crawlable Card Reference
          </p>
          <h1 className="font-display text-4xl font-black uppercase leading-none text-[#f7f7f2] sm:text-6xl">
            Gundam Card Game card library
          </h1>
          <p className="max-w-4xl text-xl font-semibold leading-8 text-[#d9ecff]/84">
            A search-friendly index of {CARD_POOL.length} cards loaded by Permet
            Link. Choose a set below for full card numbers, names, rules text,
            colors, types, costs, AP, HP, traits, and sources.
          </p>
        </header>

        <section className="grid gap-4">
          <h2 className="font-display text-3xl font-black uppercase text-[#f7f7f2]">
            Sets
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(([set, cards]) => (
              <Link
                key={set}
                href={`/cards/${setSlug(set)}`}
                className="rounded-sm border border-[#8bdcff]/18 bg-[#101720]/80 p-4 shadow-lg shadow-black/25 hover:border-[#8bdcff]/45"
              >
                <span className="font-display text-3xl font-black uppercase text-[#fff2bd]">
                  {set}
                </span>
                <span className="ml-2 align-middle font-display text-sm font-black uppercase text-[#d9ecff]/60">
                  {cards.length} cards
                </span>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#d9ecff]/72">
                  {cards
                    .slice(0, 4)
                    .map((card) => `${card.number} ${card.name}`)
                    .join(" | ")}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
