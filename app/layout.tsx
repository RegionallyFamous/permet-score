import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-gundam-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Permet Score",
  description: "A fast local-first Gundam Card Game deck builder and alt-art planner.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href="/assets/permet-armor-ui-v2.webp" />
        <link rel="preload" as="image" href="/assets/mecha-deck-hangar.png" />
        <link rel="preload" as="image" href="/permet-score-logo.png" />
      </head>
      <body
        className={`${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
