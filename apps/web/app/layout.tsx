import { ConvexClientProvider } from "@/core/providers/convex-provider";
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
  metadataBase: new URL("https://vercel.com"),
  title: "Next-Tailwind Starter Template",
  description: "Starter Template",
  keywords: ["nextjs", "tailwindcss", "template", "starter", "kit"],
  openGraph: {
    siteName: "Next-Tailwind Starter Template",
    title: "Next-Tailwind Starter Template",
    description: "Starter Template",
    images: "/banner.png",
    type: "website",
  },
  twitter: {
    title: "Next-Tailwind Starter Template",
    description: "Starter Template",
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
    <html lang="en" className="scroll-smooth">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ConvexClientProvider>
          <UiProviders>{children}</UiProviders>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
