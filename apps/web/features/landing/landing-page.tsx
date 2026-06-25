"use client";

import "./landing-page.css";
import { CTASection } from "./sections/cta-section";
import { DeveloperSection } from "./sections/developer-section";
import { FeaturesSection } from "./sections/features-section";
import { FooterSection } from "./sections/footer-section";
import { HeroSection } from "./sections/hero-section";
import { HowItWorksSection } from "./sections/how-it-works-section";

export function LandingPage() {
  return (
    <main className="landing-container flex flex-col min-h-screen">
      {/* Hero section with WebGL dot-matrix background */}
      <HeroSection />

      {/* Feature matrix grids */}
      <FeaturesSection />

      {/* Workflow step timeline */}
      <HowItWorksSection />

      {/* Smart contract developer showcase */}
      <DeveloperSection />

      {/* Conversion footer section */}
      <CTASection />

      {/* Base copyright details */}
      <FooterSection />
    </main>
  );
}
