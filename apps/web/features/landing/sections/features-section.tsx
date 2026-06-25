"use client";

import { Fingerprint, Cpu, Bell, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: Fingerprint,
    title: "Contract Registry",
    description:
      "Register, organize, and verify official Soroban smart contracts. Instantly associate identities with contract hashes and access verifiable configurations.",
    badge: "Active",
  },
  {
    icon: Cpu,
    title: "Transaction Debugger",
    description:
      "Inspect, decode, and troubleshoot complex Testnet transactions. Drill down into execution details, XDR values, and exact operation errors.",
    badge: "Active",
  },
  {
    icon: Bell,
    title: "Event Monitor",
    description:
      "Stream Soroban smart contract events in real-time. Set up triggers and watch logs as transactions land on the Stellar Testnet ledger.",
    badge: "Beta",
  },
  {
    icon: ShieldCheck,
    title: "Webhook Delivery Proofs",
    description:
      "Secure webhook payloads with cryptographic signatures. Verifiable proof ensures secure, verified notifications for your server handlers.",
    badge: "Upcoming",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-24 px-6 bg-zinc-950 text-zinc-50 border-b border-zinc-900 relative">
      {/* Decorative gradient blur */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 bg-zinc-800/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        {/* Title Block */}
        <div className="max-w-2xl mb-16">
          <h2 className="text-zinc-500 font-mono text-xs uppercase tracking-widest mb-3">
            Core Capabilities
          </h2>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Designed for Stellar developers who ship.
          </h3>
          <p className="text-zinc-400 text-base">
            No more hunting through block explorers or writing custom indexers. TalaKit consolidates
            the critical tools you need to build, audit, and debug.
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

                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 group-hover:border-zinc-500/50 group-hover:bg-zinc-900/60 text-zinc-400 group-hover:text-zinc-100 flex items-center justify-center transition-all duration-300">
                    <Icon size={24} />
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      item.badge === "Active"
                        ? "border-zinc-300 bg-zinc-900 text-zinc-100"
                        : item.badge === "Beta"
                          ? "border-zinc-700/50 bg-zinc-900 text-zinc-300"
                          : "border-zinc-800 bg-zinc-900 text-zinc-500"
                    }`}
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
