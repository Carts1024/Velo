"use client";

import "./styles/globals.css";
import { ThemeProvider } from "next-themes";

import { Toaster } from "./components/ui-customs/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

export default function UiProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
