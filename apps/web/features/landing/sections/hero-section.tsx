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
    <section className="relative flex min-h-[90vh] flex-col justify-between overflow-hidden border-b border-zinc-900 bg-zinc-950 text-zinc-50">
      {/* Background PixelBlast Canvas */}
      <div className="pointer-events-auto absolute inset-0 z-0 opacity-80">
        <PixelBlast
          variant="circle"
          pixelSize={5}
          color="#ffffff"
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
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(to_bottom,transparent_40%,#09090b)]" />

      {/* Header / Mini Nav inside Hero */}
      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <img
            src="/iconv2.png"
            alt="Velo Logo"
            className="h-8 w-8 rounded-lg object-contain shadow-[0_0_15px_rgba(167,139,250,0.3)]"
          />
          <div>
            <span className="font-sans text-lg font-bold tracking-tight text-zinc-100">Velo</span>
          </div>
        </div>

        <nav className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/dashboard"
            className="hidden text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 sm:inline-block"
          >
            Dashboard
          </Link>
          <Link
            href="/debug"
            className="hidden text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 sm:inline-block"
          >
            Debugger
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-semibold text-zinc-300 transition-all hover:bg-zinc-800 sm:px-4 sm:py-1.5"
          >
            Launch Console
          </Link>
        </nav>
      </header>

      {/* Content Area */}
      <div className="relative z-20 mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        {/* Micro-badge */}
        <div className="animate-fade-in mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-xs tracking-wide text-zinc-300 backdrop-blur-md">
          <Terminal size={14} className="text-zinc-400" />
          <span>Project infrastructure + developer tooling for Stellar Testnet</span>
        </div>

        {/* Headings */}
        <h1 className="mb-6 text-4xl leading-none font-bold tracking-tight text-zinc-100 md:text-7xl">
          All-in-one infrastructure <br />
          <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            for building on Stellar
          </span>
        </h1>

        {/* Tagline */}
        <p className="mb-10 max-w-2xl text-lg leading-relaxed font-light text-zinc-400 md:text-xl">
          Ship Stellar apps faster with hosted tools for project setup, contract verification,
          transaction debugging, event monitoring, and upcoming payment infrastructure.
        </p>

        {/* Actions */}
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/dashboard"
            className="group pointer-events-auto flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-sm font-semibold text-zinc-950 shadow-[0_0_25px_rgba(255,255,255,0.15)] transition-all hover:scale-[1.02] hover:bg-zinc-200 sm:w-auto"
          >
            <span>Start Building</span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/debug"
            className="pointer-events-auto w-full rounded-xl border border-zinc-800 bg-zinc-900 px-8 py-4 text-sm font-semibold text-zinc-300 transition-all hover:bg-zinc-800 hover:text-zinc-100 sm:w-auto"
          >
            Debug Infrastructure
          </Link>
        </div>
      </div>

      {/* Alpha scope note */}
      <div className="pointer-events-none relative z-20 pb-8 text-center font-mono text-[10px] tracking-widest text-zinc-600 uppercase select-none">
        Infrastructure roadmap for Stellar builders
      </div>
    </section>
  );
}
