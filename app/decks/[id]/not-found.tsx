import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, Home, Radar } from "lucide-react";

export default function SharedDeckNotFound() {
  return (
    <main className="min-h-screen bg-[#05060a] px-4 py-5 text-[#f7f7f2]">
      <div
        className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-3xl flex-col justify-center gap-5"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(5,6,10,0.28), rgba(5,6,10,0.94)), url(/assets/permet-armor-ui-v2.webp)",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <Image
          src="/permet-link-logo-header.webp"
          alt="Permet Link"
          width={640}
          height={256}
          className="h-auto w-48 object-contain object-left sm:w-64"
        />
        <section className="gcg-panel overflow-hidden rounded-sm border border-[#e31b23]/35 bg-[#07090d]/96 shadow-2xl shadow-black/40">
          <div className="hero-surface relative grid gap-4 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[#fff2bd]">
              <AlertTriangle size={20} />
              <span className="font-display text-lg font-black uppercase">
                Shared Deck Not Found
              </span>
            </div>
            <h1 className="font-display text-4xl font-black uppercase leading-none text-[#f7f7f2] sm:text-5xl">
              Link Offline
            </h1>
            <p className="max-w-xl text-lg font-bold leading-7 text-[#f7f7f2]/72">
              This shared deck link is missing, expired, or no longer available.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#8bdcff]/35 bg-[#1167d8]/14 px-4 font-display text-base font-black uppercase text-[#d9ecff]"
              >
                <Home size={16} />
                Open Builder
              </Link>
              <span className="inline-flex h-11 items-center gap-2 rounded-sm border border-[#f6c542]/28 bg-[#f6c542]/10 px-3 font-display text-base font-black uppercase text-[#fff2bd]">
                <Radar size={16} />
                404
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
