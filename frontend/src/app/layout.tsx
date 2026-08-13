import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { Navbar } from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlashWage — Instant gig payouts on Stellar",
  description:
    "Milestone escrow and instant, Path Payment-powered payouts for gig work, built on Stellar and Soroban.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[var(--border)] py-6">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-6 text-center text-xs text-[var(--muted)] sm:flex-row sm:justify-between">
              <p>FlashWage — open source, built on Stellar &amp; Soroban.</p>
              <a
                href="https://github.com/gidanzaki/flashwage"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-[var(--foreground)]"
              >
                github.com/gidanzaki/flashwage
              </a>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
