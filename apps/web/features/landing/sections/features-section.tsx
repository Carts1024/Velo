"use client";

import {
  Activity,
  Bell,
  Code2,
  CreditCard,
  Fingerprint,
  LayoutDashboard,
  Link2,
  WalletCards,
} from "lucide-react";

const features = [
  {
    icon: Link2,
    title: "Stablecoin Payment Links",
    description:
      "Generate shareable checkout URLs for fixed USDC or test-asset payments tied to a TalaKit project.",
    badge: "Alpha",
  },
  {
    icon: WalletCards,
    title: "Hosted Checkout",
    description:
      "Give customers a focused payment page with wallet connection, payment status, success, and failure states.",
    badge: "Coming Soon",
  },
  {
    icon: Code2,
    title: "Checkout SDK",
    description:
      "Create checkout sessions from app code and redirect customers with a small TypeScript helper.",
    badge: "Coming Soon",
  },
  {
    icon: Bell,
    title: "Payment Webhooks",
    description:
      "Send payment.succeeded and related delivery events to developer backends with visible delivery logs.",
    badge: "Alpha",
  },
  {
    icon: LayoutDashboard,
    title: "Payment Dashboard",
    description:
      "Track PaymentIntent status, recent payments, webhook deliveries, and copy integration snippets from one workspace.",
    badge: "Coming Soon",
  },
  {
    icon: Fingerprint,
    title: "Verified Merchant Registry",
    description:
      "Anchor project identity on-chain so customers can see which wallet and project are behind a TalaKit Pay checkout.",
    badge: "Supporting",
  },
  {
    icon: CreditCard,
    title: "Payment Debugger",
    description:
      "Inspect payment transaction hashes, ledger results, payer and receiver details, and payment-specific failure reasons.",
    badge: "Supporting",
  },
  {
    icon: Activity,
    title: "Payment Event Monitor",
    description:
      "Watch payment and webhook activity during the Alpha demo without building a full custom indexer.",
    badge: "Supporting",
  },
];

function getBadgeClassName(badge: string) {
  if (badge === "Alpha") {
    return "border-zinc-300 bg-zinc-900 text-zinc-100";
  }

  if (badge === "Coming Soon") {
    return "border-zinc-700/50 bg-zinc-900 text-zinc-300";
  }

  return "border-zinc-800 bg-zinc-900 text-zinc-500";
}

export function FeaturesSection() {
  return (
    <section className="py-24 px-6 bg-zinc-950 text-zinc-50 border-b border-zinc-900 relative">
      {/* Decorative gradient blur */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 bg-zinc-800/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Title Block */}
        <div className="max-w-2xl mb-16">
          <h2 className="text-zinc-500 font-mono text-xs uppercase tracking-widest mb-3">
            TalaKit Pay Alpha
          </h2>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Payment infrastructure, previewed in one place.
          </h3>
          <p className="text-zinc-400 text-base">
            Lead with payment acceptance, then support the integration with dashboard visibility,
            merchant verification, and payment-focused debugging.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="group relative p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800/60 hover:bg-zinc-900/50 hover:border-zinc-700/60 hover:shadow-[0_4px_30px_rgba(0,0,0,0.4)] transition-all duration-300 backdrop-blur-sm"
              >
                {/* Glow outline decoration */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/0 to-zinc-400/0 group-hover:from-white/5 group-hover:to-zinc-400/5 transition-all duration-300 pointer-events-none" />

                <div className="flex items-start justify-between mb-6 gap-4">
                  <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 group-hover:border-zinc-500/50 group-hover:bg-zinc-900/60 text-zinc-400 group-hover:text-zinc-100 flex items-center justify-center transition-all duration-300 shrink-0">
                    <Icon size={24} />
                  </div>
                  <span
                    className={
                      "text-[10px] font-mono px-2 py-0.5 rounded-full border text-right " +
                      getBadgeClassName(item.badge)
                    }
                  >
                    {item.badge}
                  </span>
                </div>

                <h4 className="text-xl font-bold mb-3 text-zinc-100 group-hover:text-zinc-50 transition-colors">
                  {item.title}
                </h4>
                <p className="text-zinc-400 text-sm leading-relaxed font-light">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
