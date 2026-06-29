import { FailedClient } from "@/features/checkout/failed-client";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment Failed — Velo Pay",
  description: "Your payment checkout session failed",
};

type FailedPageProps = {
  params: Promise<{
    paymentIntentId: string;
  }>;
};

export default async function FailedPage({ params }: FailedPageProps) {
  const { paymentIntentId } = await params;

  return <FailedClient paymentIntentId={paymentIntentId} />;
}
