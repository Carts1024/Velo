import { DemoResult } from "@/app/_components/demo-result";

export const metadata = {
  title: "Payment failed | Velo demo",
  description: "The Velo demo payment could not be completed.",
};

export default function FailedPage() {
  return <DemoResult outcome="failed" />;
}
