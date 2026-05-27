"use client";

import "./styles/globals.css";
import { Toaster } from "./components/ui-customs/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

export default function UiProviders({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
