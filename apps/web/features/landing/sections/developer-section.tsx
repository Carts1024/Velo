"use client";

import { CheckCircle2, Copy, Terminal } from "lucide-react";
import { useState } from "react";

export function DeveloperSection() {
  const [copied, setCopied] = useState(false);
  const codeString = `// Cargo.toml
[dependencies]
soroban-sdk = "22.0.0"

// src/lib.rs
use soroban_sdk::{contract, contractimpl, Env, Symbol};

#[contract]
pub struct TalaKitRegistry;

#[contractimpl]
impl TalaKitRegistry {
    pub fn register_project(
        env: Env, 
        owner: Symbol, 
        hash: Symbol
    ) {
        // Cryptographic ownership validation
        log!(&env, "Verifying owner: {:?}", owner);
    }
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
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
              Developer-First API
            </h2>
            <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-2">
              Built for the Soroban Smart Contract Engine
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed font-light">
              TalaKit integrates directly with standard Soroban SDK pipelines. Write Rust contracts,
              verify them against registry standards, and deploy with confidence.
            </p>

            <ul className="flex flex-col gap-3 font-light text-zinc-300 text-sm mt-2">
              <li className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-sky-400 shrink-0" />
                <span>Strict compatibility with the latest Soroban Rust SDK</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-sky-400 shrink-0" />
                <span>One-line registration validation hooks</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-sky-400 shrink-0" />
                <span>Exportable typescript interfaces for Freighter integration</span>
              </li>
            </ul>
          </div>

          {/* Code Window Mock */}
          <div className="lg:col-span-7 relative">
            {/* Absolute blur background decoration */}
            <div className="absolute inset-0 bg-gradient-to-tr from-violet-600/10 to-sky-400/10 rounded-2xl blur-3xl pointer-events-none z-0" />

            <div className="relative z-10 w-full rounded-xl bg-zinc-950 border border-zinc-800 shadow-2xl overflow-hidden font-mono text-xs">
              {/* IDE Header Bar */}
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-900 select-none">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  <span className="text-[10px] text-zinc-500 ml-3 flex items-center gap-1.5">
                    <Terminal size={12} className="text-zinc-600" />
                    contracts/registry/src/lib.rs
                  </span>
                </div>
                <button
                  onClick={handleCopy}
                  className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Copy snippet"
                >
                  {copied ? (
                    <span className="text-[9px] text-emerald-400 font-sans font-semibold">
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
                  <code>
                    <span className="text-zinc-600">{`// Cargo.toml\n`}</span>
                    <span className="text-sky-400">{`[dependencies]\n`}</span>
                    <span className="text-violet-400">{`soroban-sdk`}</span>
                    {` = `}
                    <span className="text-amber-300">{`"22.0.0"\n\n`}</span>

                    <span className="text-zinc-600">{`// src/lib.rs\n`}</span>
                    <span className="text-sky-400">{`use`}</span>
                    {` soroban_sdk::{contract, contractimpl, Env, Symbol};\n\n`}

                    <span className="text-violet-400">{`#[contract]\n`}</span>
                    <span className="text-sky-400">{`pub struct`}</span>
                    <span className="text-violet-400">{` TalaKitRegistry`}</span>
                    {`;\n\n`}

                    <span className="text-violet-400">{`#[contractimpl]\n`}</span>
                    <span className="text-sky-400">{`impl`}</span>
                    <span className="text-violet-400">{` TalaKitRegistry`}</span>
                    {` {\n`}
                    <span className="text-sky-400">{`    pub fn`}</span>
                    <span className="text-amber-200">{` register_project`}</span>
                    {`(\n        env: Env, \n        owner: Symbol, \n        hash: Symbol\n    ) {\n`}
                    <span className="text-zinc-600">{`        // Cryptographic ownership validation\n`}</span>
                    {`        log!(&env, `}
                    <span className="text-amber-300">{`"Verifying owner: {:?}"`}</span>
                    {`, owner);\n    }\n}`}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
