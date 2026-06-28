"use client";

import Link from "next/link";

export function FooterSection() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-zinc-950 text-zinc-500 py-12 px-6 border-t border-zinc-900">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Logo label */}
        <div className="flex items-center gap-2.5">
          <img src="/icon.png" alt="TalaKit Logo" className="w-6 h-6 rounded-md object-contain" />
          <span className="font-sans font-semibold text-zinc-400 text-sm tracking-tight">
            TalaKit
          </span>
        </div>

        {/* copyright metadata */}
        <div className="text-xs font-light text-zinc-600">
          &copy; {currentYear} TalaKit. All rights reserved. Built for Stellar infrastructure teams.
        </div>

        {/* minimal resource links */}
        <div className="flex items-center gap-6 text-xs text-zinc-500 font-mono">
          <Link href="/dashboard" className="hover:text-zinc-300 transition-colors">
            Dashboard
          </Link>
          <Link href="/debug" className="hover:text-zinc-300 transition-colors">
            Debug
          </Link>
          <Link
            href="https://stellar.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            Stellar
          </Link>
        </div>
      </div>
    </footer>
  );
}
