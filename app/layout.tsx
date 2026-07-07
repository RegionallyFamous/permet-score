import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-gundam-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://permetlink.com"),
  title: "Permet Link",
  description: "A fast local-first Gundam Card Game deck builder and alt-art planner.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Permet Link",
    description: "A fast local-first Gundam Card Game deck builder and alt-art planner.",
    url: "https://permetlink.com",
    siteName: "Permet Link",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ],
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
        <link rel="preload" as="image" href="/permet-link-logo.png" />
      </head>
      <body
        className={`${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
