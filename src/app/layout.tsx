import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Memex — Citation-first knowledge retrieval",
  description:
    "A retrieval-augmented chat system that answers questions from your personal Markdown notes, cites the exact source chunk for every claim, and exposes a decision timeline so you can trace why past technical choices were made.",
  keywords: ["Memex", "RAG", "citation-first", "knowledge retrieval", "Next.js", "decision timeline"],
  authors: [{ name: "Memex" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
