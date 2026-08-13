"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { WalletButton } from "./WalletButton";

const links = [
  { href: "/employer", label: "Employer" },
  { href: "/worker", label: "Worker" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--accent-gradient)]">
            <Zap className="h-4.5 w-4.5 text-[#06070f]" strokeWidth={2.5} />
          </span>
          <span className="text-base font-semibold tracking-tight">
            Flash<span className="gradient-text">Wage</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--surface-hover)] text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <WalletButton />
      </div>
    </header>
  );
}
