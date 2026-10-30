import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap", style: ["normal"] });

export const metadata: Metadata = {
  title: "Plainspoken: rewrite AI-sounding text in plain human prose",
  description:
    "Open source. Rewrites AI-sounding text into natural writing while locking names, numbers, and quotes, checking that every claim survives, and showing what changed. No signup.",
  openGraph: {
    title: "Plainspoken",
    description: "Rewrite AI-sounding text in plain human prose, with a meaning check and an honest tell report.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body>{children}</body>
    </html>
  );
}
