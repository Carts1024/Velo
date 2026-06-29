import { CheckoutClient } from "@/features/checkout/checkout-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout — Velo Pay",
  description: "Secure stablecoin checkout page on Stellar network",
};

type CheckoutPageProps = {
  params: Promise<{
    paymentIntentId: string;
  }>;
};

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { paymentIntentId } = await params;

  return <CheckoutClient paymentIntentId={paymentIntentId} />;
}
