import { SuccessClient } from "@/features/checkout/success-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment Complete — Velo Pay",
  description: "Your payment has been successfully processed",
};

type SuccessPageProps = {
  params: Promise<{
    paymentIntentId: string;
  }>;
};

export default async function SuccessPage({ params }: SuccessPageProps) {
  const { paymentIntentId } = await params;

  return <SuccessClient paymentIntentId={paymentIntentId} />;
}
