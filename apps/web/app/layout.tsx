import { ConvexClientProvider } from "@/core/providers/convex-provider";
import { PwaProvider } from "@/core/providers/pwa-provider";
import { WalletProvider } from "@/core/wallet/wallet-provider";
import UiProviders from "@repo/ui/ui-providers";
import localFont from "next/font/local";

import type { Metadata } from "next";

import "./globals.css";
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://velo.local"),
  title: "Velo",
  description: "Verified developer infrastructure for Stellar apps",
  keywords: ["stellar", "soroban", "developer tools", "verification", "debugging"],
  openGraph: {
    siteName: "Velo",
    title: "Velo",
    description: "Verified developer infrastructure for Stellar apps",
    images: "/banner.png",
    type: "website",
  },
  twitter: {
    title: "Velo",
    description: "Verified developer infrastructure for Stellar apps",
    images: "/banner.png",
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <WalletProvider>
          <ConvexClientProvider>
            <UiProviders>
              <PwaProvider>{children}</PwaProvider>
            </UiProviders>
          </ConvexClientProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
