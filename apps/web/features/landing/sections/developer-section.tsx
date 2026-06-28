"use client";

import { CheckCircle2, Copy, Terminal } from "lucide-react";
import { useState } from "react";

const checkoutSnippet = [
  'import { createCheckout } from "@talakit/checkout";',
  "",
  "const checkout = await createCheckout({",
  "  apiKey: process.env.TALAKIT_API_KEY!,",
  '  amount: "10",',
  '  asset: "USDC",',
  '  description: "Alpha demo payment",',
  '  customerReference: "order_123",',
  '  successUrl: "https://example.com/success",',
  '  cancelUrl: "https://example.com/cancel",',
  "});",
  "",
  "window.location.href = checkout.url;",
].join("\n");

export function DeveloperSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(checkoutSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-24 px-6 bg-zinc-950 text-zinc-50 border-b border-zinc-900 relative">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Text Content */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <h2 className="text-zinc-500 font-mono text-xs uppercase tracking-widest">
              Checkout SDK Preview
            </h2>
            <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-2">
              Accept stablecoin payments in a few lines.
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed font-light">
              The Alpha SDK target is intentionally small: create a PaymentIntent, return a hosted
              checkout URL, and keep the Stellar transaction details out of your app code.
            </p>

            <ul className="flex flex-col gap-3 font-light text-zinc-300 text-sm mt-2">
              <li className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-zinc-400 shrink-0" />
                <span>Create a hosted checkout from app code</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-zinc-400 shrink-0" />
                <span>Redirect customers to a TalaKit Pay link</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-zinc-400 shrink-0" />
                <span>Track PaymentIntent status and webhook delivery</span>
              </li>
            </ul>
          </div>

          {/* Code Window Mock */}
          <div className="lg:col-span-7 relative">
            {/* Absolute blur background decoration */}
            <div className="absolute inset-0 bg-gradient-to-tr from-zinc-900/10 to-zinc-800/10 rounded-2xl blur-3xl pointer-events-none z-0" />

            <div className="relative z-10 w-full rounded-xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden font-mono text-xs">
              {/* IDE Header Bar */}
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-900 select-none">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 shrink-0" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 shrink-0" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-600 shrink-0" />
                  <span className="text-[10px] text-zinc-500 ml-3 flex items-center gap-1.5 truncate">
                    <Terminal size={12} className="text-zinc-600 shrink-0" />
                    checkout/create-checkout.ts
                  </span>
                </div>
                <button
                  onClick={handleCopy}
                  className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                  title="Copy snippet"
                >
                  {copied ? (
                    <span className="text-[9px] text-zinc-300 font-sans font-semibold">
                      Copied!
                    </span>
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>

              {/* Code Content */}
              <div className="p-5 overflow-x-auto text-zinc-300 leading-6 max-h-[380px] select-text">
                <pre>
                  <code>{checkoutSnippet}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
