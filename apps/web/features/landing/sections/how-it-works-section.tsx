"use client";

import { Wallet, FileCode, Search } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Wallet,
    title: "Connect Wallet",
    description:
      "Hook up Freighter or any Wallet Standard compatible client to create your owner workspace in seconds.",
  },
  {
    number: "02",
    icon: FileCode,
    title: "Register Contracts",
    description:
      "Provide your Soroban contract ID or draft details. Verify owners and sign configurations cryptographically.",
  },
  {
    number: "03",
    icon: Search,
    title: "Debug & Monitor",
    description:
      "Triage transaction failures, trace ledgers, stream contract events, and view real-time operations dashboards.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="py-24 px-6 bg-zinc-950 text-zinc-50 border-b border-zinc-900 relative">
      <div className="max-w-7xl mx-auto">
        {/* Title block */}
        <div className="text-center max-w-2xl mx-auto mb-20">
          <h2 className="text-zinc-500 font-mono text-xs uppercase tracking-widest mb-3">
            Workflow Setup
          </h2>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Zero configuration. Full power.
          </h3>
          <p className="text-zinc-400 text-sm font-light">
            Skip the infrastructure boilerplate and get straight to ledger operations. Here is how
            simple it is to verify and scale.
          </p>
        </div>

        {/* Steps display */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 relative">
          {/* Connector Line (Desktop) */}
          <div className="hidden lg:block absolute top-16 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-violet-500/20 via-sky-400/20 to-violet-500/20 z-0 border-t border-dashed border-zinc-800" />

          {steps.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="flex flex-col items-center text-center relative z-10 group">
                {/* Step Circle with Icon */}
                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sky-400 group-hover:text-violet-400 group-hover:border-violet-500/50 group-hover:bg-violet-950/20 shadow-[0_0_15px_rgba(0,0,0,0.3)] transition-all duration-300 mb-6">
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
