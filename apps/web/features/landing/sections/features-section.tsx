"use client";

import {
  Activity,
  Bell,
  Code2,
  CreditCard,
  Fingerprint,
  LayoutDashboard,
  Network,
  WalletCards,
} from "lucide-react";

const features = [
  {
    icon: Fingerprint,
    title: "Project Infrastructure",
    description:
      "Register projects, verify official contracts, and keep Stellar app metadata organized from one workspace.",
    badge: "Active",
  },
  {
    icon: Code2,
    title: "Developer Tooling",
    description:
      "Use typed helpers, integration snippets, and repeatable workflows instead of stitching every primitive together manually.",
    badge: "Active",
  },
  {
    icon: Network,
    title: "Stellar Operations",
    description:
      "Support wallet, asset, environment, and network workflows that teams need before an app is ready to launch.",
    badge: "Alpha",
  },
  {
    icon: CreditCard,
    title: "Transaction Debugger",
    description:
      "Inspect Testnet transactions, ledger results, fees, operation details, and failure reasons while integrating.",
    badge: "Active",
  },
  {
    icon: Bell,
    title: "Webhook Infrastructure",
    description:
      "Test server callbacks, review delivery logs, and prepare reliable event notifications for backend workflows.",
    badge: "Alpha",
  },
  {
    icon: Activity,
    title: "Event Monitor",
    description:
      "Watch contract and app activity during demos without building a custom indexer on day one.",
    badge: "Beta",
  },
  {
    icon: WalletCards,
    title: "TalaKit Pay",
    description:
      "Upcoming payment infrastructure for payment links, checkout SDKs, and app-native Stellar stablecoin flows.",
    badge: "Roadmap",
  },
  {
    icon: LayoutDashboard,
    title: "Infrastructure Console",
    description:
      "Bring project status, verification, debugging, webhooks, and roadmap modules into one developer surface.",
    badge: "Active",
  },
];

function getBadgeClassName(badge: string) {
  if (badge === "Active") {
    return "border-zinc-300 bg-zinc-900 text-zinc-100";
  }

  if (badge === "Alpha" || badge === "Beta") {
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
            Infrastructure Suite
          </h2>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            The operating layer for Stellar builders.
          </h3>
          <p className="text-zinc-400 text-base">
            TalaKit combines project registry, developer workflows, debugging, event delivery, and
            payment infrastructure into one practical workspace.
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
