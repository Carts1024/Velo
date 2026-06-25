"use client";

import { ArrowRight, Terminal } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

import type { PixelBlastProps } from "@repo/ui/components/ui-customs/pixel-blast/PixelBlast";

const PixelBlast = dynamic<PixelBlastProps>(
  () => import("@repo/ui/components/ui-customs/pixel-blast/PixelBlast"),
  { ssr: false },
);

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex flex-col justify-between overflow-hidden bg-zinc-950 text-zinc-50 border-b border-zinc-900">
      {/* Background PixelBlast Canvas */}
      <div className="absolute inset-0 z-0 opacity-80 pointer-events-auto">
        <PixelBlast
          variant="circle"
          pixelSize={5}
          color="#ffffff" // user changed base to white
          patternScale={3.5}
          patternDensity={1.1}
          pixelSizeJitter={0.3}
          enableRipples={true}
          rippleSpeed={0.35}
          rippleThickness={0.1}
          rippleIntensityScale={1.2}
          speed={0.4}
          edgeFade={0.3}
          transparent={true}
        />
      </div>

      {/* Floating Decorative Grid or Glow overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_40%,#09090b)] pointer-events-none z-10" />

      {/* Header / Mini Nav inside Hero */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-3">
          <img
            src="/icon.png"
            alt="TalaKit Logo"
            className="w-8 h-8 rounded-lg shadow-[0_0_15px_rgba(167,139,250,0.3)] object-contain"
          />
          <div>
            <span className="font-sans font-bold tracking-tight text-lg text-zinc-100">
              TalaKit
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/debug"
            className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Debugger
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-1.5 rounded-full text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-all"
          >
            Launch Console
          </Link>
        </nav>
      </header>

      {/* Content Area */}
      <div className="relative z-20 flex-1 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto py-12">
        {/* Micro-badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-300 text-xs font-mono mb-6 tracking-wide backdrop-blur-md animate-fade-in">
          <Terminal size={14} className="text-zinc-400" />
          <span>Verified developer operations on Stellar Testnet</span>
        </div>

        {/* Headings */}
        <h1 className="text-4xl md:text-7xl font-bold tracking-tight text-zinc-100 mb-6 leading-none">
          The All-in-One <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">
            Developer Toolkit
          </span>{" "}
          for Stellar
        </h1>

        {/* Tagline */}
        <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mb-10 leading-relaxed font-light">
          Register official Soroban contracts, debug Testnet transactions, monitor events in
          real-time, and prove cryptographic webhook delivery from one premium workspace.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-8 py-4 rounded-xl text-sm font-semibold bg-white text-zinc-950 hover:bg-zinc-200 hover:scale-[1.02] shadow-[0_0_25px_rgba(255,255,255,0.15)] transition-all flex items-center justify-center gap-2 group pointer-events-auto"
          >
            <span>Open Dashboard</span>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            href="/debug"
            className="w-full sm:w-auto px-8 py-4 rounded-xl text-sm font-semibold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-all pointer-events-auto"
          >
            Debug Transaction
          </Link>
        </div>
      </div>

      {/* Subtle indicator of interactivity */}
      <div className="relative z-20 text-center pb-8 text-zinc-600 font-mono text-[10px] tracking-widest uppercase pointer-events-none select-none">
        Click or drag above to ripple the matrix
      </div>
    </section>
  );
}
