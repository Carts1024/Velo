import { CancelClient } from "@/features/checkout/cancel-client";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment Cancelled — Velo Pay",
  description: "Your payment checkout session has been cancelled",
};

type CancelPageProps = {
  params: Promise<{
    paymentIntentId: string;
  }>;
};

export default async function CancelPage({ params }: CancelPageProps) {
  const { paymentIntentId } = await params;

  return <CancelClient paymentIntentId={paymentIntentId} />;
}
