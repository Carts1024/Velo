"use client";

import { BellRing, CheckCircle2, FileCode, Link2, Store, Wallet } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Wallet,
    title: "Connect Wallet",
    description:
      "Connect Freighter on Stellar Testnet so TalaKit can tie payment setup to the project owner.",
  },
  {
    number: "02",
    icon: Store,
    title: "Create Merchant Project",
    description:
      "Create a project profile with receiver wallet, accepted stablecoin, and on-chain merchant identity.",
  },
  {
    number: "03",
    icon: Link2,
    title: "Create Payment Link",
    description:
      "Generate a hosted checkout URL from the dashboard or start the same flow through the SDK snippet.",
  },
  {
    number: "04",
    icon: FileCode,
    title: "Customer Pays",
    description:
      "The customer opens checkout, connects a wallet, and submits the Stellar stablecoin payment.",
  },
  {
    number: "05",
    icon: BellRing,
    title: "Webhook Fires",
    description:
      "TalaKit confirms the transaction, updates the PaymentIntent, and sends payment events to your backend.",
  },
  {
    number: "06",
    icon: CheckCircle2,
    title: "Dashboard Confirms",
    description:
      "Review payment status, transaction details, and webhook delivery logs from the developer workspace.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="py-24 px-6 bg-zinc-950 text-zinc-50 border-b border-zinc-900 relative">
      <div className="max-w-7xl mx-auto">
        {/* Title block */}
        <div className="text-center max-w-2xl mx-auto mb-20">
          <h2 className="text-zinc-500 font-mono text-xs uppercase tracking-widest mb-3">
            Demo Flow
          </h2>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            From project setup to paid webhook.
          </h3>
          <p className="text-zinc-400 text-sm font-light">
            The Alpha demo is built around one clear payment path: create a checkout, accept a
            Testnet stablecoin payment, and prove the backend received the event.
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
