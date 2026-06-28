"use client";

import { CheckCircle2, FileCode, Rocket, Settings2, Store, Wallet } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Store,
    title: "Create",
    description:
      "Start with a Stellar project workspace that can hold app metadata, official contracts, and demo-ready configuration.",
  },
  {
    number: "02",
    icon: Settings2,
    title: "Configure",
    description:
      "Set networks, wallets, assets, webhook endpoints, and verification details as your infrastructure baseline.",
  },
  {
    number: "03",
    icon: FileCode,
    title: "Integrate",
    description:
      "Use snippets, helpers, and dashboard workflows to connect your app without rebuilding every Stellar primitive.",
  },
  {
    number: "04",
    icon: Wallet,
    title: "Operate",
    description:
      "Debug transactions, observe events, and confirm backend callbacks while your app moves through Testnet.",
  },
  {
    number: "05",
    icon: Rocket,
    title: "Launch",
    description:
      "Use verified project pages and infrastructure status to make your Stellar app easier to trust and demo.",
  },
  {
    number: "06",
    icon: CheckCircle2,
    title: "Expand",
    description:
      "Add roadmap modules like TalaKit Pay when your app needs payment links, checkout, and payment webhooks.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="py-24 px-6 bg-zinc-950 text-zinc-50 border-b border-zinc-900 relative">
      <div className="max-w-7xl mx-auto">
        {/* Title block */}
        <div className="text-center max-w-2xl mx-auto mb-20">
          <h2 className="text-zinc-500 font-mono text-xs uppercase tracking-widest mb-3">
            Infrastructure Flow
          </h2>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            From Stellar idea to working infrastructure.
          </h3>
          <p className="text-zinc-400 text-sm font-light">
            TalaKit helps teams create, configure, integrate, operate, launch, and expand without
            stitching together every tool from scratch.
          </p>
        </div>

        {/* Steps display */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 relative">
          {/* Connector Line (Desktop) */}
          <div className="hidden lg:block absolute top-16 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-zinc-800 via-zinc-700/50 to-zinc-800 z-0 border-t border-dashed border-zinc-800" />

          {steps.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="flex flex-col items-center text-center relative z-10 group">
                {/* Step Circle with Icon */}
                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-zinc-100 group-hover:border-zinc-500/50 group-hover:bg-zinc-900/60 shadow-[0_0_15px_rgba(0,0,0,0.3)] transition-all duration-300 mb-6">
                  <Icon size={24} />
                </div>

                {/* Step Number Badge */}
                <span className="font-mono text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-zinc-700 to-zinc-900 mb-3 select-none">
                  {item.number}
                </span>

                <h4 className="text-xl font-bold text-zinc-100 mb-2">{item.title}</h4>
                <p className="text-zinc-400 text-sm max-w-sm leading-relaxed font-light">
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
