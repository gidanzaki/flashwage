import Link from "next/link";
import { ArrowRight, Briefcase, HandCoins, Lock, SendHorizontal, Wallet } from "lucide-react";
import { AnalyticsBanner } from "@/components/AnalyticsBanner";

const steps = [
  {
    icon: Lock,
    title: "Employer locks funds",
    body: "An employer defines a milestone and its payout amount, then locks USDC into the escrow contract — the worker never has to wonder if the money exists.",
  },
  {
    icon: HandCoins,
    title: "Milestone gets released",
    body: "Once the work's done, the employer (or the platform admin) releases the payout. If a deadline passes with no release, anyone can trigger it — a worker's payout can't get stuck behind silence.",
  },
  {
    icon: SendHorizontal,
    title: "Worker cashes out locally",
    body: "The worker withdraws via a Stellar Path Payment straight into a local, fiat-backed stablecoin — no separate off-ramp, no multi-day wire.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 py-20 text-center sm:py-28">
        <span className="rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--muted-strong)]">
          Built on Stellar &amp; Soroban
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Gig work, paid the moment it&apos;s <span className="gradient-text">done</span>.
        </h1>
        <p className="max-w-xl text-base text-[var(--muted-strong)] sm:text-lg">
          FlashWage locks employer funds in a Soroban escrow contract and settles milestone
          payouts to workers in seconds — landing as a local stablecoin, not a multi-day wire.
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/employer"
            className="flex items-center justify-center gap-2 rounded-full bg-[image:var(--accent-gradient)] px-6 py-3 text-sm font-semibold text-[#06070f] transition hover:opacity-90"
          >
            <Briefcase className="h-4 w-4" />
            I&apos;m an employer
          </Link>
          <Link
            href="/worker"
            className="flex items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-3 text-sm font-semibold transition hover:bg-[var(--surface-hover)]"
          >
            <Wallet className="h-4 w-4" />
            I&apos;m a worker
          </Link>
        </div>
      </section>

      {/* Analytics / transparency banner */}
      <section className="pb-20">
        <AnalyticsBanner />
      </section>

      {/* How it works */}
      <section className="pb-24">
        <h2 className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-[var(--muted)]">
          Three on-chain steps, no intermediary holding the money in between.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.title} className="panel relative p-6">
              <span className="text-xs font-mono text-[var(--muted)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <step.icon className="mt-3 h-6 w-6 text-[var(--accent-cyan)]" />
              <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-strong)]">
                {step.body}
              </p>
              {i < steps.length - 1 && (
                <ArrowRight className="absolute top-6 -right-3 hidden h-4 w-4 text-[var(--muted)] sm:block" />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
