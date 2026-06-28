"use client";

import { ArrowRight, Cpu } from "lucide-react";
import Link from "next/link";

export function CTASection() {
  return (
    <section className="py-32 px-6 bg-zinc-950 text-zinc-50 border-b border-zinc-900 relative overflow-hidden text-center">
      {/* Dynamic ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-tr from-zinc-900/10 via-zinc-800/5 to-zinc-900/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
        {/* Stellar Network status simulator badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 text-xs font-mono mb-8 tracking-tight">
          <Cpu size={12} className="text-zinc-400 animate-pulse" />
          <span>Stellar Testnet Status: Operational</span>
        </div>

        <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight max-w-2xl text-zinc-100">
          Accept your first Stellar stablecoin payment.
        </h2>

        <p className="text-zinc-400 text-base md:text-lg max-w-xl mb-10 font-light leading-relaxed">
          Start from the existing dashboard, then use TalaKit Pay Alpha to create payment links,
          test checkout flows, and watch webhook delivery as the payment features land.
        </p>

        {/* Action button triggers */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center w-full sm:w-auto">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-8 py-4 rounded-xl text-sm font-semibold bg-white text-zinc-950 hover:bg-zinc-200 hover:scale-[1.02] shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all flex items-center justify-center gap-2"
          >
            <span>Open Dashboard</span>
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/debug"
            className="w-full sm:w-auto px-8 py-4 rounded-xl text-sm font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-all"
          >
            Debug a Payment
          </Link>
        </div>

        {/* Footnote details */}
        <div className="mt-16 text-xs text-zinc-600 font-mono flex flex-wrap items-center gap-2 justify-center select-none">
          <span>PAYMENT LINKS</span>
          <span className="text-zinc-800">•</span>
          <span>CHECKOUT SDK</span>
          <span className="text-zinc-800">•</span>
          <span>PAYMENT WEBHOOKS</span>
        </div>
      </div>
    </section>
  );
}
